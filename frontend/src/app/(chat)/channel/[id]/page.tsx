'use client';

import { useEffect, useState, useCallback, useRef, DragEvent } from 'react';
import { useParams } from 'next/navigation';
import { useChannelStore } from '@/stores/channelStore';
import { useMessageStore } from '@/stores/messageStore';
import { usePresenceStore } from '@/stores/presenceStore';
import { useAuthStore } from '@/stores/authStore';
import { useWSStore } from '@/stores/wsStore';
import { wsClient } from '@/lib/ws';
import { api } from '@/lib/api';
import { Message, Channel } from '@/lib/types';
import { MessageList } from '@/components/chat/MessageList';
import { MessageInput } from '@/components/chat/MessageInput';
import { TypingIndicator } from '@/components/chat/TypingIndicator';
import { ThreadPanel } from '@/components/chat/ThreadPanel';
import { PinnedMessages } from '@/components/chat/PinnedMessages';
import { SearchResults } from '@/components/chat/SearchResults';
import { UserInfoPanel } from '@/components/chat/UserInfoPanel';
import { Hash, Users, Pin, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

type RightPanel =
  | { type: 'none' }
  | { type: 'thread'; messageId: string }
  | { type: 'pinned' }
  | { type: 'search' }
  | { type: 'userInfo'; userId: string };

export default function ChannelPage() {
  const params = useParams<{ id: string }>();
  const channelId = params.id;

  const channels = useChannelStore((s) => s.channels);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const clearUnread = useChannelStore((s) => s.clearUnread);
  const incrementUnread = useChannelStore((s) => s.incrementUnread);
  const fetchMessages = useMessageStore((s) => s.fetchMessages);
  const addMessage = useMessageStore((s) => s.addMessage);
  const updateMessage = useMessageStore((s) => s.updateMessage);
  const deleteMessage = useMessageStore((s) => s.deleteMessage);
  const addReaction = useMessageStore((s) => s.addReaction);
  const removeReaction = useMessageStore((s) => s.removeReaction);
  const updateThreadSummary = useMessageStore((s) => s.updateThreadSummary);
  const pinMessage = useMessageStore((s) => s.pinMessage);
  const unpinMessage = useMessageStore((s) => s.unpinMessage);
  const setTyping = usePresenceStore((s) => s.setTyping);
  const isConnected = useWSStore((s) => s.isConnected);

  const [rightPanel, setRightPanel] = useState<RightPanel>({ type: 'none' });
  const [directChannel, setDirectChannel] = useState<Channel | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const dragCounterRef = useRef(0);
  const authUser = useAuthStore((s) => s.user);

  const storeChannel = channels.find((c) => c.id === channelId);
  const channel = storeChannel ?? directChannel ?? undefined;

  // If channel not in store (e.g. hidden), fetch it directly from the API
  const fetchedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!storeChannel && fetchedRef.current !== channelId) {
      fetchedRef.current = channelId;
      api.get<Channel>(`/api/v1/channels/${channelId}`).then(setDirectChannel).catch(() => {});
    }
    if (storeChannel) {
      setDirectChannel(null);
    }
  }, [channelId, storeChannel]);

  // Set active channel, subscribe via WS, and fetch messages on mount
  useEffect(() => {
    setActiveChannel(channelId);
    wsClient.send('subscribe', { channel_ids: [channelId] });
    fetchMessages(channelId);
    clearUnread(channelId);
  }, [channelId, setActiveChannel, fetchMessages, clearUnread]);

  // Close right panel on channel switch
  useEffect(() => {
    setRightPanel({ type: 'none' });
  }, [channelId]);

  const handleThreadOpen = useCallback((messageId: string) => {
    setRightPanel({ type: 'thread', messageId });
  }, []);

  const handleEditLastMessage = useCallback(() => {
    const msgs = useMessageStore.getState().messages[channelId];
    if (!msgs || !authUser) return;
    // Find the last own text message (not file/system)
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.user_id === authUser.id && m.content_type === 'text' && !m.thread_id) {
        setEditingMessageId(m.id);
        return;
      }
    }
  }, [channelId, authUser]);

  const handleUserInfoOpen = useCallback((userId: string) => {
    setRightPanel((p) =>
      p.type === 'userInfo' && p.userId === userId
        ? { type: 'none' }
        : { type: 'userInfo', userId },
    );
  }, []);

  // Wire WS event handlers
  useEffect(() => {
    const unsubNewMsg = wsClient.on('message.new', (payload: unknown) => {
      const msg = payload as Message;
      if (msg.channel_id === channelId) {
        // Thread replies are only shown in the ThreadPanel, not in the main channel list
        if (!msg.thread_id) {
          addMessage(channelId, msg);
        }
        // Mark as read since user is viewing
        wsClient.send('channel.read', {
          channel_id: channelId,
          message_id: msg.id,
        });
      } else {
        // Increment unread for other channels
        incrementUnread(msg.channel_id);
      }
    });

    const unsubEditMsg = wsClient.on('message.edited', (payload: unknown) => {
      const data = payload as { id: string; channel_id: string; content: string; edited_at: string; original_content?: string };
      if (data.channel_id === channelId) {
        updateMessage(channelId, data.id, {
          content: data.content,
          edited_at: data.edited_at,
          original_content: data.original_content,
        });
      }
    });

    const unsubDeleteMsg = wsClient.on('message.deleted', (payload: unknown) => {
      const data = payload as { id: string; channel_id: string };
      if (data.channel_id === channelId) {
        deleteMessage(channelId, data.id);
      }
    });

    const unsubPinned = wsClient.on('message.pinned', (payload: unknown) => {
      const data = payload as { id: string; channel_id: string };
      if (data.channel_id === channelId) {
        pinMessage(channelId, data.id);
      }
    });

    const unsubUnpinned = wsClient.on('message.unpinned', (payload: unknown) => {
      const data = payload as { id: string; channel_id: string };
      if (data.channel_id === channelId) {
        unpinMessage(channelId, data.id);
      }
    });

    const unsubReaction = wsClient.on('reaction.updated', (payload: unknown) => {
      const data = payload as {
        message_id: string;
        channel_id: string;
        emoji: string;
        user_id: string;
        username: string;
        action: 'add' | 'remove';
      };
      if (data.channel_id === channelId) {
        if (data.action === 'add') {
          addReaction(channelId, data.message_id, {
            emoji: data.emoji,
            user_id: data.user_id,
            username: data.username,
          });
        } else {
          removeReaction(channelId, data.message_id, data.emoji, data.user_id);
        }
      }
    });

    const unsubThread = wsClient.on('thread.updated', (payload: unknown) => {
      const data = payload as {
        message_id: string;
        channel_id: string;
        reply_count: number;
        last_reply_at: string;
      };
      if (data.channel_id === channelId) {
        updateThreadSummary(channelId, data.message_id, data.reply_count, data.last_reply_at);
      }
    });

    const unsubTyping = wsClient.on('typing', (payload: unknown) => {
      const data = payload as {
        channel_id: string;
        user_id: string;
        is_typing: boolean;
      };
      if (data.channel_id === channelId) {
        setTyping(channelId, data.user_id, data.is_typing);
      }
    });

    return () => {
      unsubNewMsg();
      unsubEditMsg();
      unsubDeleteMsg();
      unsubPinned();
      unsubUnpinned();
      unsubReaction();
      unsubThread();
      unsubTyping();
    };
  }, [
    channelId, addMessage, updateMessage, deleteMessage, setTyping,
    addReaction, removeReaction, updateThreadSummary, pinMessage, unpinMessage,
    incrementUnread,
  ]);

  // Mark channel as read when viewing
  useEffect(() => {
    const messages = useMessageStore.getState().messages[channelId];
    if (messages && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      wsClient.send('channel.read', {
        channel_id: channelId,
        message_id: lastMsg.id,
      });
    }
  }, [channelId]);

  const isDM = channel?.type === 'dm';
  const channelName = channel?.name || '';

  // Drag-and-drop file upload on the entire chat area
  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      setDroppedFile(file);
      // Reset so the same file can be dropped again
      setTimeout(() => setDroppedFile(null), 100);
    }
  }, []);

  const handleChatAreaClick = useCallback((e: { target: EventTarget | null }) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, a, textarea, input, [role="button"], [data-chat-input]')) return;
    // Don't steal focus from thread panel when it's open
    if (rightPanel.type === 'thread') return;
    const input = document.querySelector<HTMLTextAreaElement>('[data-chat-input]');
    input?.focus();
  }, [rightPanel.type]);

  return (
    <div className="flex h-full flex-1 min-w-0">
      {/* Main chat area */}
      <div
        key={channelId}
        className="relative flex flex-1 flex-col bg-chat-bg animate-in fade-in-0 duration-150"
        onClick={handleChatAreaClick}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Full-area drag overlay */}
        {isDragging && (
          <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent/10">
            <span className="text-sm font-medium text-accent">Drop file to upload</span>
          </div>
        )}
        {/* Channel header */}
        <header className="flex flex-col border-b border-border px-5 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {!isDM && <Hash className="size-5 text-muted-foreground" />}
              <h2
                className={cn('text-[15px] font-bold text-foreground', isDM && channel?.dm_user_id && 'cursor-pointer hover:underline')}
                onClick={() => {
                  if (isDM && channel?.dm_user_id) handleUserInfoOpen(channel.dm_user_id);
                }}
              >
                {channelName}
              </h2>
              {channel?.member_count != null && (
                <span className="flex items-center gap-1 rounded-md bg-secondary/50 px-2 py-0.5 text-xs text-muted-foreground">
                  <Users className="size-3.5" />
                  {channel.member_count}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() =>
                  setRightPanel((p) =>
                    p.type === 'pinned' ? { type: 'none' } : { type: 'pinned' },
                  )
                }
                className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                title="Pinned messages"
              >
                <Pin className="size-4" />
              </button>
              <button
                onClick={() =>
                  setRightPanel((p) =>
                    p.type === 'search' ? { type: 'none' } : { type: 'search' },
                  )
                }
                className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                title="Search"
              >
                <Search className="size-4" />
              </button>
            </div>
          </div>
          {channel?.topic && (
            <p className="mt-1 truncate text-[13px] text-muted-foreground">{channel.topic}</p>
          )}
        </header>

        {/* Messages */}
        <MessageList channelId={channelId} onThreadOpen={handleThreadOpen} onUserInfoOpen={handleUserInfoOpen} editingMessageId={editingMessageId} onEditingDone={() => setEditingMessageId(null)} />

        {/* Typing + Input */}
        <TypingIndicator channelId={channelId} />
        <MessageInput
          channelId={channelId}
          channelName={channelName}
          isConnected={isConnected}
          channel={channel}
          onEditLastMessage={handleEditLastMessage}
          droppedFile={droppedFile}
        />
      </div>

      {/* Right panel */}
      {rightPanel.type === 'thread' && (
        <ThreadPanel
          parentMessageId={rightPanel.messageId}
          channelId={channelId}
          onClose={() => setRightPanel({ type: 'none' })}
        />
      )}
      {rightPanel.type === 'pinned' && (
        <PinnedMessages
          channelId={channelId}
          onClose={() => setRightPanel({ type: 'none' })}
        />
      )}
      {rightPanel.type === 'search' && (
        <SearchResults
          channelId={channelId}
          onClose={() => setRightPanel({ type: 'none' })}
        />
      )}
      {rightPanel.type === 'userInfo' && (
        <UserInfoPanel
          userId={rightPanel.userId}
          onClose={() => setRightPanel({ type: 'none' })}
        />
      )}
    </div>
  );
}
