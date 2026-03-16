'use client';

import { useEffect } from 'react';
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
import { Hash, Users } from 'lucide-react';

export default function ChannelPage() {
  const params = useParams<{ id: string }>();
  const channelId = params.id;

  const channels = useChannelStore((s) => s.channels);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const fetchMessages = useMessageStore((s) => s.fetchMessages);
  const addMessage = useMessageStore((s) => s.addMessage);
  const updateMessage = useMessageStore((s) => s.updateMessage);
  const deleteMessage = useMessageStore((s) => s.deleteMessage);
  const setTyping = usePresenceStore((s) => s.setTyping);
  const isConnected = useWSStore((s) => s.isConnected);

  const channel = channels.find((c) => c.id === channelId);

  // Set active channel and fetch messages on mount
  useEffect(() => {
    setActiveChannel(channelId);
    fetchMessages(channelId);
  }, [channelId, setActiveChannel, fetchMessages]);

  // Wire WS event handlers
  useEffect(() => {
    const unsubNewMsg = wsClient.on('message.new', (payload: unknown) => {
      const msg = payload as Message;
      if (msg.channel_id === channelId) {
        addMessage(channelId, msg);
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
      unsubTyping();
    };
  }, [channelId, addMessage, updateMessage, deleteMessage, setTyping]);

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
    <div className="flex h-full flex-col bg-slate-950">
      {/* Channel header */}
      <header className="flex items-center gap-3 border-b border-slate-800 px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          {!isDM && <Hash className="size-4 text-slate-400" />}
          <h2 className="text-sm font-semibold text-slate-100">{channelName}</h2>
        </div>
        {channel?.topic && (
          <>
            <div className="h-4 w-px bg-slate-700" />
            <span className="truncate text-xs text-slate-400">{channel.topic}</span>
          </>
        )}
        <div className="ml-auto flex items-center gap-1 text-xs text-slate-500">
          {channel?.member_count != null && (
            <span className="flex items-center gap-1">
              <Users className="size-3.5" />
              {channel.member_count}
            </span>
          )}
        </div>
      </header>

      {/* Messages */}
      <MessageList channelId={channelId} />

      {/* Typing + Input */}
      <TypingIndicator channelId={channelId} />
      <MessageInput
        channelId={channelId}
        channelName={channelName}
        isConnected={isConnected}
      />
    </div>
  );
}
