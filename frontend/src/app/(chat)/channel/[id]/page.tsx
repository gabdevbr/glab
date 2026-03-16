'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useChannelStore } from '@/stores/channelStore';
import { useMessageStore } from '@/stores/messageStore';
import { usePresenceStore } from '@/stores/presenceStore';
import { useWSStore } from '@/stores/wsStore';
import { wsClient } from '@/lib/ws';
import { Message } from '@/lib/types';
import { MessageList } from '@/components/chat/MessageList';
import { MessageInput } from '@/components/chat/MessageInput';
import { TypingIndicator } from '@/components/chat/TypingIndicator';
import { ThreadPanel } from '@/components/chat/ThreadPanel';
import { PinnedMessages } from '@/components/chat/PinnedMessages';
import { SearchResults } from '@/components/chat/SearchResults';
import { Hash, Users, Pin, Search } from 'lucide-react';

type RightPanel =
  | { type: 'none' }
  | { type: 'thread'; messageId: string }
  | { type: 'pinned' }
  | { type: 'search' };

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

  const channel = channels.find((c) => c.id === channelId);

  // Set active channel and fetch messages on mount
  useEffect(() => {
    setActiveChannel(channelId);
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

  // Wire WS event handlers
  useEffect(() => {
    const unsubNewMsg = wsClient.on('message.new', (payload: unknown) => {
      const msg = payload as Message;
      if (msg.channel_id === channelId) {
        addMessage(channelId, msg);
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
      const data = payload as { id: string; channel_id: string; content: string; edited_at: string };
      if (data.channel_id === channelId) {
        updateMessage(channelId, data.id, {
          content: data.content,
          edited_at: data.edited_at,
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
  const channelName = channel?.name || 'loading';

  return (
    <div className="flex h-full flex-1 min-w-0">
      {/* Main chat area */}
      <div className="flex flex-1 flex-col bg-slate-950">
        {/* Channel header */}
        <header className="flex flex-col border-b border-slate-800 px-5 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {!isDM && <Hash className="size-5 text-slate-400" />}
              <h2 className="text-[15px] font-bold text-slate-100">{channelName}</h2>
              {channel?.member_count != null && (
                <span className="flex items-center gap-1 rounded-md bg-slate-800/50 px-2 py-0.5 text-xs text-slate-400">
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
                className="rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
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
                className="rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                title="Search"
              >
                <Search className="size-4" />
              </button>
            </div>
          </div>
          {channel?.topic && (
            <p className="mt-1 truncate text-[13px] text-slate-500">{channel.topic}</p>
          )}
        </header>

        {/* Messages */}
        <MessageList channelId={channelId} onThreadOpen={handleThreadOpen} />

        {/* Typing + Input */}
        <TypingIndicator channelId={channelId} />
        <MessageInput
          channelId={channelId}
          channelName={channelName}
          isConnected={isConnected}
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
          onClose={() => setRightPanel({ type: 'none' })}
        />
      )}
    </div>
  );
}
