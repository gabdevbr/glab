'use client';

import { useState, useRef, useCallback, useEffect, KeyboardEvent, FormEvent } from 'react';
import { wsClient } from '@/lib/ws';
import { api } from '@/lib/api';
import { User } from '@/lib/types';
import { MentionAutocomplete } from './MentionAutocomplete';
import { Paperclip, X } from 'lucide-react';

interface MessageInputProps {
  channelId: string;
  channelName: string;
  isConnected: boolean;
  threadId?: string;
}

export function MessageInput({ channelId, channelName, isConnected, threadId }: MessageInputProps) {
  const [content, setContent] = useState('');
  const [uploadingFile, setUploadingFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [users, setUsers] = useState<User[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTypingSentRef = useRef(0);

  // Load users for mention autocomplete
  useEffect(() => {
    api.get<User[]>('/api/v1/users').then(setUsers).catch(() => {});
  }, []);

  const adjustHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, []);

  function detectMention(value: string, cursorPos: number): string | null {
    // Walk backwards from cursor to find @ trigger
    let i = cursorPos - 1;
    while (i >= 0) {
      const ch = value[i];
      if (ch === '@') {
        // Check that the @ is at start of word (preceded by space, newline, or start)
        if (i === 0 || /\s/.test(value[i - 1])) {
          return value.slice(i + 1, cursorPos);
        }
        return null;
      }
      if (/\s/.test(ch)) return null;
      i--;
    }
    return null;
  }

  function handleInput(value: string) {
    setContent(value);

    // Detect @mention
    const ta = textareaRef.current;
    if (ta) {
      const q = detectMention(value, ta.selectionStart);
      setMentionQuery(q);
      setMentionIndex(0);
    }

    // Debounced typing indicator
    const now = Date.now();
    if (now - lastTypingSentRef.current > 3000) {
      wsClient.send('typing.start', { channel_id: channelId });
      lastTypingSentRef.current = now;
    }

    requestAnimationFrame(adjustHeight);
  }

  function insertMention(username: string) {
    const ta = textareaRef.current;
    if (!ta) return;

    const cursor = ta.selectionStart;
    const value = content;

    // Find the @ position
    let atPos = cursor - 1;
    while (atPos >= 0 && value[atPos] !== '@') atPos--;

    const before = value.slice(0, atPos);
    const after = value.slice(cursor);
    const newValue = `${before}@${username} ${after}`;
    setContent(newValue);
    setMentionQuery(null);

    // Focus and set cursor position after insert
    requestAnimationFrame(() => {
      const newCursor = atPos + username.length + 2; // @username + space
      ta.focus();
      ta.setSelectionRange(newCursor, newCursor);
    });
  }

  function sendMessage() {
    const trimmed = content.trim();
    if (!trimmed || !isConnected) return;

    wsClient.send('message.send', {
      channel_id: channelId,
      content: trimmed,
      ...(threadId ? { thread_id: threadId } : {}),
    });
    wsClient.send('typing.stop', { channel_id: channelId });
    setContent('');
    setMentionQuery(null);
    lastTypingSentRef.current = 0;

    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) ta.style.height = 'auto';
    });
  }

  async function handleFileUpload(file: File) {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.upload(`/api/v1/channels/${channelId}/upload`, formData);
    } catch (err) {
      console.error('Upload failed:', err);
    }
    setIsUploading(false);
    setUploadingFile(null);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setUploadingFile(file);
      handleFileUpload(file);
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery !== null) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => i + 1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        // Let the autocomplete handle selection
        const filtered = users.filter((u) => {
          const q = (mentionQuery || '').toLowerCase();
          return (
            u.username.toLowerCase().includes(q) ||
            u.display_name.toLowerCase().includes(q)
          );
        }).slice(0, 8);
        if (filtered.length > 0) {
          e.preventDefault();
          const idx = mentionIndex % filtered.length;
          insertMention(filtered[idx].username);
          return;
        }
      }
      if (e.key === 'Escape') {
        setMentionQuery(null);
        return;
      }
    }

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
    <div className="relative px-5 pb-5 pt-2">
      {/* Mention autocomplete */}
      {mentionQuery !== null && (
        <MentionAutocomplete
          users={users.map((u) => ({
            id: u.id,
            username: u.username,
            display_name: u.display_name,
            is_bot: u.is_bot,
          }))}
          query={mentionQuery}
          selectedIndex={mentionIndex}
          onSelect={insertMention}
          onClose={() => setMentionQuery(null)}
        />
      )}

      {/* Upload progress */}
      {isUploading && uploadingFile && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-chat-input-border bg-secondary/50 px-3 py-1.5 text-xs text-muted-foreground">
          <Paperclip className="size-3.5" />
          <span className="truncate">{uploadingFile.name}</span>
          <span className="text-muted-foreground">Uploading...</span>
        </div>
      )}

      {/* Rich input container */}
      <form onSubmit={handleSubmit}>
        <div className="overflow-hidden rounded-xl border border-chat-input-border bg-chat-input-bg focus-within:border-chat-input-focus focus-within:ring-1 focus-within:ring-chat-input-focus">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message #${channelName}`}
            disabled={!isConnected}
            rows={1}
            className="block w-full resize-none bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          {/* Bottom toolbar */}
          <div className="flex items-center gap-1 border-t border-border/50 px-3 py-1.5">
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || !isConnected}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
              title="Attach file"
            >
              <Paperclip className="size-4" />
            </button>
            <div className="flex-1" />
          </div>
        </div>
      </form>
    </div>
  );
}
