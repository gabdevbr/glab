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
    <aside className="flex h-full w-[400px] shrink-0 flex-col border-l border-border bg-chat-bg animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-bold text-foreground">Thread</h3>
        <button
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-xs text-muted-foreground">Loading thread...</p>
          </div>
        ) : (
          <>
            {/* Parent message */}
            {parent && (
              <div className="border-b border-border pb-3">
                <MessageItem message={parent} isCompact={false} />
              </div>
            )}

            {/* Replies count divider */}
            <div className="flex items-center gap-3 px-5 py-3">
              <div className="h-px flex-1 bg-secondary" />
              <span className="text-xs text-muted-foreground">
                {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
              </span>
              <div className="h-px flex-1 bg-secondary" />
            </div>

            {/* Replies */}
            <div className="px-0 py-1">
              {replies.length === 0 && (
                <p className="px-4 py-3 text-center text-xs text-muted-foreground">
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
      <div className="border-t border-border px-4 py-3">
        <form onSubmit={handleSubmit}>
          <div className="overflow-hidden rounded-lg border border-chat-input-border bg-chat-input-bg focus-within:border-chat-input-focus focus-within:ring-1 focus-within:ring-chat-input-focus">
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
              className="block w-full resize-none bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <div className="flex items-center justify-end border-t border-border/50 px-3 py-1.5">
              <button
                type="submit"
                disabled={!content.trim()}
                className="shrink-0 rounded-lg bg-accent-primary p-1.5 text-accent-primary-text hover:bg-accent-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="size-4" />
              </button>
            </div>
          </div>
        </form>
      </div>
    </aside>
  );
}
