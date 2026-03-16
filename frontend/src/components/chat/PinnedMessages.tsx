'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Message } from '@/lib/types';
import { MessageItem } from './MessageItem';
import { X, Pin } from 'lucide-react';

interface PinnedMessagesProps {
  channelId: string;
  onClose: () => void;
}

export function PinnedMessages({ channelId, onClose }: PinnedMessagesProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    api
      .get<Message[]>(`/api/v1/channels/${channelId}/messages/pinned`)
      .then((data) => {
        setMessages(data);
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, [channelId]);

  return (
    <div className="flex h-full w-[400px] shrink-0 flex-col border-l border-border bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Pin className="size-4 text-pin-color" />
        <h3 className="flex-1 text-sm font-semibold text-foreground">Pinned Messages</h3>
        <button
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <p className="py-4 text-center text-xs text-muted-foreground">Loading...</p>
        )}
        {!isLoading && messages.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No pinned messages
          </p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="border-b border-border/50">
            <MessageItem message={msg} isCompact={false} />
          </div>
        ))}
      </div>
    </div>
  );
}
