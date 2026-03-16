'use client';

import { useRouter } from 'next/navigation';
import { useChannelStore } from '@/stores/channelStore';
import { cn } from '@/lib/utils';
import { Hash } from 'lucide-react';

export function ChannelList() {
  const router = useRouter();
  const channels = useChannelStore((s) => s.channels);
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);

  const nonDmChannels = channels.filter((c) => c.type !== 'dm');

  function handleClick(id: string) {
    setActiveChannel(id);
    router.push(`/channel/${id}`);
  }

  if (nonDmChannels.length === 0) {
    return (
      <p className="px-3 py-1 text-xs text-slate-500">No channels yet</p>
    );
  }

  return (
    <ul className="space-y-0.5">
      {nonDmChannels.map((channel) => (
        <li key={channel.id}>
          <button
            onClick={() => handleClick(channel.id)}
            className={cn(
              'flex w-full items-center gap-1.5 rounded-md px-3 py-1 text-sm text-slate-300 transition-colors hover:bg-slate-700/50 hover:text-slate-100',
              activeChannelId === channel.id &&
                'bg-slate-700/50 text-white font-medium',
            )}
          >
            <Hash className="size-3.5 shrink-0 text-slate-500" />
            <span className="truncate">{channel.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
