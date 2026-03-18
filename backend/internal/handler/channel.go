package handler

import (
	"net/http"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/gabdevbr/glab/backend/internal/auth"
	"github.com/gabdevbr/glab/backend/internal/repository"
)

// ChannelHandler handles channel endpoints.
type ChannelHandler struct {
	queries *repository.Queries
}

// NewChannelHandler creates a ChannelHandler.
func NewChannelHandler(q *repository.Queries) *ChannelHandler {
	return &ChannelHandler{queries: q}
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

	// For DM channels, resolve the other participant's display name.
	dmNames := make(map[string]string) // channel_id -> other user's display_name
	dmRows, err := h.queries.GetDMDisplayNames(r.Context(), uid)
	if err == nil {
		for _, row := range dmRows {
			dmNames[uuidToString(row.ChannelID)] = row.DisplayName
		}
	}

	items := make([]ChannelResponse, 0, len(channels))
	for _, c := range channels {
		resp := channelToResponse(c)
		if c.Type == "dm" {
			if name, ok := dmNames[resp.ID]; ok {
				resp.Name = name
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
	}
	if err := parseBody(r, &body); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Name == "" {
		respondError(w, http.StatusBadRequest, "name is required")
		return
	}
	if body.Type == "" {
		body.Type = "public"
	}
	if body.Type != "public" && body.Type != "private" {
		respondError(w, http.StatusBadRequest, "type must be public or private")
		return
	}

	creatorUID, err := parseUUID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "invalid user id in token")
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

// sentinel error for permission checks
type forbiddenError struct{}

func (forbiddenError) Error() string { return "forbidden" }

var errForbidden error = forbiddenError{}
