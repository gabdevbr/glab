'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useChannelStore } from '@/stores/channelStore';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Hash, EyeOff, Archive, Trash2 } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
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

export function ChannelList() {
  const router = useRouter();
  const channels = useChannelStore((s) => s.channels);
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const unreadCounts = useChannelStore((s) => s.unreadCounts);
  const hideChannel = useChannelStore((s) => s.hideChannel);
  const fetchChannels = useChannelStore((s) => s.fetchChannels);
  const user = useAuthStore((s) => s.user);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const nonDmChannels = channels
    .filter((c) => c.type !== 'dm')
    .sort((a, b) => {
      const ua = unreadCounts[a.id] || 0;
      const ub = unreadCounts[b.id] || 0;
      if (ua > 0 && ub === 0) return -1;
      if (ub > 0 && ua === 0) return 1;
      return a.name.localeCompare(b.name);
    });

  function handleClick(id: string) {
    setActiveChannel(id);
    router.push(`/channel/${id}`);
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

  if (nonDmChannels.length === 0) {
    return (
      <p className="px-3 py-1 text-xs text-muted-foreground">No channels yet</p>
    );
  }

  return (
    <>
      <ul className="space-y-0.5">
        {nonDmChannels.map((channel) => {
          const unread = unreadCounts[channel.id] || 0;
          const isActive = activeChannelId === channel.id;
          return (
            <li key={channel.id}>
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
                  <Hash className="size-4 shrink-0 text-sidebar-section-text" />
                  <span className="flex-1 truncate text-left">{channel.name}</span>
                  {unread > 0 && (
                    <span key={unread} className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-primary text-[10px] font-bold text-accent-primary-text animate-badge-pulse">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => hideChannel(channel.id)}>
                    <EyeOff className="mr-2 h-4 w-4" /> Hide Channel
                  </ContextMenuItem>
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
