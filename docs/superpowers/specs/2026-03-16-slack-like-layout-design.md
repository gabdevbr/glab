# Slack-Like Layout Redesign

## Problem
Current layout has tight spacing, squeezed messages, inconsistent padding, and lacks professional chat UX patterns found in Slack.

## Design

### Layout Structure (3-zone)
- **Sidebar**: 260px fixed, collapsible sections, workspace header
- **Chat Area**: flex-1 (min-width ~480px implicit), proper message spacing
- **Right Panel**: 400px for thread/pinned/search (optional)

### Changes by Component

#### 1. Sidebar (`w-60` → `w-[260px]`)
- Workspace header: org name bold + user avatar/status
- Section headers: collapsible chevron + uppercase label, `py-2 px-4`
- Channel items: `py-1.5 px-5` (was `py-1 px-3`), active = `bg-slate-700/70` + white text + left accent
- Unread: bold white text + badge
- DM items: larger presence dots (size-2.5), more padding
- Bottom: user section with status

#### 2. Channel Header (1-row → 2-row)
- Row 1: `#channel` bold 15px + action icons (pin, search, members)
- Row 2: topic in muted text
- Padding: `px-5 py-3` (was `px-4 py-2.5`)
- Icons: `size-4` with proper spacing, hover backgrounds

#### 3. MessageItem — Spacing Overhaul
- **Non-compact (group start)**: `pt-5 pb-1 px-5` with 36px avatar + name + time
- **Compact (continuation)**: `py-[3px] pl-[52px] pr-5` — aligned with text, no avatar
- Compact hover: show time ghost in left gutter
- Avatar: `size-9` (36px) — unchanged but with better color generation
- Name + time line: `gap-2`, time in `text-[11px]`
- Action bar: better positioned, `gap-0.5`, rounded-lg

#### 4. MessageInput — Rich Editor Feel
- Outer container: `mx-5 mb-5` with `rounded-xl border border-slate-700 bg-slate-800`
- Textarea inside: no border, transparent bg, `px-4 py-3`
- Bottom toolbar row: file attach + formatting hints + send button
- Placeholder: `Message #channel-name`
- Min height 44px, grows to 200px

#### 5. TypingIndicator
- `h-6 px-5` — match new message padding
- Smaller, inline with input area

#### 6. ThreadPanel (`w-80` → `w-[400px]`)
- Header: "Thread" + reply count + close button, `px-4 py-3`
- Separator between parent and replies: "X replies" divider
- Footer input: same rich-editor style as main input

#### 7. PinnedMessages & SearchResults (`w-80` → `w-[400px]`)
- Same panel width increase
- Better padding consistency

#### 8. StreamingMessage
- Match new non-compact message spacing

### Files Modified
1. `frontend/src/components/sidebar/Sidebar.tsx`
2. `frontend/src/components/sidebar/ChannelList.tsx`
3. `frontend/src/components/sidebar/DMList.tsx`
4. `frontend/src/app/(chat)/channel/[id]/page.tsx`
5. `frontend/src/components/chat/MessageItem.tsx`
6. `frontend/src/components/chat/MessageList.tsx`
7. `frontend/src/components/chat/MessageInput.tsx`
8. `frontend/src/components/chat/TypingIndicator.tsx`
9. `frontend/src/components/chat/ThreadPanel.tsx`
10. `frontend/src/components/chat/PinnedMessages.tsx`
11. `frontend/src/components/chat/SearchResults.tsx`
12. `frontend/src/components/chat/StreamingMessage.tsx`
