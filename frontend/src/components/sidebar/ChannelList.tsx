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
  const unreadCounts = useChannelStore((s) => s.unreadCounts);

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
      {nonDmChannels.map((channel) => {
        const unread = unreadCounts[channel.id] || 0;
        const isActive = activeChannelId === channel.id;
        return (
          <li key={channel.id}>
            <button
              onClick={() => handleClick(channel.id)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md mx-1 px-2 py-1.5 text-sm transition-colors hover:bg-slate-700/50 hover:text-slate-100',
                isActive
                  ? 'bg-indigo-600/20 text-white font-semibold border-l-2 border-indigo-400'
                  : unread > 0
                    ? 'text-white font-semibold'
                    : 'text-slate-300',
              )}
            >
              <Hash className="size-4 shrink-0 text-slate-400" />
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
