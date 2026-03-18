'use client';

import { useRouter } from 'next/navigation';
import { useChannelStore } from '@/stores/channelStore';
import { usePresenceStore } from '@/stores/presenceStore';
import { cn } from '@/lib/utils';

function PresenceDot({ status }: { status: string }) {
  const color =
    status === 'online'
      ? 'bg-status-online'
      : status === 'away'
        ? 'bg-status-warning'
        : 'bg-muted';

  return (
    <span
      className={cn('inline-block size-2.5 shrink-0 rounded-full transition-colors duration-500', color)}
    />
  );
}

export function DMList() {
  const router = useRouter();
  const channels = useChannelStore((s) => s.channels);
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const unreadCounts = useChannelStore((s) => s.unreadCounts);
  const statuses = usePresenceStore((s) => s.statuses);

  const dmChannels = channels
    .filter((c) => c.type === 'dm')
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

  if (dmChannels.length === 0) {
    return (
      <p className="px-3 py-1 text-xs text-muted-foreground">No conversations yet</p>
    );
  }

  return (
    <ul className="space-y-0.5">
      {dmChannels.map((channel) => {
        // For DMs, the channel name is typically the other user's display name
        // We use created_by as a rough proxy for presence lookup
        const presenceStatus = statuses[channel.created_by] || 'offline';
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
              <PresenceDot status={presenceStatus} />
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
