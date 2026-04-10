'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useChannelStore } from '@/stores/channelStore';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Channel } from '@/lib/types';
import { Hash, EyeOff, Archive, Trash2, ArrowUpDown, FolderInput, ChevronRight, Pin, PinOff, MoreHorizontal } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubmenuTrigger,
  ContextMenuSubmenu,
} from '@/components/ui/context-menu';
import { useSectionStore } from '@/stores/sectionStore';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';

const SORT_LABELS: Record<string, string> = {
  activity: 'Recent Activity',
  name: 'Name (A-Z)',
  unread: 'Unread Count',
};

function sortChannels(
  channels: Channel[],
  sortMode: string,
  unreadCounts: Record<string, number>,
): Channel[] {
  return [...channels].sort((a, b) => {
    // Pinned channels always float to top
    const pa = a.is_pinned ? 1 : 0;
    const pb = b.is_pinned ? 1 : 0;
    if (pa !== pb) return pb - pa;

    const ua = unreadCounts[a.id] || 0;
    const ub = unreadCounts[b.id] || 0;

    // Unread channels always float to top (after pinned)
    if (ua > 0 && ub === 0) return -1;
    if (ub > 0 && ua === 0) return 1;

    switch (sortMode) {
      case 'activity': {
        const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
        const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
        if (tb !== ta) return tb - ta; // DESC — most recent first
        return a.name.localeCompare(b.name);
      }
      case 'unread': {
        if (ub !== ua) return ub - ua; // DESC — most unread first
        return a.name.localeCompare(b.name);
      }
      case 'name':
      default:
        return a.name.localeCompare(b.name);
    }
  });
}

export { sortChannels };

export function ChannelList() {
  const router = useRouter();
  const channels = useChannelStore((s) => s.channels);
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const unreadCounts = useChannelStore((s) => s.unreadCounts);
  const hideChannel = useChannelStore((s) => s.hideChannel);
  const pinChannel = useChannelStore((s) => s.pinChannel);
  const fetchChannels = useChannelStore((s) => s.fetchChannels);
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const sections = useSectionStore((s) => s.sections);
  const moveChannel = useSectionStore((s) => s.moveChannel);

  const sortMode = user?.channel_sort || 'activity';

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Exclude channels assigned to custom sections
  const assignedIds = new Set(sections.flatMap((s) => s.channel_ids));
  const nonDmChannels = sortChannels(
    channels.filter((c) => c.type !== 'dm' && !assignedIds.has(c.id)),
    sortMode,
    unreadCounts,
  );

  function handleClick(id: string) {
    setActiveChannel(id);
    router.push(`/channel/${id}`);
  }

  async function handleSortChange(value: string) {
    updateUser({ channel_sort: value as 'activity' | 'name' | 'unread' });
    try {
      await api.updatePreferences({ channel_sort: value });
    } catch {
      // revert on failure
      updateUser({ channel_sort: sortMode as 'activity' | 'name' | 'unread' });
    }
  }

  async function handleArchive(channelId: string) {
    try {
      await api.patch(`/api/v1/channels/${channelId}`, { is_archived: true });
      fetchChannels();
    } catch {
      // ignore
    }
  }

  async function handleDelete(channelId: string) {
    try {
      await api.delete(`/api/v1/channels/${channelId}`);
      fetchChannels();
    } catch {
      // ignore
    }
    setDeleteTarget(null);
  }

  return (
    <>
      <div className="flex items-center justify-between px-3 mb-1">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
            <ArrowUpDown className="size-3" />
            {SORT_LABELS[sortMode]}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuRadioGroup value={sortMode} onValueChange={handleSortChange}>
              <DropdownMenuRadioItem value="activity">Recent Activity</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="name">Name (A-Z)</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="unread">Unread Count</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {nonDmChannels.length === 0 ? (
        <p className="px-3 py-1 text-xs text-muted-foreground">No channels yet</p>
      ) : (
        <ul className="space-y-0.5">
          {nonDmChannels.map((channel) => {
            const unread = unreadCounts[channel.id] || 0;
            const isActive = activeChannelId === channel.id;
            return (
              <li key={channel.id} className="group/ch">
                <ContextMenu>
                  <ContextMenuTrigger
                    render={
                      <button
                        onClick={() => handleClick(channel.id)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md mx-1 px-2 py-1.5 text-sm transition-all duration-150 hover:bg-sidebar-hover hover:text-foreground hover:translate-x-0.5',
                          isActive
                            ? 'bg-accent-primary-subtle text-foreground font-semibold border-l-2 border-accent-primary'
                            : unread > 0
                              ? 'text-foreground font-semibold'
                              : 'text-muted-foreground',
                        )}
                      />
                    }
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-sidebar-hover text-sidebar-section-text">
                      <Hash className="size-3.5" />
                    </span>
                    <span className="flex-1 truncate text-left">{channel.name}</span>
                    {channel.is_pinned && (
                      <Pin className="size-3 shrink-0 text-muted-foreground" />
                    )}
                    {unread > 0 && (
                      <span key={unread} className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-primary text-[10px] font-bold text-accent-primary-text animate-badge-pulse">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                          'shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-sidebar-hover transition-opacity',
                          'opacity-0 group-hover/ch:opacity-100 focus:opacity-100 data-[state=open]:opacity-100',
                        )}
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => pinChannel(channel.id, !channel.is_pinned)}>
                          {channel.is_pinned ? (
                            <><PinOff className="mr-2 h-4 w-4" /> Unpin Channel</>
                          ) : (
                            <><Pin className="mr-2 h-4 w-4" /> Pin to Top</>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => hideChannel(channel.id)}>
                          <EyeOff className="mr-2 h-4 w-4" /> Hide Channel
                        </DropdownMenuItem>
                        {sections.length > 0 && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>
                                <FolderInput className="mr-2 h-4 w-4" />
                                Move to section
                                <ChevronRight className="ml-auto h-4 w-4" />
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent>
                                {sections.map((sec) => (
                                  <DropdownMenuItem key={sec.id} onClick={() => moveChannel(channel.id, sec.id)}>
                                    {sec.name}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                          </>
                        )}
                        {user?.role === 'admin' && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleArchive(channel.id)}>
                              <Archive className="mr-2 h-4 w-4" /> Archive Channel
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteTarget({ id: channel.id, name: channel.name })}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Delete Channel
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onClick={() => pinChannel(channel.id, !channel.is_pinned)}>
                      {channel.is_pinned ? (
                        <><PinOff className="mr-2 h-4 w-4" /> Unpin Channel</>
                      ) : (
                        <><Pin className="mr-2 h-4 w-4" /> Pin to Top</>
                      )}
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => hideChannel(channel.id)}>
                      <EyeOff className="mr-2 h-4 w-4" /> Hide Channel
                    </ContextMenuItem>
                    {sections.length > 0 && (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuSub>
                          <ContextMenuSubmenuTrigger>
                            <FolderInput className="mr-2 h-4 w-4" />
                            Move to section
                            <ChevronRight className="ml-auto h-4 w-4" />
                          </ContextMenuSubmenuTrigger>
                          <ContextMenuSubmenu>
                            {sections.map((sec) => (
                              <ContextMenuItem key={sec.id} onClick={() => moveChannel(channel.id, sec.id)}>
                                {sec.name}
                              </ContextMenuItem>
                            ))}
                          </ContextMenuSubmenu>
                        </ContextMenuSub>
                      </>
                    )}
                    {user?.role === 'admin' && (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem onClick={() => handleArchive(channel.id)}>
                          <Archive className="mr-2 h-4 w-4" /> Archive Channel
                        </ContextMenuItem>
                        <ContextMenuItem
                          variant="destructive"
                          onClick={() => setDeleteTarget({ id: channel.id, name: channel.name })}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete Channel
                        </ContextMenuItem>
                      </>
                    )}
                  </ContextMenuContent>
                </ContextMenu>
              </li>
            );
          })}
        </ul>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete #{deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the channel and all its messages.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleDelete(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
