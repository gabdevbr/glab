'use client';

import { useRouter } from 'next/navigation';
import { useChannelStore } from '@/stores/channelStore';
import { useAuthStore } from '@/stores/authStore';
import { usePresenceStore } from '@/stores/presenceStore';
import { useSectionStore } from '@/stores/sectionStore';
import { cn } from '@/lib/utils';
import { sortChannels } from './ChannelList';
import { EyeOff, MoreHorizontal, Pin, PinOff, FolderInput, ChevronRight } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/+$/, '');

function DMAvatar({ name, avatarUrl, status }: { name: string; avatarUrl?: string; status: string }) {
  const presenceColor =
    status === 'online'
      ? 'bg-status-online'
      : status === 'away'
        ? 'bg-status-warning'
        : 'bg-muted';

  const src = avatarUrl
    ? avatarUrl.startsWith('/') ? `${API_URL}${avatarUrl}` : avatarUrl
    : null;

  return (
    <span className="relative shrink-0">
      <span className="flex size-6 items-center justify-center rounded-full bg-avatar-bg text-[10px] font-medium text-avatar-text overflow-hidden">
        {src ? (
          <img src={src} alt={name} className="size-6 rounded-full object-cover" />
        ) : (
          name.charAt(0).toUpperCase()
        )}
      </span>
      <span
        className={cn(
          'absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-sidebar transition-colors duration-500',
          presenceColor,
        )}
      />
    </span>
  );
}

export function DMList() {
  const router = useRouter();
  const channels = useChannelStore((s) => s.channels);
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const unreadCounts = useChannelStore((s) => s.unreadCounts);
  const hideChannel = useChannelStore((s) => s.hideChannel);
  const pinChannel = useChannelStore((s) => s.pinChannel);
  const statuses = usePresenceStore((s) => s.statuses);
  const user = useAuthStore((s) => s.user);
  const sections = useSectionStore((s) => s.sections);
  const moveChannel = useSectionStore((s) => s.moveChannel);

  const sortMode = user?.channel_sort || 'activity';

  // Exclude DMs assigned to custom sections
  const assignedIds = new Set(sections.flatMap((s) => s.channel_ids));
  const dmChannels = sortChannels(
    channels.filter((c) => c.type === 'dm' && !assignedIds.has(c.id)),
    sortMode,
    unreadCounts,
  );

  function handleClick(id: string) {
    setActiveChannel(id);
    router.push(`/channel/${id}`);
  }

  if (dmChannels.length === 0) {
    return (
      <p className="px-3 py-1 text-xs text-muted-foreground">No conversations yet</p>
    );
  }

  return (
    <ul className="space-y-0.5">
      {dmChannels.map((channel) => {
        const presenceStatus = channel.dm_user_id ? (statuses[channel.dm_user_id] || 'offline') : 'offline';
        const isActive = activeChannelId === channel.id;
        const unread = unreadCounts[channel.id] || 0;

        return (
          <li key={channel.id} className="group/dm">
            <button
              onClick={() => handleClick(channel.id)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-md mx-1 px-2 py-1.5 text-sm transition-all duration-150 hover:bg-sidebar-hover hover:text-foreground hover:translate-x-0.5',
                isActive
                  ? 'bg-accent-primary-subtle text-foreground font-semibold'
                  : unread > 0
                    ? 'text-foreground font-semibold'
                    : 'text-muted-foreground',
              )}
            >
              <DMAvatar name={channel.name} avatarUrl={channel.dm_avatar_url} status={presenceStatus} />
              <span className="flex-1 truncate text-left">{channel.name}</span>
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
                    'opacity-0 group-hover/dm:opacity-100 focus:opacity-100 data-[state=open]:opacity-100',
                  )}
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => pinChannel(channel.id, !channel.is_pinned)}>
                    {channel.is_pinned ? (
                      <><PinOff className="mr-2 h-4 w-4" /> Unpin</>
                    ) : (
                      <><Pin className="mr-2 h-4 w-4" /> Pin to Top</>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => hideChannel(channel.id)}>
                    <EyeOff className="mr-2 h-4 w-4" /> Hide
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
                </DropdownMenuContent>
              </DropdownMenu>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
