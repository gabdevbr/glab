package handler

import (
	"log/slog"
	"net/http"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/gabdevbr/glab/backend/internal/auth"
	"github.com/gabdevbr/glab/backend/internal/repository"
	"github.com/gabdevbr/glab/backend/internal/ws"
)

// ChannelHandler handles channel endpoints.
type ChannelHandler struct {
	queries *repository.Queries
	hub     *ws.Hub
}

// NewChannelHandler creates a ChannelHandler.
func NewChannelHandler(q *repository.Queries, hub *ws.Hub) *ChannelHandler {
	return &ChannelHandler{queries: q, hub: hub}
}

// generateSlug creates a URL-friendly slug from a channel name.
func generateSlug(name string) string {
	slug := strings.ToLower(name)
	slug = regexp.MustCompile(`[^a-z0-9\s-]`).ReplaceAllString(slug, "")
	slug = regexp.MustCompile(`[\s]+`).ReplaceAllString(slug, "-")
	slug = strings.Trim(slug, "-")
	return slug
}

// List handles GET /api/v1/channels.
func (h *ChannelHandler) List(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	uid, err := parseUUID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "invalid user id in token")
		return
	}

	// Get user's auto-hide preference
	autoHideDays, _ := h.queries.GetAutoHideDays(r.Context(), uid)

	channels, err := h.queries.ListChannelsForUser(r.Context(), repository.ListChannelsForUserParams{
		UserID:  uid,
		Column2: autoHideDays,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to list channels")
		return
	}

	// For DM channels, resolve the other participant's display name and user ID.
	type dmInfo struct {
		DisplayName string
		UserID      string
	}
	dmInfoMap := make(map[string]dmInfo) // channel_id -> info
	dmRows, err := h.queries.GetDMDisplayNames(r.Context(), uid)
	if err == nil {
		for _, row := range dmRows {
			dmInfoMap[uuidToString(row.ChannelID)] = dmInfo{
				DisplayName: row.DisplayName,
				UserID:      uuidToString(row.OtherUserID),
			}
		}
	}

	items := make([]ChannelResponse, 0, len(channels))
	for _, c := range channels {
		resp := channelRowToResponse(c)
		if c.Type == "dm" {
			if info, ok := dmInfoMap[resp.ID]; ok {
				resp.Name = info.DisplayName
				resp.DMUserID = info.UserID
			} else {
				// DM with no resolvable other member — skip it
				continue
			}
		}
		items = append(items, resp)
	}

	respondJSON(w, http.StatusOK, items)
}

// Browse handles GET /api/v1/channels/browse — returns all public channels.
func (h *ChannelHandler) Browse(w http.ResponseWriter, r *http.Request) {
	channels, err := h.queries.ListPublicChannels(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to list public channels")
		return
	}

	items := make([]ChannelResponse, len(channels))
	for i, c := range channels {
		items[i] = channelToResponse(c)
	}

	respondJSON(w, http.StatusOK, items)
}

// Create handles POST /api/v1/channels.
func (h *ChannelHandler) Create(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Type        string `json:"type"`
		ReadOnly    bool   `json:"read_only"`
		MemberID    string `json:"member_id"` // target user ID for DM creation
	}
	if err := parseBody(r, &body); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Type == "" {
		body.Type = "public"
	}
	if body.Type != "public" && body.Type != "private" && body.Type != "dm" {
		respondError(w, http.StatusBadRequest, "type must be public, private or dm")
		return
	}

	creatorUID, err := parseUUID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "invalid user id in token")
		return
	}

	// DM channel creation
	if body.Type == "dm" {
		if body.MemberID == "" {
			respondError(w, http.StatusBadRequest, "member_id is required for DM channels")
			return
		}
		targetUID, err := parseUUID(body.MemberID)
		if err != nil {
			respondError(w, http.StatusBadRequest, "invalid member_id")
			return
		}

		// Check if DM already exists
		existing, err := h.queries.GetDMChannel(r.Context(), repository.GetDMChannelParams{
			UserID:   creatorUID,
			UserID_2: targetUID,
		})
		if err == nil {
			// DM already exists — unhide it for both users, then return it
			_ = h.queries.UnhideChannel(r.Context(), repository.UnhideChannelParams{
				ChannelID: existing.ID,
				UserID:    creatorUID,
			})
			_ = h.queries.UnhideChannel(r.Context(), repository.UnhideChannelParams{
				ChannelID: existing.ID,
				UserID:    targetUID,
			})
			resp := channelToResponse(existing)
			resp.DMUserID = body.MemberID
			respondJSON(w, http.StatusOK, resp)
			return
		}

		// Look up target user for the channel name
		targetUser, err := h.queries.GetUserByID(r.Context(), targetUID)
		if err != nil {
			respondError(w, http.StatusBadRequest, "target user not found")
			return
		}

		dmName := targetUser.DisplayName
		if dmName == "" {
			dmName = targetUser.Username
		}

		// Use both user IDs in the slug to guarantee uniqueness for DMs
		dmSlug := "dm-" + uuidToString(creatorUID) + "-" + uuidToString(targetUID)

		channel, err := h.queries.CreateChannel(r.Context(), repository.CreateChannelParams{
			Name:      dmName,
			Slug:      dmSlug,
			Type:      "dm",
			CreatedBy: creatorUID,
		})
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to create DM channel")
			return
		}

		// Add both users as members
		_ = h.queries.AddChannelMember(r.Context(), repository.AddChannelMemberParams{
			ChannelID: channel.ID,
			UserID:    creatorUID,
			Role:      "owner",
		})
		_ = h.queries.AddChannelMember(r.Context(), repository.AddChannelMemberParams{
			ChannelID: channel.ID,
			UserID:    targetUID,
			Role:      "member",
		})

		resp := channelToResponse(channel)
		resp.MemberCount = 2
		resp.DMUserID = body.MemberID
		respondJSON(w, http.StatusCreated, resp)

		// Notify the target user via WebSocket so their sidebar updates and they auto-subscribe.
		h.notifyDMCreated(channel, claims.UserID, body.MemberID)
		return
	}

	// Regular channel creation
	if body.Name == "" {
		respondError(w, http.StatusBadRequest, "name is required")
		return
	}

	slug := generateSlug(body.Name)

	channel, err := h.queries.CreateChannel(r.Context(), repository.CreateChannelParams{
		Name:        body.Name,
		Slug:        slug,
		Description: pgtype.Text{String: body.Description, Valid: body.Description != ""},
		Type:        body.Type,
		CreatedBy:   creatorUID,
		ReadOnly:    body.ReadOnly,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create channel")
		return
	}

	// Add creator as owner member
	_ = h.queries.AddChannelMember(r.Context(), repository.AddChannelMemberParams{
		ChannelID: channel.ID,
		UserID:    creatorUID,
		Role:      "owner",
	})

	resp := channelToResponse(channel)
	resp.MemberCount = 1
	respondJSON(w, http.StatusCreated, resp)
}

// GetByID handles GET /api/v1/channels/{id}.
func (h *ChannelHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := chi.URLParam(r, "id")
	cid, err := parseUUID(id)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	// Check membership for private/dm channels
	if status, err := requireChannelMember(r.Context(), h.queries, cid, claims.UserID); err != nil {
		respondError(w, status, err.Error())
		return
	}

	channel, err := h.queries.GetChannelByID(r.Context(), cid)
	if err != nil {
		respondError(w, http.StatusNotFound, "channel not found")
		return
	}

	members, err := h.queries.GetChannelMembers(r.Context(), cid)
	if err != nil {
		members = nil
	}

	resp := channelToResponse(channel)
	resp.MemberCount = len(members)
	respondJSON(w, http.StatusOK, resp)
}

// Update handles PATCH /api/v1/channels/{id}.
func (h *ChannelHandler) Update(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := chi.URLParam(r, "id")
	cid, err := parseUUID(id)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	// Check permissions: must be channel owner or admin
	if claims.Role != "admin" {
		if err := h.requireChannelRole(r, cid, claims.UserID, "owner"); err != nil {
			respondError(w, http.StatusForbidden, "forbidden")
			return
		}
	}

	var body struct {
		Name          *string `json:"name"`
		Description   *string `json:"description"`
		Topic         *string `json:"topic"`
		IsArchived    *bool   `json:"is_archived"`
		ReadOnly      *bool   `json:"read_only"`
		RetentionDays *int32  `json:"retention_days"`
	}
	if err := parseBody(r, &body); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	params := repository.UpdateChannelParams{ID: cid}
	if body.Name != nil {
		params.Name = pgtype.Text{String: *body.Name, Valid: true}
	}
	if body.Description != nil {
		params.Description = pgtype.Text{String: *body.Description, Valid: true}
	}
	if body.Topic != nil {
		params.Topic = pgtype.Text{String: *body.Topic, Valid: true}
	}
	if body.IsArchived != nil {
		params.IsArchived = pgtype.Bool{Bool: *body.IsArchived, Valid: true}
	}
	if body.ReadOnly != nil {
		params.ReadOnly = pgtype.Bool{Bool: *body.ReadOnly, Valid: true}
	}
	if body.RetentionDays != nil {
		params.RetentionDays = pgtype.Int4{Int32: *body.RetentionDays, Valid: true}
	}

	channel, err := h.queries.UpdateChannel(r.Context(), params)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update channel")
		return
	}

	respondJSON(w, http.StatusOK, channelToResponse(channel))
}

// Delete handles DELETE /api/v1/channels/{id}.
func (h *ChannelHandler) Delete(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := chi.URLParam(r, "id")
	cid, err := parseUUID(id)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	// Must be owner or admin
	if claims.Role != "admin" {
		if err := h.requireChannelRole(r, cid, claims.UserID, "owner"); err != nil {
			respondError(w, http.StatusForbidden, "forbidden")
			return
		}
	}

	if err := h.queries.DeleteChannel(r.Context(), cid); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to delete channel")
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// Join handles POST /api/v1/channels/{id}/join.
func (h *ChannelHandler) Join(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := chi.URLParam(r, "id")
	cid, err := parseUUID(id)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	channel, err := h.queries.GetChannelByID(r.Context(), cid)
	if err != nil {
		respondError(w, http.StatusNotFound, "channel not found")
		return
	}

	if channel.Type != "public" {
		respondError(w, http.StatusForbidden, "can only join public channels")
		return
	}

	uid, err := parseUUID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "invalid user id in token")
		return
	}

	if err := h.queries.AddChannelMember(r.Context(), repository.AddChannelMemberParams{
		ChannelID: cid,
		UserID:    uid,
		Role:      "member",
	}); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to join channel")
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// Leave handles POST /api/v1/channels/{id}/leave.
func (h *ChannelHandler) Leave(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := chi.URLParam(r, "id")
	cid, err := parseUUID(id)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	uid, err := parseUUID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "invalid user id in token")
		return
	}

	if err := h.queries.RemoveChannelMember(r.Context(), repository.RemoveChannelMemberParams{
		ChannelID: cid,
		UserID:    uid,
	}); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to leave channel")
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// AddMember handles POST /api/v1/channels/{id}/members.
func (h *ChannelHandler) AddMember(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := chi.URLParam(r, "id")
	cid, err := parseUUID(id)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	// Must be channel admin/owner or system admin
	if claims.Role != "admin" {
		if err := h.requireChannelRole(r, cid, claims.UserID, "owner", "admin"); err != nil {
			respondError(w, http.StatusForbidden, "forbidden")
			return
		}
	}

	var body struct {
		UserID string `json:"user_id"`
	}
	if err := parseBody(r, &body); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	memberUID, err := parseUUID(body.UserID)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid user_id")
		return
	}

	if err := h.queries.AddChannelMember(r.Context(), repository.AddChannelMemberParams{
		ChannelID: cid,
		UserID:    memberUID,
		Role:      "member",
	}); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to add member")
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// RemoveMember handles DELETE /api/v1/channels/{id}/members/{uid}.
func (h *ChannelHandler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := chi.URLParam(r, "id")
	cid, err := parseUUID(id)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	// Must be channel admin/owner or system admin
	if claims.Role != "admin" {
		if err := h.requireChannelRole(r, cid, claims.UserID, "owner", "admin"); err != nil {
			respondError(w, http.StatusForbidden, "forbidden")
			return
		}
	}

	memberIDStr := chi.URLParam(r, "uid")
	memberUID, err := parseUUID(memberIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid member id")
		return
	}

	if err := h.queries.RemoveChannelMember(r.Context(), repository.RemoveChannelMemberParams{
		ChannelID: cid,
		UserID:    memberUID,
	}); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to remove member")
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// requireChannelRole checks that the user has one of the allowed roles in the channel.
func (h *ChannelHandler) requireChannelRole(r *http.Request, channelID pgtype.UUID, userIDStr string, allowedRoles ...string) error {
	uid, err := parseUUID(userIDStr)
	if err != nil {
		return err
	}

	member, err := h.queries.GetChannelMember(r.Context(), repository.GetChannelMemberParams{
		ChannelID: channelID,
		UserID:    uid,
	})
	if err != nil {
		return err
	}

	for _, role := range allowedRoles {
		if member.Role == role {
			return nil
		}
	}

	return errForbidden
}

// HideChannel handles PATCH /api/v1/channels/{id}/hide.
func (h *ChannelHandler) HideChannel(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := chi.URLParam(r, "id")
	cid, err := parseUUID(id)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	uid, err := parseUUID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "invalid user id")
		return
	}

	var body struct {
		Hidden bool `json:"hidden"`
	}
	if err := parseBody(r, &body); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.queries.SetChannelHidden(r.Context(), repository.SetChannelHiddenParams{
		ChannelID: cid,
		UserID:    uid,
		Hidden:    body.Hidden,
	}); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update hidden status")
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// HideAllChannels handles POST /api/v1/channels/hide-all.
func (h *ChannelHandler) HideAllChannels(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	uid, err := parseUUID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "invalid user id")
		return
	}

	if err := h.queries.HideAllChannelsForUser(r.Context(), uid); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to hide all channels")
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ListHidden handles GET /api/v1/channels/hidden.
func (h *ChannelHandler) ListHidden(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	uid, err := parseUUID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "invalid user id")
		return
	}

	channels, err := h.queries.ListHiddenChannelsForUser(r.Context(), uid)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to list hidden channels")
		return
	}

	items := make([]ChannelResponse, len(channels))
	for i, c := range channels {
		items[i] = channelToResponse(c)
	}

	respondJSON(w, http.StatusOK, items)
}

// MarkAllRead handles POST /api/v1/channels/mark-all-read.
func (h *ChannelHandler) MarkAllRead(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	userUUID, err := parseUUID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	if err := h.queries.MarkAllRead(r.Context(), userUUID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to mark all read")
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// PinChannel handles PATCH /api/v1/channels/{id}/pin.
func (h *ChannelHandler) PinChannel(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	if claims == nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	channelID, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	userUUID, err := parseUUID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	var body struct {
		Pinned bool `json:"pinned"`
	}
	if err := parseBody(r, &body); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if body.Pinned {
		err = h.queries.PinChannel(r.Context(), repository.PinChannelParams{
			ChannelID: channelID,
			UserID:    userUUID,
		})
	} else {
		err = h.queries.UnpinChannel(r.Context(), repository.UnpinChannelParams{
			ChannelID: channelID,
			UserID:    userUUID,
		})
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update pin state")
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// notifyDMCreated sends a channel.new WebSocket event to the target user and auto-subscribes them.
func (h *ChannelHandler) notifyDMCreated(channel repository.Channel, creatorID, targetID string) {
	channelID := uuidToString(channel.ID)

	// Send channel.new event to the target user so their sidebar updates.
	env, err := ws.MakeEnvelope(ws.EventChannelNew, ws.ChannelNewPayload{
		ID:          channelID,
		Name:        channel.Name,
		Slug:        channel.Slug,
		Type:        channel.Type,
		CreatedBy:   uuidToString(channel.CreatedBy),
		DMUserID:    creatorID,
		MemberCount: 2,
		CreatedAt:   timestampToString(channel.CreatedAt),
	})
	if err != nil {
		slog.Error("channel: failed to make channel.new envelope", "error", err)
		return
	}
	h.hub.SendToUser(targetID, env)

	// Auto-subscribe both users so messages flow immediately.
	h.hub.SubscribeUser(creatorID, []string{channelID})
	h.hub.SubscribeUser(targetID, []string{channelID})
}

// sentinel error for permission checks
type forbiddenError struct{}

func (forbiddenError) Error() string { return "forbidden" }

var errForbidden error = forbiddenError{}
