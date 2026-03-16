'use client';

import { useRouter } from 'next/navigation';
import { useChannelStore } from '@/stores/channelStore';
import { usePresenceStore } from '@/stores/presenceStore';
import { cn } from '@/lib/utils';

function PresenceDot({ status }: { status: string }) {
  const color =
    status === 'online'
      ? 'bg-green-500'
      : status === 'away'
        ? 'bg-yellow-500'
        : 'bg-slate-600';

  return (
    <span
      className={cn('inline-block size-2.5 shrink-0 rounded-full', color)}
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

  const dmChannels = channels.filter((c) => c.type === 'dm');

  function handleClick(id: string) {
    setActiveChannel(id);
    router.push(`/channel/${id}`);
  }

  if (dmChannels.length === 0) {
    return (
      <p className="px-3 py-1 text-xs text-slate-500">No conversations yet</p>
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
                'flex w-full items-center gap-2.5 rounded-md mx-1 px-2 py-1.5 text-sm transition-colors hover:bg-slate-700/50 hover:text-slate-100',
                isActive
                  ? 'bg-indigo-600/20 text-white font-semibold'
                  : unread > 0
                    ? 'text-white font-semibold'
                    : 'text-slate-300',
              )}
            >
              <PresenceDot status={presenceStatus} />
              <span className="flex-1 truncate text-left">{channel.name}</span>
              {unread > 0 && (
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
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
