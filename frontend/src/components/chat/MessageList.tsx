'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMessageStore } from '@/stores/messageStore';
import { useAIStreamStore } from '@/stores/aiStreamStore';
import { Message } from '@/lib/types';
import { MessageItem } from './MessageItem';
import { StreamingMessage } from './StreamingMessage';

interface MessageListProps {
  channelId: string;
  onThreadOpen?: (messageId: string) => void;
}

const COMPACT_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const EMPTY_MESSAGES: Message[] = [];

export function MessageList({ channelId, onThreadOpen }: MessageListProps) {
  const messages = useMessageStore((s) => s.messages[channelId] ?? EMPTY_MESSAGES);
  const isLoading = useMessageStore((s) => s.isLoading);
  const activeStream = useAIStreamStore((s) => s.channelStreams[channelId]);

  const parentRef = useRef<HTMLDivElement>(null);
  const wasNearBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);
  const isLoadingOlderRef = useRef(false);

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
    estimateSize: (index) => (isCompact(index) ? 28 : 52),
    overscan: 20,
  });

  // Check if user is near the bottom
  const checkNearBottom = useCallback(() => {
    const el = parentRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  // Auto-scroll to bottom when new messages arrive (if user was near bottom)
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      const addedToEnd =
        messages.length > 0 &&
        prevMessageCountRef.current > 0 &&
        !isLoadingOlderRef.current;

      if (addedToEnd && wasNearBottomRef.current) {
        // Small delay to let virtualizer measure
        requestAnimationFrame(() => {
          virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
        });
      }
    }
    prevMessageCountRef.current = messages.length;
    isLoadingOlderRef.current = false;
  }, [messages.length, virtualizer]);

  // Scroll to bottom on initial load
  useEffect(() => {
    if (messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
    }
    // Only run on channelId change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  // Handle scroll events for loading older messages
  const handleScroll = useCallback(() => {
    wasNearBottomRef.current = checkNearBottom();

    const el = parentRef.current;
    if (!el) return;

    // Load older messages when scrolled to top
    if (el.scrollTop < 50 && !isLoading && messages.length > 0) {
      isLoadingOlderRef.current = true;
      // Fetch older messages by passing current count as offset
      const messageStore = useMessageStore.getState();
      messageStore.fetchMessages(channelId, 50, messages.length);
    }
  }, [channelId, isLoading, messages.length, checkNearBottom]);

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">No messages yet. Start the conversation!</p>
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
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <MessageItem
              message={messages[virtualItem.index]}
              isCompact={isCompact(virtualItem.index)}
              onThreadOpen={onThreadOpen}
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
