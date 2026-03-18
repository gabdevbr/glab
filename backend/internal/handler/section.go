package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/gabdevbr/glab/backend/internal/auth"
	"github.com/gabdevbr/glab/backend/internal/repository"
)

// SectionHandler handles sidebar section endpoints.
type SectionHandler struct {
	queries *repository.Queries
}

// NewSectionHandler creates a SectionHandler.
func NewSectionHandler(q *repository.Queries) *SectionHandler {
	return &SectionHandler{queries: q}
}

// List handles GET /api/v1/sections — returns user's sidebar sections with channel IDs.
func (h *SectionHandler) List(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	userID, err := parseUUID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "invalid user")
		return
	}

	sections, err := h.queries.ListSidebarSections(r.Context(), userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to list sections")
		return
	}

	// Get channel→section mappings
	mappings, err := h.queries.GetChannelSectionsForUser(r.Context(), userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to get channel sections")
		return
	}

	// Build section_id → []channel_id map
	sectionChannels := make(map[string][]string)
	for _, m := range mappings {
		sid := uuidToString(m.SectionID)
		cid := uuidToString(m.ChannelID)
		sectionChannels[sid] = append(sectionChannels[sid], cid)
	}

	var result []SectionResponse
	for _, s := range sections {
		sid := uuidToString(s.ID)
		channelIDs := sectionChannels[sid]
		if channelIDs == nil {
			channelIDs = []string{}
		}
		result = append(result, SectionResponse{
			ID:         sid,
			Name:       s.Name,
			Position:   s.Position,
			ChannelIDs: channelIDs,
		})
	}

	if result == nil {
		result = []SectionResponse{}
	}

	respondJSON(w, http.StatusOK, result)
}

// Create handles POST /api/v1/sections — creates a new sidebar section.
func (h *SectionHandler) Create(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	userID, err := parseUUID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "invalid user")
		return
	}

	var body struct {
		Name string `json:"name"`
	}
	if err := parseBody(r, &body); err != nil {
		respondError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if body.Name == "" {
		respondError(w, http.StatusBadRequest, "name is required")
		return
	}

	section, err := h.queries.CreateSidebarSection(r.Context(), repository.CreateSidebarSectionParams{
		UserID: userID,
		Name:   body.Name,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create section")
		return
	}

	respondJSON(w, http.StatusCreated, SectionResponse{
		ID:         uuidToString(section.ID),
		Name:       section.Name,
		Position:   section.Position,
		ChannelIDs: []string{},
	})
}

// Update handles PATCH /api/v1/sections/{id} — renames a section.
func (h *SectionHandler) Update(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	userID, err := parseUUID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "invalid user")
		return
	}

	sectionID, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid section id")
		return
	}

	var body struct {
		Name string `json:"name"`
	}
	if err := parseBody(r, &body); err != nil {
		respondError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if body.Name == "" {
		respondError(w, http.StatusBadRequest, "name is required")
		return
	}

	err = h.queries.UpdateSidebarSection(r.Context(), repository.UpdateSidebarSectionParams{
		ID:     sectionID,
		Name:   body.Name,
		UserID: userID,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update section")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Delete handles DELETE /api/v1/sections/{id} — deletes a section (channels go back to defaults).
func (h *SectionHandler) Delete(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	userID, err := parseUUID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "invalid user")
		return
	}

	sectionID, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid section id")
		return
	}

	err = h.queries.DeleteSidebarSection(r.Context(), repository.DeleteSidebarSectionParams{
		ID:     sectionID,
		UserID: userID,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to delete section")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Reorder handles PUT /api/v1/sections/reorder — sets position for all sections.
func (h *SectionHandler) Reorder(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	userID, err := parseUUID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "invalid user")
		return
	}

	var body struct {
		SectionIDs []string `json:"section_ids"`
	}
	if err := parseBody(r, &body); err != nil {
		respondError(w, http.StatusBadRequest, "invalid body")
		return
	}

	for i, sid := range body.SectionIDs {
		sectionUUID, err := parseUUID(sid)
		if err != nil {
			respondError(w, http.StatusBadRequest, "invalid section id: "+sid)
			return
		}
		err = h.queries.UpdateSidebarSectionPosition(r.Context(), repository.UpdateSidebarSectionPositionParams{
			ID:       sectionUUID,
			Position: int32(i),
			UserID:   userID,
		})
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to reorder sections")
			return
		}
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// MoveChannel handles PATCH /api/v1/sections/move-channel — moves a channel to a section (or removes from section).
func (h *SectionHandler) MoveChannel(w http.ResponseWriter, r *http.Request) {
	claims := auth.UserFromContext(r.Context())
	userID, err := parseUUID(claims.UserID)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "invalid user")
		return
	}

	var body struct {
		ChannelID string  `json:"channel_id"`
		SectionID *string `json:"section_id"` // null = remove from section
	}
	if err := parseBody(r, &body); err != nil {
		respondError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if body.ChannelID == "" {
		respondError(w, http.StatusBadRequest, "channel_id is required")
		return
	}

	channelUUID, err := parseUUID(body.ChannelID)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid channel_id")
		return
	}

	if body.SectionID == nil || *body.SectionID == "" {
		// Remove from section
		err = h.queries.ClearChannelSection(r.Context(), repository.ClearChannelSectionParams{
			ChannelID: channelUUID,
			UserID:    userID,
		})
	} else {
		sectionUUID, err2 := parseUUID(*body.SectionID)
		if err2 != nil {
			respondError(w, http.StatusBadRequest, "invalid section_id")
			return
		}
		err = h.queries.SetChannelSection(r.Context(), repository.SetChannelSectionParams{
			ChannelID: channelUUID,
			UserID:    userID,
			SectionID: sectionUUID,
		})
	}

	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to move channel")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
