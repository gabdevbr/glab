'use client';

import { useRouter } from 'next/navigation';
import { useChannelStore } from '@/stores/channelStore';
import { useSectionStore } from '@/stores/sectionStore';
import { usePresenceStore } from '@/stores/presenceStore';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import { Channel } from '@/lib/types';
import { Hash, MessageCircle, FolderOutput, ChevronRight } from 'lucide-react';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/+$/, '');
import { sortChannels } from './ChannelList';
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

interface SectionChannelListProps {
  channelIds: string[];
  sectionId: string;
}

export function SectionChannelList({ channelIds, sectionId }: SectionChannelListProps) {
  const router = useRouter();
  const allChannels = useChannelStore((s) => s.channels);
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const unreadCounts = useChannelStore((s) => s.unreadCounts);
  const statuses = usePresenceStore((s) => s.statuses);
  const user = useAuthStore((s) => s.user);
  const sections = useSectionStore((s) => s.sections);
  const moveChannel = useSectionStore((s) => s.moveChannel);

  const sortMode = user?.channel_sort || 'activity';

  // Filter channels that belong to this section
  const sectionChannels = sortChannels(
    allChannels.filter((c) => channelIds.includes(c.id)),
    sortMode,
    unreadCounts,
  );

  function handleClick(id: string) {
    setActiveChannel(id);
    router.push(`/channel/${id}`);
  }

  if (sectionChannels.length === 0) {
    return (
      <p className="px-3 py-1 text-xs text-muted-foreground italic">No channels</p>
    );
  }

  return (
    <ul className="space-y-0.5">
      {sectionChannels.map((channel) => {
        const unread = unreadCounts[channel.id] || 0;
        const isActive = activeChannelId === channel.id;
        const isDM = channel.type === 'dm';
        const presenceStatus = isDM ? (statuses[channel.created_by] || 'offline') : null;

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
                {isDM ? (
                  (() => {
                    const presenceColor = presenceStatus === 'online' ? 'bg-status-online' : presenceStatus === 'away' ? 'bg-status-warning' : 'bg-muted';
                    const avatarSrc = channel.dm_avatar_url
                      ? channel.dm_avatar_url.startsWith('/') ? `${API_URL}${channel.dm_avatar_url}` : channel.dm_avatar_url
                      : null;
                    return (
                      <span className="relative shrink-0">
                        <span className="flex size-6 items-center justify-center rounded-full bg-avatar-bg text-[10px] font-medium text-avatar-text overflow-hidden">
                          {avatarSrc ? (
                            <img src={avatarSrc} alt={channel.name} className="size-6 rounded-full object-cover" />
                          ) : (
                            channel.name.charAt(0).toUpperCase()
                          )}
                        </span>
                        <span className={cn('absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-sidebar transition-colors duration-500', presenceColor)} />
                      </span>
                    );
                  })()
                ) : (
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-sidebar-hover text-sidebar-section-text">
                    <Hash className="size-3.5" />
                  </span>
                )}
                <span className="flex-1 truncate text-left">{channel.name}</span>
                {unread > 0 && (
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-primary text-[10px] font-bold text-accent-primary-text animate-badge-pulse">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onClick={() => moveChannel(channel.id, null)}>
                  <FolderOutput className="mr-2 h-4 w-4" /> Remove from section
                </ContextMenuItem>
                {sections.filter((s) => s.id !== sectionId).length > 0 && (
                  <>
                    <ContextMenuSeparator />
                    <MoveToSectionSubmenu
                      channelId={channel.id}
                      currentSectionId={sectionId}
                    />
                  </>
                )}
              </ContextMenuContent>
            </ContextMenu>
          </li>
        );
      })}
    </ul>
  );
}

function MoveToSectionSubmenu({
  channelId,
  currentSectionId,
}: {
  channelId: string;
  currentSectionId: string;
}) {
  const sections = useSectionStore((s) => s.sections);
  const moveChannel = useSectionStore((s) => s.moveChannel);

  const otherSections = sections.filter((s) => s.id !== currentSectionId);

  return (
    <ContextMenuSub>
      <ContextMenuSubmenuTrigger>
        <MessageCircle className="mr-2 h-4 w-4" />
        Move to section
        <ChevronRight className="ml-auto h-4 w-4" />
      </ContextMenuSubmenuTrigger>
      <ContextMenuSubmenu>
        {otherSections.map((sec) => (
          <ContextMenuItem key={sec.id} onClick={() => moveChannel(channelId, sec.id)}>
            {sec.name}
          </ContextMenuItem>
        ))}
      </ContextMenuSubmenu>
    </ContextMenuSub>
  );
}
