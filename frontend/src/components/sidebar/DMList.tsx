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
      className={cn('inline-block size-2 shrink-0 rounded-full', color)}
    />
  );
}

export function DMList() {
  const router = useRouter();
  const channels = useChannelStore((s) => s.channels);
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
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

        return (
          <li key={channel.id}>
            <button
              onClick={() => handleClick(channel.id)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-1 text-sm text-slate-300 transition-colors hover:bg-slate-700/50 hover:text-slate-100',
                activeChannelId === channel.id &&
                  'bg-slate-700/50 text-white font-medium',
              )}
            >
              <PresenceDot status={presenceStatus} />
              <span className="truncate">{channel.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
