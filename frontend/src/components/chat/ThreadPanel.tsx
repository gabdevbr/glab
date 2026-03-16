'use client';

import { useState, useEffect, useRef, KeyboardEvent, FormEvent } from 'react';
import { api } from '@/lib/api';
import { wsClient } from '@/lib/ws';
import { Message } from '@/lib/types';
import { MessageItem } from './MessageItem';
import { X, Send } from 'lucide-react';

interface ThreadPanelProps {
  parentMessageId: string;
  channelId: string;
  onClose: () => void;
}

export function ThreadPanel({ parentMessageId, channelId, onClose }: ThreadPanelProps) {
  const [parent, setParent] = useState<Message | null>(null);
  const [replies, setReplies] = useState<Message[]>([]);
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch thread messages
  useEffect(() => {
    setIsLoading(true);
    api
      .get<{ parent: Message; replies: Message[] }>(
        `/api/v1/messages/${parentMessageId}/thread`,
      )
      .then((data) => {
        setParent(data.parent);
        setReplies(data.replies);
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, [parentMessageId]);

  // Listen for new thread messages
  useEffect(() => {
    const unsub = wsClient.on('message.new', (payload: unknown) => {
      const msg = payload as Message;
      if (msg.thread_id === parentMessageId) {
        setReplies((prev) => [...prev, msg]);
      }
    });
    return unsub;
  }, [parentMessageId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [replies]);

  function sendReply() {
    const trimmed = content.trim();
    if (!trimmed) return;

    wsClient.send('message.send', {
      channel_id: channelId,
      content: trimmed,
      thread_id: parentMessageId,
    });
    setContent('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendReply();
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    sendReply();
  }

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-slate-800 bg-slate-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2.5">
        <h3 className="text-sm font-semibold text-slate-100">Thread</h3>
        <button
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-xs text-slate-500">Loading thread...</p>
          </div>
        ) : (
          <>
            {/* Parent message */}
            {parent && (
              <div className="border-b border-slate-800 pb-2">
                <MessageItem message={parent} isCompact={false} />
              </div>
            )}

            {/* Replies */}
            <div className="px-0 py-1">
              {replies.length === 0 && (
                <p className="px-4 py-3 text-center text-xs text-slate-500">
                  No replies yet
                </p>
              )}
              {replies.map((msg) => (
                <MessageItem key={msg.id} message={msg} isCompact={false} />
              ))}
            </div>
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-slate-800 px-3 py-2">
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              const ta = e.target;
              ta.style.height = 'auto';
              ta.style.height = `${Math.min(ta.scrollHeight, 100)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder="Reply..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-slate-600 focus:outline-none focus:ring-1 focus:ring-slate-600"
          />
          <button
            type="submit"
            disabled={!content.trim()}
            className="shrink-0 rounded-lg bg-indigo-600 p-2 text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="size-4" />
          </button>
        </form>
      </div>
    </aside>
  );
}
