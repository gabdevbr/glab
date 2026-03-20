'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMessageStore } from '@/stores/messageStore';
import { useAIStreamStore } from '@/stores/aiStreamStore';
import { Message } from '@/lib/types';
import { MessageItem } from './MessageItem';
import { StreamingMessage } from './StreamingMessage';
import { cn } from '@/lib/utils';

interface MessageListProps {
  channelId: string;
  onThreadOpen?: (messageId: string) => void;
  onUserInfoOpen?: (userId: string) => void;
}

const COMPACT_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const EMPTY_MESSAGES: Message[] = [];

function formatDateSeparator(date: Date): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function isNewDay(curr: Message, prev: Message | undefined): boolean {
  if (!prev) return true;
  const currDate = new Date(curr.created_at).toDateString();
  const prevDate = new Date(prev.created_at).toDateString();
  return currDate !== prevDate;
}

export function MessageList({ channelId, onThreadOpen, onUserInfoOpen }: MessageListProps) {
  const messages = useMessageStore((s) => s.messages[channelId] ?? EMPTY_MESSAGES);
  const newMessageIds = useMessageStore((s) => s.newMessageIds);
  const isLoading = useMessageStore((s) => s.isLoading);
  const error = useMessageStore((s) => s.error);
  const fetchMessages = useMessageStore((s) => s.fetchMessages);
  const activeStream = useAIStreamStore((s) => s.channelStreams[channelId]);

  const parentRef = useRef<HTMLDivElement>(null);
  const wasNearBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);
  const isLoadingOlderRef = useRef(false);
  const isFetchingOlderRef = useRef(false);
  const [hasMore, setHasMore] = useState(true);

  // Determine compact mode for each message
  function isCompact(index: number): boolean {
    if (index === 0) return false;
    const curr = messages[index];
    const prev = messages[index - 1];
    if (curr.user_id !== prev.user_id) return false;
    const timeDiff =
      new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime();
    return timeDiff < COMPACT_THRESHOLD_MS;
  }

  const getScrollElement = useCallback(() => parentRef.current, []);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement,
    estimateSize: (index) => {
      const base = isCompact(index) ? 28 : 52;
      const dateSep = isNewDay(messages[index], messages[index - 1]) ? 32 : 0;
      return base + dateSep;
    },
    overscan: 20,
  });

  // Check if user is near the bottom
  const checkNearBottom = useCallback(() => {
    const el = parentRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  // Auto-scroll to bottom when new messages arrive (if user was near bottom)
  // Preserve scroll position when older messages are prepended
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      const addedCount = messages.length - prevMessageCountRef.current;

      if (isLoadingOlderRef.current) {
        // Older messages prepended — shift scroll down to keep view stable
        requestAnimationFrame(() => {
          virtualizer.scrollToIndex(addedCount, { align: 'start' });
        });
      } else if (wasNearBottomRef.current) {
        // New messages at bottom — auto-scroll
        requestAnimationFrame(() => {
          virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
        });
      }
    }
    prevMessageCountRef.current = messages.length;
    isLoadingOlderRef.current = false;
  }, [messages.length, virtualizer]);

  // Scroll to bottom when opening a channel or when messages first load
  const hasScrolledRef = useRef(false);
  useEffect(() => {
    hasScrolledRef.current = false;
    setHasMore(true);
    isFetchingOlderRef.current = false;
  }, [channelId]);

  useEffect(() => {
    if (messages.length > 0 && !hasScrolledRef.current) {
      hasScrolledRef.current = true;
      // Wait for virtualizer to measure, then scroll
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
      });
    }
  }, [messages.length, channelId, virtualizer]);

  // Handle scroll events for loading older messages
  const handleScroll = useCallback(() => {
    wasNearBottomRef.current = checkNearBottom();

    const el = parentRef.current;
    if (!el) return;

    // Load older messages when scrolled to top
    if (el.scrollTop < 50 && !isLoading && !isFetchingOlderRef.current && hasMore && messages.length > 0) {
      isFetchingOlderRef.current = true;
      isLoadingOlderRef.current = true;
      const prevCount = messages.length;
      const messageStore = useMessageStore.getState();
      messageStore.fetchMessages(channelId, 50, messages.length).then(() => {
        const newCount = useMessageStore.getState().messages[channelId]?.length ?? 0;
        // If no new messages were added, we've reached the beginning
        if (newCount <= prevCount) {
          setHasMore(false);
        }
        isFetchingOlderRef.current = false;
      });
    }
  }, [channelId, isLoading, hasMore, messages.length, checkNearBottom]);

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        {error ? (
          <>
            <p className="text-sm text-destructive">Failed to load messages</p>
            <button
              onClick={() => fetchMessages(channelId)}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Retry
            </button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No messages yet. Start the conversation!</p>
        )}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto"
    >
      {isLoading && (
        <div className="py-4 text-center text-xs text-muted-foreground">Loading...</div>
      )}
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement}
            className={cn(
              newMessageIds.has(messages[virtualItem.index]?.id)
                && 'animate-slide-up-fade animate-highlight-flash',
            )}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {isNewDay(messages[virtualItem.index], messages[virtualItem.index - 1]) && (
              <div className="flex items-center gap-3 px-5 py-2">
                <div className="h-px flex-1 bg-border" />
                <span className="shrink-0 text-xs font-medium text-muted-foreground">
                  {formatDateSeparator(new Date(messages[virtualItem.index].created_at))}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
            )}
            <MessageItem
              message={messages[virtualItem.index]}
              isCompact={isCompact(virtualItem.index)}
              onThreadOpen={onThreadOpen}
              onUserInfoOpen={onUserInfoOpen}
            />
          </div>
        ))}
      </div>
      {activeStream && (
        <StreamingMessage
          agentName={activeStream.agentName}
          agentEmoji={activeStream.agentEmoji}
          content={activeStream.content}
        />
      )}
    </div>
  );
}
