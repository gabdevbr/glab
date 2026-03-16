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
    <div className="flex h-full w-80 shrink-0 flex-col border-l border-slate-800 bg-slate-950">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2.5">
        <Pin className="size-3.5 text-amber-400" />
        <h3 className="flex-1 text-sm font-semibold text-slate-100">Pinned Messages</h3>
        <button
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <p className="py-4 text-center text-xs text-slate-500">Loading...</p>
        )}
        {!isLoading && messages.length === 0 && (
          <p className="py-4 text-center text-xs text-slate-500">
            No pinned messages
          </p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="border-b border-slate-800/50">
            <MessageItem message={msg} isCompact={false} />
          </div>
        ))}
      </div>
    </div>
  );
}
