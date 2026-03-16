# Mentions System: @all, @here, @channel + Styled @username

## Overview

Extend Glab's existing mention system to support group mentions (`@all`, `@here`, `@channel`) and add styled, clickable mention pills for all mention types in rendered messages. Mentions must respect the multi-theme system.

## Requirements

1. **@all** — Notifies every member of the channel
2. **@here** — Notifies only members currently online in the channel
3. **@channel** — Alias for @all (same behavior)
4. **@username** — Individual mention (existing, needs rendering upgrade)
5. **Mention pills** — All @mentions render as styled inline pills using theme CSS variables
6. **Clickable** — Clicking @username opens a DM with that user
7. **Autocomplete** — @all, @here, @channel appear in the mention autocomplete dropdown
8. **Mute override** — @all/@here/@channel ignore channel mute settings
9. **No permission restrictions** — Any channel member can use group mentions

## Architecture

### Backend Changes

#### 1. Mention Parsing (`backend/internal/ws/handler.go`)

Expand `parseUserMentions()` to return a richer result:

```go
type MentionResult struct {
    UserIDs    []uuid.UUID  // Individual @username mentions
    HasAll     bool         // @all or @channel found
    HasHere    bool         // @here found
}
```

- Recognize keywords: `@all`, `@here`, `@channel` (case-insensitive)
- Same word-boundary logic already used for @username
- `@channel` sets `HasAll = true` (alias)

#### 2. Group Mention Resolution (`handler.go` — `handleMessageSend`)

After parsing, if `HasAll` or `HasHere`:

1. Fetch channel members: `GetChannelMembers(channelID)`
2. Filter out bot/agent users (`is_bot = true`)
3. If `HasHere`: filter by online status via `PresenceService.GetOnlineUsers()`
   - Note: `GetOnlineUsers()` returns `map[string]string` (userID string → status). Channel member UUIDs (`pgtype.UUID`) must be converted via `uuidToString()` before intersecting.
   - **@here creates mention records for ALL non-bot members** (so offline users see the mention when they return), but only sends real-time WS notifications to online members.
4. Exclude the message sender from the notification list
5. Merge with individual `UserIDs` (deduplicate)
6. **Run in a goroutine** to avoid blocking message delivery for large channels
7. For each target user:
   - Create `mentions` table record (same as individual mentions)
   - Send `EventNotification` via `hub.SendToUser()` (only if online, for @here)
   - **Ignore `muted` flag** on channel_members

#### 3. Mention Type Tracking

Add a `mention_type` column to distinguish group vs individual mentions (for future analytics/filtering):

```sql
-- New migration
ALTER TABLE mentions ADD COLUMN mention_type VARCHAR(10) NOT NULL DEFAULT 'user';
-- Values: 'user', 'all', 'here'
```

Update `CreateMention` query to accept `mention_type` parameter.

#### 4. Reserved Keyword Validation

Prevent the keywords `all`, `here`, `channel` from being used as:
- **User usernames** — Add a SQL CHECK constraint on `users.username` (no user registration endpoint exists; users are created via migration CLI or direct DB ops, so a DB-level constraint is the safest approach)
- **Agent slugs** — Add validation in `backend/internal/handler/agent.go` when creating/updating agents

```sql
-- In the migration file, alongside mention_type:
ALTER TABLE users ADD CONSTRAINT chk_username_not_reserved
  CHECK (username NOT IN ('all', 'here', 'channel'));
ALTER TABLE agents ADD CONSTRAINT chk_slug_not_reserved
  CHECK (slug NOT IN ('all', 'here', 'channel'));
```

### Frontend Changes

#### 5. Autocomplete (`MentionAutocomplete.tsx`)

Add special entries at the top of the dropdown when query is empty or matches:

```
@all      Notify all in this room
@here     Notify active in this room
@channel  Notify all in this room
---
@gabriel  Gabriel Silva
@maria    Maria Santos
...
```

- Special entries have distinct icon (megaphone or broadcast icon)
- Separator between special and user entries
- Filter special entries by query match (e.g., typing "he" shows @here)

#### 6. Message Rendering — Mention Pills

Create a `MentionText` component that parses message content and replaces @mentions with styled pills.

**Parsing strategy:**
- Regex: `@(all|here|channel|\w+)` applied to message text segments (between non-word chars)
- Aligns with backend's word-boundary parsing (split on spaces, trim punctuation)
- For `@username`: validate against known user list to avoid false positives
- Wrap matches in `<span>` or `<button>` elements

**Styling (theme-aware via CSS variables):**

```tsx
// Base mention pill classes
const mentionClasses = `
  inline-flex items-center
  bg-accent-primary-subtle text-accent-primary-subtle-text
  hover:brightness-110
  px-0.5 rounded font-medium text-[0.9em]
  transition-colors
`;

// @username: clickable → cursor-pointer
// @all/@here/@channel: not clickable → cursor-default
```

Theme rendering per theme:
| Theme | Pill Background | Pill Text |
|-------|----------------|-----------|
| Geovendas Dark | teal at 15% opacity | teal |
| Classic Dark | indigo at 20% opacity | light indigo |
| Light | teal at 10% opacity | dark teal |
| Dracula | purple at 18% opacity | purple |

All using existing `--accent-primary-subtle` and `--accent-primary-subtle-text` CSS variables.

#### 7. Click Behavior

- **@username click** → Navigate to DM channel with that user. If DM doesn't exist, create it via existing DM creation flow.
- **@all/@here/@channel click** → No action (cursor: default)

#### 8. Integration Point — Message Component

The `MentionText` component replaces raw text rendering in the message bubble. It must work alongside existing markdown/emoji rendering.

Integration point: `renderContent()` inside `frontend/src/components/chat/MessageItem.tsx` (around line 255), where `renderWithCustomEmojis(message.content)` is called. The `MentionText` component should wrap or compose with `renderWithCustomEmojis` in the same rendering pipeline.

### Database Changes

#### Migration: `XXXXXX_add_mention_type.up.sql`

```sql
ALTER TABLE mentions ADD COLUMN mention_type VARCHAR(10) NOT NULL DEFAULT 'user';
```

#### Migration: `XXXXXX_add_mention_type.down.sql`

```sql
ALTER TABLE mentions DROP COLUMN mention_type;
```

#### Updated sqlc query: `CreateMention`

Keep as `:exec` (current pattern — callers discard return value, Postgres auto-generates UUID):

```sql
-- name: CreateMention :exec
INSERT INTO mentions (message_id, user_id, channel_id, mention_type)
VALUES ($1, $2, $3, $4);
```

No backfill needed — all existing mention records are individual user mentions and correctly default to `'user'`.

## Data Flow

### Sending @all message

```
User types "@all check this" → Send via WS
  → Backend parseUserMentions() → MentionResult{HasAll: true}
  → BroadcastToChannel(channelID, message_envelope) — immediate
  → goroutine:
      → GetChannelMembers(channelID) → [user1, user2, user3, ...]
      → Filter out is_bot = true
      → Exclude sender
      → Deduplicate with individual UserIDs
      → For each member:
          → CreateMention(msg_id, user_id, channel_id, 'all')
          → SendToUser(user_id, notification_envelope)
```

### Sending @here message

```
Same as @all, but inside the goroutine after filtering bots:
  → GetOnlineUsers() from Redis (map[string]string)
  → Convert member UUIDs to strings via uuidToString()
  → CreateMention for ALL non-bot members (mention_type='here')
  → SendToUser only for members present in GetOnlineUsers() map
```

### Rendering mentions

```
Message content: "Hey @all and @gabriel check this"
  → MentionText parser splits into segments:
      ["Hey ", <MentionPill type="all" />, " and ", <MentionPill type="user" user={gabriel} />, " check this"]
  → Each MentionPill renders with theme-aware styles
  → @gabriel pill is clickable → navigates to DM
```

## Edge Cases

1. **Sender excluded** — User who sends @all does not notify themselves
2. **Duplicate mentions** — If message has both @all and @gabriel, gabriel gets one notification (deduplicate)
3. **Offline users with @here** — Get a mention record (mention_type='here') so they see the unread mention badge when they come back, but do NOT receive a real-time WS notification
4. **Bot/agent users** — Excluded from @all/@here notifications (they're not human)
5. **Reserved usernames** — Prevent registration of `all`, `here`, `channel` as usernames
6. **Large channels** — Batch notification creation to avoid blocking the message send handler

## Testing Strategy

1. **Backend unit tests:**
   - `parseUserMentions()` with @all, @here, @channel keywords
   - Deduplication logic
   - Mute override behavior
   - Bot exclusion

2. **Frontend component tests:**
   - MentionText parsing with mixed mentions
   - Autocomplete showing special entries
   - Click navigation to DM

3. **Integration test:**
   - Send message with @all → verify all members get mention records
   - Send message with @here → verify only online members get mention records

## Files to Modify

### Backend
- `backend/internal/ws/handler.go` — Parsing + notification logic
- `backend/internal/repository/queries/mentions.sql` — Updated CreateMention query
- `backend/internal/repository/queries/channel_members.sql` — May need query for non-bot members
- `backend/migrations/XXXXXX_add_mention_type.{up,down}.sql` — New migration
- `backend/sqlc.yaml` — Regenerate after query changes

### Frontend
- `frontend/src/components/chat/MentionAutocomplete.tsx` — Add special entries
- `frontend/src/components/chat/MessageInput.tsx` — Minor adjustments for keyword insertion
- New: `frontend/src/components/chat/MentionText.tsx` — Mention pill renderer
- `frontend/src/components/chat/MessageItem.tsx` — Integrate MentionText into `renderContent()` pipeline
- `backend/internal/handler/agent.go` — Reserved slug validation

### No CSS file changes needed
All styling uses existing theme CSS variables via Tailwind utility classes.
