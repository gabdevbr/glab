'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useChannelStore } from '@/stores/channelStore';
import { usePresenceStore } from '@/stores/presenceStore';
import { cn } from '@/lib/utils';
import { Hash, X } from 'lucide-react';

interface QuickSwitcherProps {
  open: boolean;
  onClose: () => void;
}

export function QuickSwitcher({ open, onClose }: QuickSwitcherProps) {
  const router = useRouter();
  const channels = useChannelStore((s) => s.channels);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const unreadCounts = useChannelStore((s) => s.unreadCounts);
  const statuses = usePresenceStore((s) => s.statuses);

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter channels by query
  const filtered = channels.filter((c) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.slug?.toLowerCase().includes(q);
  });

  // Sort: unread first, then alphabetical
  const sorted = [...filtered].sort((a, b) => {
    const ua = unreadCounts[a.id] || 0;
    const ub = unreadCounts[b.id] || 0;
    if (ua > 0 && ub === 0) return -1;
    if (ub > 0 && ua === 0) return 1;
    return a.name.localeCompare(b.name);
  });

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const navigate = useCallback(
    (channelId: string) => {
      setActiveChannel(channelId);
      router.push(`/channel/${channelId}`);
      onClose();
    },
    [setActiveChannel, router, onClose],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, sorted.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (sorted[selectedIndex]) {
        navigate(sorted[selectedIndex].id);
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-lg rounded-xl border border-border bg-panel-bg shadow-2xl"
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
            placeholder="Jump to a channel or conversation..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            autoComplete="off"
          />
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {sorted.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No channels found
            </p>
          ) : (
            sorted.map((channel, i) => {
              const unread = unreadCounts[channel.id] || 0;
              const isDM = channel.type === 'dm';
              const presenceStatus = isDM ? statuses[channel.created_by] || 'offline' : null;

              return (
                <button
                  key={channel.id}
                  onClick={() => navigate(channel.id)}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors',
                    i === selectedIndex
                      ? 'bg-accent-primary-subtle text-foreground'
                      : 'text-muted-foreground hover:bg-secondary',
                  )}
                >
                  {/* Icon */}
                  {isDM ? (
                    <span
                      className={cn(
                        'inline-block size-2.5 shrink-0 rounded-full',
                        presenceStatus === 'online'
                          ? 'bg-status-online'
                          : presenceStatus === 'away'
                            ? 'bg-status-warning'
                            : 'bg-muted',
                      )}
                    />
                  ) : (
                    <Hash className="size-4 shrink-0 text-sidebar-section-text" />
                  )}

                  {/* Name */}
                  <span className={cn('flex-1 truncate', unread > 0 && 'font-semibold text-foreground')}>
                    {channel.name}
                  </span>

                  {/* Type label */}
                  <span className="text-[10px] text-muted-foreground">
                    {isDM ? 'DM' : channel.type === 'private' ? 'Private' : 'Channel'}
                  </span>

                  {/* Unread badge */}
                  {unread > 0 && (
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-primary text-[10px] font-bold text-accent-primary-text">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </button>
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
