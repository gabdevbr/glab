'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useChannelStore } from '@/stores/channelStore';
import { usePresenceStore } from '@/stores/presenceStore';
import { useAuthStore } from '@/stores/authStore';
import { useAgentStore } from '@/stores/agentStore';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Hash, MessageCircle, X } from 'lucide-react';
import { User, Channel, Agent } from '@/lib/types';

interface QuickSwitcherProps {
  open: boolean;
  onClose: () => void;
}

type ResultItem =
  | { kind: 'channel'; channel: Channel }
  | { kind: 'user'; user: User }
  | { kind: 'agent'; agent: Agent };

export function QuickSwitcher({ open, onClose }: QuickSwitcherProps) {
  const router = useRouter();
  const channels = useChannelStore((s) => s.channels);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const addChannel = useChannelStore((s) => s.addChannel);
  const unreadCounts = useChannelStore((s) => s.unreadCounts);
  const statuses = usePresenceStore((s) => s.statuses);
  const currentUser = useAuthStore((s) => s.user);
  const agents = useAgentStore((s) => s.agents);
  const openAgentPanel = useAgentStore((s) => s.openPanel);

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [publicChannels, setPublicChannels] = useState<Channel[]>([]);
  const [hiddenChannels, setHiddenChannels] = useState<Channel[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load users, public channels, and hidden channels when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
      api.get<User[]>('/api/v1/users?limit=200').then(setAllUsers).catch(() => {});
      api.get<Channel[]>('/api/v1/channels/browse').then(setPublicChannels).catch(() => {});
      api.get<Channel[]>('/api/v1/channels/hidden').then(setHiddenChannels).catch(() => {});
    }
  }, [open]);

  const joinedIds = new Set(channels.map((c) => c.id));
  const hiddenIds = new Set(hiddenChannels.map((c) => c.id));

  // Build combined results list
  const results: ResultItem[] = (() => {
    const q = query.toLowerCase();

    // Merge user's channels with public channels and hidden channels (deduplicate by id)
    const allChannels = [
      ...channels,
      ...publicChannels.filter((c) => !joinedIds.has(c.id)),
      ...hiddenChannels.filter((c) => !joinedIds.has(c.id)),
    ];

    // Filter channels
    const filteredChannels = allChannels.filter((c) => {
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.slug?.toLowerCase().includes(q);
    });

    // Sort channels: unread first, then alphabetical
    const sortedChannels = [...filteredChannels].sort((a, b) => {
      const ua = unreadCounts[a.id] || 0;
      const ub = unreadCounts[b.id] || 0;
      if (ua > 0 && ub === 0) return -1;
      if (ub > 0 && ua === 0) return 1;
      return a.name.localeCompare(b.name);
    });

    // Filter users (exclude current user and bots, only show when searching)
    const dmChannelNames = new Set(
      channels.filter((c) => c.type === 'dm').map((c) => c.name.toLowerCase()),
    );

    const filteredUsers = q
      ? allUsers.filter((u) => {
          if (u.id === currentUser?.id) return false;
          if (u.is_bot) return false;
          // Skip users who already have a DM channel showing in results
          if (dmChannelNames.has(u.display_name.toLowerCase())) return false;
          return (
            u.username.toLowerCase().includes(q) ||
            u.display_name.toLowerCase().includes(q)
          );
        }).slice(0, 5)
      : [];

    // Filter agents
    const filteredAgents = q
      ? agents.filter((a) =>
          a.name.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q),
        ).slice(0, 3)
      : [];

    const items: ResultItem[] = sortedChannels.map((c) => ({ kind: 'channel', channel: c }));

    if (filteredUsers.length > 0) {
      items.push(...filteredUsers.map((u) => ({ kind: 'user', user: u } as ResultItem)));
    }

    if (filteredAgents.length > 0) {
      items.push(...filteredAgents.map((a) => ({ kind: 'agent', agent: a } as ResultItem)));
    }

    return items;
  })();

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const fetchChannels = useChannelStore((s) => s.fetchChannels);

  const navigateChannel = useCallback(
    async (channelId: string) => {
      if (hiddenIds.has(channelId)) {
        await api.patch(`/api/v1/channels/${channelId}/hide`, { hidden: false }).catch(() => {});
        fetchChannels();
      } else if (!joinedIds.has(channelId)) {
        await api.post(`/api/v1/channels/${channelId}/join`, {}).catch(() => {});
      }
      setActiveChannel(channelId);
      router.push(`/channel/${channelId}`);
      onClose();
    },
    [joinedIds, hiddenIds, setActiveChannel, fetchChannels, router, onClose],
  );

  const openDM = useCallback(
    async (user: User) => {
      onClose();
      try {
        const channel = await api.post<Channel>('/api/v1/channels', {
          type: 'dm',
          member_id: user.id,
        });
        addChannel(channel);
        setActiveChannel(channel.id);
        router.push(`/channel/${channel.id}`);
      } catch {
        // DM creation failed
      }
    },
    [addChannel, setActiveChannel, router, onClose],
  );

  const selectItem = useCallback(
    (item: ResultItem) => {
      if (item.kind === 'channel') {
        navigateChannel(item.channel.id);
      } else if (item.kind === 'user') {
        openDM(item.user);
      } else {
        openAgentPanel(item.agent);
        onClose();
      }
    },
    [navigateChannel, openDM, openAgentPanel, onClose],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        selectItem(results[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!open) return null;

  // Find section boundaries for separators
  const firstUserIndex = results.findIndex((r) => r.kind === 'user');
  const firstAgentIndex = results.findIndex((r) => r.kind === 'agent');

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] animate-in fade-in-0 duration-150" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-xl border border-border bg-panel-bg shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Jump to a channel or person..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            autoComplete="off"
          />
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No results found
            </p>
          ) : (
            results.map((item, i) => {
              // Separator before users section
              const showSeparator = i === firstUserIndex && firstUserIndex > 0;

              if (item.kind === 'channel') {
                const channel = item.channel;
                const unread = unreadCounts[channel.id] || 0;
                const isDM = channel.type === 'dm';
                const presenceStatus = isDM ? statuses[channel.created_by] || 'offline' : null;

                return (
                  <button
                    key={`ch-${channel.id}`}
                    onClick={() => navigateChannel(channel.id)}
                    className={cn(
                      'flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors',
                      i === selectedIndex
                        ? 'bg-accent-primary-subtle text-foreground'
                        : 'text-muted-foreground hover:bg-secondary',
                    )}
                  >
                    {isDM ? (
                      <div className="relative">
                        <MessageCircle className="size-4 shrink-0 text-sidebar-section-text" />
                        <span
                          className={cn(
                            'absolute -bottom-0.5 -right-0.5 size-2 rounded-full border border-panel-bg',
                            presenceStatus === 'online'
                              ? 'bg-status-online'
                              : presenceStatus === 'away'
                                ? 'bg-status-warning'
                                : 'bg-muted',
                          )}
                        />
                      </div>
                    ) : (
                      <Hash className="size-4 shrink-0 text-sidebar-section-text" />
                    )}
                    <span className={cn('flex-1 truncate', unread > 0 && 'font-semibold text-foreground')}>
                      {channel.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {isDM ? 'DM' : hiddenIds.has(channel.id) ? 'Hidden' : channel.type === 'private' ? 'Private' : !joinedIds.has(channel.id) ? 'Join' : 'Channel'}
                    </span>
                    {unread > 0 && (
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-primary text-[10px] font-bold text-accent-primary-text">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </button>
                );
              }

              if (item.kind === 'user') {
                // User item
                const user = item.user;
                const userStatus = statuses[user.id] || 'offline';

                return (
                  <div key={`u-${user.id}`}>
                    {showSeparator && (
                      <div className="mx-4 my-1 border-t border-border/50">
                        <span className="relative -top-2.5 bg-panel-bg px-2 text-[10px] text-muted-foreground">
                          People
                        </span>
                      </div>
                    )}
                    <button
                      onClick={() => openDM(user)}
                      className={cn(
                        'flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors',
                        i === selectedIndex
                          ? 'bg-accent-primary-subtle text-foreground'
                          : 'text-muted-foreground hover:bg-secondary',
                      )}
                    >
                      <div className="relative">
                        <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-avatar-bg text-[10px] font-medium text-avatar-text">
                          {user.avatar_url ? (
                            <img src={user.avatar_url} alt="" className="size-6 rounded-full object-cover" />
                          ) : (
                            user.display_name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <span
                          className={cn(
                            'absolute -bottom-0.5 -right-0.5 size-2 rounded-full border border-panel-bg',
                            userStatus === 'online'
                              ? 'bg-status-online'
                              : userStatus === 'away'
                                ? 'bg-status-warning'
                                : 'bg-muted',
                          )}
                        />
                      </div>
                      <span className="flex-1 truncate">{user.display_name}</span>
                      <span className="text-[10px] text-muted-foreground">@{user.username}</span>
                    </button>
                  </div>
                );
              }

              // Agent item
              const agent = item.agent;
              const showAgentSeparator = i === firstAgentIndex && firstAgentIndex > 0;

              return (
                <div key={`a-${agent.id}`}>
                  {showAgentSeparator && (
                    <div className="mx-4 my-1 border-t border-border/50">
                      <span className="relative -top-2.5 bg-panel-bg px-2 text-[10px] text-muted-foreground">
                        AI Agents
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() => { openAgentPanel(agent); onClose(); }}
                    className={cn(
                      'flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors',
                      i === selectedIndex
                        ? 'bg-accent-primary-subtle text-foreground'
                        : 'text-muted-foreground hover:bg-secondary',
                    )}
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center text-base leading-none">
                      {agent.emoji}
                    </span>
                    <span className="flex-1 truncate">{agent.name}</span>
                    <span className="rounded bg-bot-badge-bg px-1 py-0.5 text-[9px] font-medium text-bot-badge-text">
                      AI
                    </span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
          <kbd className="rounded border border-border bg-secondary px-1 py-0.5">↑↓</kbd> navigate
          <span className="mx-2">·</span>
          <kbd className="rounded border border-border bg-secondary px-1 py-0.5">↵</kbd> open
          <span className="mx-2">·</span>
          <kbd className="rounded border border-border bg-secondary px-1 py-0.5">esc</kbd> close
        </div>
      </div>
    </div>
  );
}
