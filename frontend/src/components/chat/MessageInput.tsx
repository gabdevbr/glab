'use client';

import { useState, useRef, useCallback, KeyboardEvent, FormEvent } from 'react';
import { wsClient } from '@/lib/ws';

interface MessageInputProps {
  channelId: string;
  channelName: string;
  isConnected: boolean;
}

export function MessageInput({ channelId, channelName, isConnected }: MessageInputProps) {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastTypingSentRef = useRef(0);

  const adjustHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    // Clamp to ~5 rows (approx 120px)
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, []);

  function handleInput(value: string) {
    setContent(value);

    // Debounced typing indicator: max once per 3 seconds
    const now = Date.now();
    if (now - lastTypingSentRef.current > 3000) {
      wsClient.send('typing.start', { channel_id: channelId });
      lastTypingSentRef.current = now;
    }

    requestAnimationFrame(adjustHeight);
  }

  function sendMessage() {
    const trimmed = content.trim();
    if (!trimmed || !isConnected) return;

    wsClient.send('message.send', {
      channel_id: channelId,
      content: trimmed,
    });
    wsClient.send('typing.stop', { channel_id: channelId });
    setContent('');
    lastTypingSentRef.current = 0;

    // Reset height
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) ta.style.height = 'auto';
    });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    sendMessage();
  }

  return (
    <div className="border-t border-slate-800 px-4 py-3">
      <form onSubmit={handleSubmit}>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => handleInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Message #${channelName}`}
          disabled={!isConnected}
          rows={1}
          className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-slate-600 focus:outline-none focus:ring-1 focus:ring-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </form>
    </div>
  );
}
