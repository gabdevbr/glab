'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useSectionStore } from '@/stores/sectionStore';
import { useChannelStore } from '@/stores/channelStore';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ChannelList } from './ChannelList';
import { DMList } from './DMList';
import { AgentList } from './AgentList';
import { CreateChannelDialog } from './CreateChannelDialog';
import { NewDMDialog } from './NewDMDialog';
import { ProfileModal } from './ProfileModal';
import { SidebarSection } from './SidebarSection';
import { SectionChannelList } from './SectionChannelList';
import { LogOut, Bot, Settings, ChevronDown, ChevronRight, Search, LayoutDashboard, Users, Hash, MessageCircle, ArrowLeftRight, Key, Bug, Bell, Plus, Pencil, Trash2, CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { usePresenceStore } from '@/stores/presenceStore';
import { wsClient } from '@/lib/ws';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/+$/, '');

function UnreadSection() {
  const router = useRouter();
  const channels = useChannelStore((s) => s.channels);
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const unreadCounts = useChannelStore((s) => s.unreadCounts);
  const markAllRead = useChannelStore((s) => s.markAllRead);

  const unreadChannels = channels
    .filter((c) => (unreadCounts[c.id] || 0) > 0)
    .sort((a, b) => (unreadCounts[b.id] || 0) - (unreadCounts[a.id] || 0));

  if (unreadChannels.length === 0) return null;

  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center gap-1 px-3 py-1">
        <Bell className="size-3 text-accent-primary" />
        <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-accent-primary">
          Unreads
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            markAllRead();
          }}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-sidebar-hover transition-colors"
          title="Mark all as read"
        >
          <CheckCheck className="size-3.5" />
        </button>
      </div>
      <ul className="space-y-0.5">
        {unreadChannels.map((channel) => {
          const unread = unreadCounts[channel.id] || 0;
          const isActive = activeChannelId === channel.id;
          const isDM = channel.type === 'dm';
          return (
            <li key={channel.id}>
              <button
                onClick={() => {
                  setActiveChannel(channel.id);
                  router.push(`/channel/${channel.id}`);
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md mx-1 px-2 py-1.5 text-sm font-semibold transition-all duration-150 hover:bg-sidebar-hover hover:translate-x-0.5',
                  isActive
                    ? 'bg-accent-primary-subtle text-foreground border-l-2 border-accent-primary'
                    : 'text-foreground',
                )}
              >
                {isDM ? (
                  <MessageCircle className="size-4 shrink-0 text-sidebar-section-text" />
                ) : (
                  <Hash className="size-4 shrink-0 text-sidebar-section-text" />
                )}
                <span className="flex-1 truncate text-left">{channel.name}</span>
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-primary text-[10px] font-bold text-accent-primary-text">
                  {unread > 99 ? '99+' : unread}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mx-3 mt-2 border-b border-border/50" />
    </div>
  );
}

// Sortable wrapper for user-defined sections
function SortableSectionItem({
  section,
  collapsed,
  onToggle,
  onRename,
  onDelete,
}: {
  section: { id: string; name: string; channel_ids: string[] };
  collapsed: boolean;
  onToggle: () => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <ContextMenu>
        <ContextMenuTrigger>
          <SidebarSection
            id={section.id}
            name={section.name}
            collapsed={collapsed}
            onToggle={onToggle}
            dragHandleProps={listeners}
            isDragging={isDragging}
          >
            <SectionChannelList
              channelIds={section.channel_ids}
              sectionId={section.id}
            />
          </SidebarSection>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => onRename(section.id)}>
            <Pencil className="mr-2 h-4 w-4" /> Rename section
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onClick={() => onDelete(section.id)}>
            <Trash2 className="mr-2 h-4 w-4" /> Delete section
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}

interface SidebarProps {
  onOpenSearch?: () => void;
}

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 260;
const SIDEBAR_STORAGE_KEY = 'glab-sidebar-width';

export function Sidebar({ onOpenSearch }: SidebarProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const myStatus = usePresenceStore((s) => user ? (s.statuses[user.id] || user.status) : 'offline');
  const [profileOpen, setProfileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [creatingSection, setCreatingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Resizable sidebar
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === 'undefined') return SIDEBAR_DEFAULT;
    const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return saved ? Math.min(Math.max(Number(saved), SIDEBAR_MIN), SIDEBAR_MAX) : SIDEBAR_DEFAULT;
  });
  const isResizing = useRef(false);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      const newWidth = Math.min(Math.max(startWidth + ev.clientX - startX, SIDEBAR_MIN), SIDEBAR_MAX);
      setSidebarWidth(newWidth);
    };
    const onUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setSidebarWidth((w) => { localStorage.setItem(SIDEBAR_STORAGE_KEY, String(w)); return w; });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [sidebarWidth]);

  const markAllRead = useChannelStore((s) => s.markAllRead);

  const sections = useSectionStore((s) => s.sections);
  const createSection = useSectionStore((s) => s.createSection);
  const renameSection = useSectionStore((s) => s.renameSection);
  const deleteSection = useSectionStore((s) => s.deleteSection);
  const reorderSections = useSectionStore((s) => s.reorderSections);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  function handleLogout() {
    logout();
    router.push('/login');
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sections.findIndex((s) => s.id === active.id);
    const newIndex = sections.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(sections, oldIndex, newIndex);
    reorderSections(reordered.map((s) => s.id));
  }

  const handleCreateSection = useCallback(async () => {
    const name = newSectionName.trim();
    if (!name) return;
    await createSection(name);
    setNewSectionName('');
    setCreatingSection(false);
  }, [newSectionName, createSection]);

  function handleStartRename(id: string) {
    const sec = sections.find((s) => s.id === id);
    if (sec) {
      setRenamingId(id);
      setRenameValue(sec.name);
    }
  }

  async function handleFinishRename() {
    if (renamingId && renameValue.trim()) {
      await renameSection(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue('');
  }

  return (
    <aside className="relative flex h-full shrink-0 flex-col bg-sidebar" style={{ width: sidebarWidth }}>
      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize hover:bg-accent-primary/40 active:bg-accent-primary/60 transition-colors"
      />
      {/* Workspace header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-1">
          <h1 className="text-lg font-bold text-foreground tracking-tight">Glab</h1>
          <ChevronDown className="size-3.5 text-sidebar-section-text" />
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleLogout}
          className="text-sidebar-section-text hover:text-foreground"
        >
          <LogOut className="size-3.5" />
        </Button>
      </div>

      {/* User info */}
      {user && (
        <div className="flex items-center gap-2 px-4 pb-2">
          <span className="inline-block size-2 shrink-0 rounded-full bg-status-online" />
          <p className="truncate text-sm text-sidebar-section-text">{user.display_name}</p>
        </div>
      )}

      {/* Search */}
      <div className="px-3 pb-3">
        <button
          onClick={onOpenSearch}
          className="flex h-8 w-full items-center gap-2 rounded-md border border-chat-input-border bg-chat-input-bg px-2 text-xs text-muted-foreground hover:border-chat-input-focus"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="flex-1 text-left">Search...</span>
          <kbd className="rounded border border-border bg-secondary px-1 py-0.5 text-[9px] text-muted-foreground">
            {typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent) ? '⌘K' : 'Ctrl+K'}
          </kbd>
        </button>
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto px-2 pt-3">
        {/* Unreads section */}
        <UnreadSection />

        {/* User-defined sections with drag-and-drop */}
        {sections.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sections.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              {sections.map((section) => {
                if (renamingId === section.id) {
                  return (
                    <div key={section.id} className="px-3 py-1">
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={handleFinishRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleFinishRename();
                          if (e.key === 'Escape') { setRenamingId(null); setRenameValue(''); }
                        }}
                        className="w-full rounded border border-chat-input-border bg-chat-input-bg px-2 py-1 text-xs text-foreground outline-none focus:border-chat-input-focus"
                      />
                    </div>
                  );
                }
                return (
                  <SortableSectionItem
                    key={section.id}
                    section={section}
                    collapsed={!!collapsed[`section-${section.id}`]}
                    onToggle={() =>
                      setCollapsed((s) => ({
                        ...s,
                        [`section-${section.id}`]: !s[`section-${section.id}`],
                      }))
                    }
                    onRename={handleStartRename}
                    onDelete={deleteSection}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        )}

        {/* Create section inline input */}
        {creatingSection ? (
          <div className="px-3 py-1">
            <input
              autoFocus
              placeholder="Section name..."
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
              onBlur={() => { if (!newSectionName.trim()) setCreatingSection(false); else handleCreateSection(); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateSection();
                if (e.key === 'Escape') { setCreatingSection(false); setNewSectionName(''); }
              }}
              className="w-full rounded border border-chat-input-border bg-chat-input-bg px-2 py-1 text-xs text-foreground outline-none focus:border-chat-input-focus"
            />
          </div>
        ) : (
          <button
            onClick={() => setCreatingSection(true)}
            className="mb-2 flex w-full items-center gap-1 px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="size-3" />
            <span>Create section</span>
          </button>
        )}

        {/* Default Channels section (unassigned non-DM) */}
        <div className="mb-1 flex w-full items-center justify-between px-3 py-2 hover:bg-sidebar-hover rounded-md transition-colors">
          <button
            onClick={() => setCollapsed((s) => ({ ...s, channels: !s.channels }))}
            className="flex flex-1 items-center gap-1"
          >
            {collapsed.channels ? (
              <ChevronRight className="size-3 text-sidebar-section-text" />
            ) : (
              <ChevronDown className="size-3 text-sidebar-section-text" />
            )}
            <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-section-text">
              Channels
            </span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              markAllRead();
            }}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-sidebar-hover transition-colors"
            title="Mark all as read"
          >
            <CheckCheck className="size-3.5" />
          </button>
        </div>
        {!collapsed.channels && (
          <>
            <div className="flex justify-end px-3 -mt-1 mb-1">
              <CreateChannelDialog />
            </div>
            <ChannelList />
          </>
        )}

        {/* Default DMs section (unassigned DMs) */}
        <div className="mt-5 mb-1 flex w-full items-center justify-between px-3 py-2 hover:bg-sidebar-hover rounded-md transition-colors">
          <button
            onClick={() => setCollapsed((s) => ({ ...s, dms: !s.dms }))}
            className="flex flex-1 items-center gap-1"
          >
            {collapsed.dms ? (
              <ChevronRight className="size-3 text-sidebar-section-text" />
            ) : (
              <ChevronDown className="size-3 text-sidebar-section-text" />
            )}
            <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-section-text">
              Direct Messages
            </span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              markAllRead();
            }}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-sidebar-hover transition-colors"
            title="Mark all as read"
          >
            <CheckCheck className="size-3.5" />
          </button>
        </div>
        {!collapsed.dms && (
          <>
            <div className="flex justify-end px-3 -mt-1 mb-1">
              <NewDMDialog />
            </div>
            <DMList />
          </>
        )}

        {/* AI Agents section */}
        <button
          onClick={() => setCollapsed((s) => ({ ...s, agents: !s.agents }))}
          className="mt-5 mb-1 flex w-full items-center gap-1 px-3 py-2 hover:bg-sidebar-hover rounded-md transition-colors"
        >
          {collapsed.agents ? (
            <ChevronRight className="size-3 text-sidebar-section-text" />
          ) : (
            <ChevronDown className="size-3 text-sidebar-section-text" />
          )}
          <Bot className="size-3 text-sidebar-section-text" />
          <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-section-text">
            AI Agents
          </span>
        </button>
        {!collapsed.agents && <AgentList />}

        {/* Settings section */}
        <button
          onClick={() => setCollapsed((s) => ({ ...s, settings: !s.settings }))}
          className="mt-5 mb-1 flex w-full items-center gap-1 px-3 py-2 hover:bg-sidebar-hover rounded-md transition-colors"
        >
          {collapsed.settings ? (
            <ChevronRight className="size-3 text-sidebar-section-text" />
          ) : (
            <ChevronDown className="size-3 text-sidebar-section-text" />
          )}
          <Settings className="size-3 text-sidebar-section-text" />
          <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-section-text">
            Settings
          </span>
        </button>
        {!collapsed.settings && (
          <Link
            href="/settings/tokens"
            className="mx-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-section-text transition-all duration-150 hover:bg-sidebar-hover hover:text-foreground hover:translate-x-0.5"
          >
            <Key className="size-3.5" />
            API Tokens
          </Link>
        )}

        {/* Admin section */}
        {user?.role === 'admin' && (
          <>
            <button
              onClick={() => setCollapsed((s) => ({ ...s, admin: !s.admin }))}
              className="mt-5 mb-1 flex w-full items-center gap-1 px-3 py-2 hover:bg-sidebar-hover rounded-md transition-colors"
            >
              {collapsed.admin ? (
                <ChevronRight className="size-3 text-sidebar-section-text" />
              ) : (
                <ChevronDown className="size-3 text-sidebar-section-text" />
              )}
              <Settings className="size-3 text-sidebar-section-text" />
              <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-section-text">
                Admin
              </span>
            </button>
            {!collapsed.admin && (
              <>
                <Link
                  href="/admin"
                  className="mx-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-section-text transition-all duration-150 hover:bg-sidebar-hover hover:text-foreground hover:translate-x-0.5"
                >
                  <LayoutDashboard className="size-3.5" />
                  Dashboard
                </Link>
                <Link
                  href="/admin/users"
                  className="mx-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-section-text transition-all duration-150 hover:bg-sidebar-hover hover:text-foreground hover:translate-x-0.5"
                >
                  <Users className="size-3.5" />
                  Users
                </Link>
                <Link
                  href="/admin/channels"
                  className="mx-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-section-text transition-all duration-150 hover:bg-sidebar-hover hover:text-foreground hover:translate-x-0.5"
                >
                  <Hash className="size-3.5" />
                  Channels
                </Link>
                <Link
                  href="/admin/migration"
                  className="mx-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-section-text transition-all duration-150 hover:bg-sidebar-hover hover:text-foreground hover:translate-x-0.5"
                >
                  <ArrowLeftRight className="size-3.5" />
                  Migration
                </Link>
              </>
            )}
          </>
        )}
      </div>

      {/* Bottom user bar */}
      {user && (
        <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
          <button
            onClick={() => setProfileOpen(true)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-0.5 -ml-0.5 transition-colors hover:bg-sidebar-hover"
          >
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-primary text-xs font-bold text-accent-primary-text overflow-hidden">
              {user.avatar_url ? (
                <img
                  src={user.avatar_url.startsWith('/') ? `${API_URL}${user.avatar_url}` : user.avatar_url}
                  alt={user.display_name}
                  className="size-7 rounded-full object-cover"
                />
              ) : (
                user.display_name?.charAt(0).toUpperCase() || '?'
              )}
            </div>
            <p className="truncate text-sm font-medium text-foreground">{user.display_name}</p>
          </button>
          <ThemeSwitcher />
          <a
            href="https://github.com/gabdevbr/glab/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-md text-sidebar-section-text hover:text-foreground hover:bg-sidebar-hover size-7 transition-colors"
            title="Report a bug"
          >
            <Bug className="size-3.5" />
          </a>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-md hover:bg-sidebar-hover size-7 transition-colors" title="Change status">
              <span className={cn(
                'inline-block size-2.5 shrink-0 rounded-full',
                myStatus === 'online' ? 'bg-status-online'
                  : myStatus === 'away' ? 'bg-status-away'
                  : myStatus === 'dnd' ? 'bg-status-dnd'
                  : 'bg-status-offline',
              )} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top">
              {([
                { value: 'online', label: 'Online', color: 'bg-status-online' },
                { value: 'away', label: 'Away', color: 'bg-status-away' },
                { value: 'dnd', label: 'Do not disturb', color: 'bg-status-dnd' },
                { value: 'offline', label: 'Invisible', color: 'bg-status-offline' },
              ] as const).map(opt => (
                <DropdownMenuItem key={opt.value} onClick={() => wsClient.send('presence.update', { status: opt.value })}>
                  <span className={cn('mr-2 inline-block size-2 rounded-full', opt.color)} />
                  {opt.label}
                  {myStatus === opt.value && <span className="ml-auto text-xs text-muted-foreground">current</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <ProfileModal open={profileOpen} onOpenChange={setProfileOpen} />
    </aside>
  );
}
