'use client';

import { useRouter } from 'next/navigation';
import { useChannelStore } from '@/stores/channelStore';
import { useAuthStore } from '@/stores/authStore';
import { usePresenceStore } from '@/stores/presenceStore';
import { useSectionStore } from '@/stores/sectionStore';
import { cn } from '@/lib/utils';
import { sortChannels } from './ChannelList';

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
  const statuses = usePresenceStore((s) => s.statuses);
  const user = useAuthStore((s) => s.user);
  const sections = useSectionStore((s) => s.sections);

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
          <li key={channel.id}>
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
            </button>
          </li>
        );
      })}
    </ul>
  );
}
