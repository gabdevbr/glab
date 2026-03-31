'use client';

import { useState, useRef, useCallback, useEffect, KeyboardEvent, FormEvent, DragEvent, ClipboardEvent } from 'react';
import { wsClient } from '@/lib/ws';
import { api } from '@/lib/api';
import { User, Channel } from '@/lib/types';
import { useAuthStore } from '@/stores/authStore';
import { MentionAutocomplete, getMentionItemCount } from './MentionAutocomplete';
import { SlashCommandPopup, getSlashCommandCount, getMatchedCommand } from './SlashCommandPopup';
import { Paperclip, X, Lock, Bold, Italic, Strikethrough, Code, List, ListOrdered, Quote } from 'lucide-react';

interface MessageInputProps {
  channelId: string;
  channelName: string;
  isConnected: boolean;
  threadId?: string;
  channel?: Channel;
  /** Called when user presses ↑ in empty input to edit last message */
  onEditLastMessage?: () => void;
}

/** Wraps selected text in a textarea with prefix/suffix markdown markers. */
function wrapSelection(ta: HTMLTextAreaElement, prefix: string, suffix: string): string {
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const value = ta.value;
  const selected = value.slice(start, end);

  // If already wrapped, unwrap
  const beforePrefix = value.slice(Math.max(0, start - prefix.length), start);
  const afterSuffix = value.slice(end, end + suffix.length);
  if (beforePrefix === prefix && afterSuffix === suffix) {
    const newValue = value.slice(0, start - prefix.length) + selected + value.slice(end + suffix.length);
    requestAnimationFrame(() => {
      ta.setSelectionRange(start - prefix.length, end - prefix.length);
    });
    return newValue;
  }

  const newValue = value.slice(0, start) + prefix + selected + suffix + value.slice(end);
  requestAnimationFrame(() => {
    ta.setSelectionRange(start + prefix.length, end + prefix.length);
  });
  return newValue;
}

export function MessageInput({ channelId, channelName, isConnected, threadId, channel, onEditLastMessage }: MessageInputProps) {
  const authUser = useAuthStore((s) => s.user);
  const isReadOnly = channel?.read_only && authUser?.role !== 'admin';

  const [content, setContent] = useState('');
  const [uploadingFile, setUploadingFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [users, setUsers] = useState<User[]>([]);
  const [slashInput, setSlashInput] = useState<string | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTypingSentRef = useRef(0);

  // Load users for mention autocomplete
  useEffect(() => {
    api.get<User[]>('/api/v1/users').then(setUsers).catch(() => {});
  }, []);

  // Auto-focus textarea when channel changes
  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 100);
  }, [channelId]);

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

    // Detect slash command at start of input
    if (value.startsWith('/')) {
      setSlashInput(value.slice(1)); // everything after the "/"
      setSlashIndex(0);
      setMentionQuery(null);
    } else {
      setSlashInput(null);

      // Detect @mention
      const ta = textareaRef.current;
      if (ta) {
        const q = detectMention(value, ta.selectionStart);
        setMentionQuery(q);
        setMentionIndex(0);
      }
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

  function handleGifSelect(gifUrl: string) {
    if (!isConnected) return;
    wsClient.send('message.send', {
      channel_id: channelId,
      content: gifUrl,
      ...(threadId ? { thread_id: threadId } : {}),
    });
    setContent('');
    setSlashInput(null);
    lastTypingSentRef.current = 0;
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.style.height = 'auto';
        ta.focus();
      }
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

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      setUploadingFile(file);
      handleFileUpload(file);
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const files = e.clipboardData.files;
    if (files.length > 0) {
      e.preventDefault();
      let file = files[0];
      // Give clipboard images a meaningful filename instead of browser defaults like "image.png"
      if (file.type.startsWith('image/')) {
        const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        file = new File([file], `clipboard-${timestamp}.${ext}`, { type: file.type });
      }
      setUploadingFile(file);
      handleFileUpload(file);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Slash command keyboard handling
    if (slashInput !== null) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashInput(null);
        setContent('');
        return;
      }
      const cmdCount = getSlashCommandCount(slashInput);
      if (cmdCount > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSlashIndex((i) => i + 1);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSlashIndex((i) => Math.max(0, i - 1));
          return;
        }
        if (e.key === 'Tab' || e.key === 'Enter') {
          // Auto-complete the matched command
          const matched = getMatchedCommand(slashInput);
          if (!matched) {
            // Complete to first matching command
            e.preventDefault();
            const commands = ['giphy'];
            const commandName = slashInput.split(/\s+/)[0]?.toLowerCase() || '';
            const match = commands.filter((c) => c.startsWith(commandName))[slashIndex % cmdCount];
            if (match) {
              const newValue = `/${match} `;
              setContent(newValue);
              setSlashInput(newValue.slice(1));
              requestAnimationFrame(() => {
                const ta = textareaRef.current;
                if (ta) {
                  ta.setSelectionRange(newValue.length, newValue.length);
                }
              });
            }
            return;
          }
        }
      }
      // In GIF mode, Enter should not send — let the popup handle clicks
      if (getMatchedCommand(slashInput) && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        return;
      }
    }

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
        const q = (mentionQuery || '').toLowerCase();
        const mentionUsers = users.map((u) => ({
          id: u.id, username: u.username, display_name: u.display_name, is_bot: u.is_bot,
        }));
        const itemCount = getMentionItemCount(mentionUsers, mentionQuery || '');
        if (itemCount > 0) {
          e.preventDefault();
          // Determine which item is selected across special + user lists
          const idx = mentionIndex % itemCount;
          const specialMentions = ['all', 'here', 'channel'].filter((k) => k.startsWith(q));
          if (idx < specialMentions.length) {
            insertMention(specialMentions[idx]);
          } else {
            const filtered = users.filter((u) =>
              u.username.toLowerCase().includes(q) || u.display_name.toLowerCase().includes(q),
            ).slice(0, 8);
            insertMention(filtered[idx - specialMentions.length].username);
          }
          return;
        }
      }
      if (e.key === 'Escape') {
        setMentionQuery(null);
        return;
      }
    }

    const isMod = e.metaKey || e.ctrlKey;
    const ta = textareaRef.current;

    // --- Formatting shortcuts ---
    if (isMod && ta) {
      // Bold: Ctrl/⌘ + B
      if (e.key === 'b') {
        e.preventDefault();
        setContent(wrapSelection(ta, '**', '**'));
        return;
      }
      // Italic: Ctrl/⌘ + I
      if (e.key === 'i') {
        e.preventDefault();
        setContent(wrapSelection(ta, '_', '_'));
        return;
      }
      // Strikethrough: Ctrl/⌘ + Shift + X
      if (e.shiftKey && e.key === 'X') {
        e.preventDefault();
        setContent(wrapSelection(ta, '~~', '~~'));
        return;
      }
      // Inline code: Ctrl/⌘ + Shift + C
      if (e.shiftKey && e.key === 'C') {
        e.preventDefault();
        setContent(wrapSelection(ta, '`', '`'));
        return;
      }
      // Code block: Ctrl/⌘ + Alt + Shift + C
      if (e.shiftKey && e.altKey && (e.key === 'C' || e.key === 'c')) {
        e.preventDefault();
        setContent(wrapSelection(ta, '```\n', '\n```'));
        return;
      }
      // Quote: Ctrl/⌘ + Shift + 9
      if (e.shiftKey && e.key === '9') {
        e.preventDefault();
        setContent(wrapSelection(ta, '> ', ''));
        return;
      }
      // Bulleted list: Ctrl/⌘ + Shift + 8
      if (e.shiftKey && e.key === '8') {
        e.preventDefault();
        setContent(wrapSelection(ta, '- ', ''));
        return;
      }
      // Numbered list: Ctrl/⌘ + Shift + 7
      if (e.shiftKey && e.key === '7') {
        e.preventDefault();
        setContent(wrapSelection(ta, '1. ', ''));
        return;
      }
    }

    // --- Edit last message: ↑ in empty input ---
    if (e.key === 'ArrowUp' && content === '' && onEditLastMessage) {
      e.preventDefault();
      onEditLastMessage();
      return;
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

  if (isReadOnly) {
    return (
      <div className="px-5 pb-5 pt-2">
        <div className="flex items-center justify-center gap-2 rounded-xl border border-chat-input-border bg-chat-input-bg px-4 py-4 text-muted-foreground">
          <Lock className="size-4" />
          <span className="text-sm">This is a read-only channel. Only admins can post messages.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative px-5 pb-5 pt-2" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      {/* Slash command popup */}
      {slashInput !== null && (
        <SlashCommandPopup
          input={slashInput}
          onSelectGif={handleGifSelect}
          onClose={() => { setSlashInput(null); setContent(''); }}
          selectedIndex={slashIndex}
        />
      )}

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

      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent/10">
          <span className="text-sm font-medium text-accent">Drop file to upload</span>
        </div>
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
            onPaste={handlePaste}
            placeholder={`Message #${channelName}`}
            disabled={!isConnected}
            rows={1}
            data-chat-input
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
            <div className="mx-1 h-4 w-px bg-border/50" />
            {/* Formatting buttons */}
            <button type="button" onClick={() => { const ta = textareaRef.current; if (ta) { setContent(wrapSelection(ta, '**', '**')); ta.focus(); } }} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Bold (Ctrl+B)">
              <Bold className="size-3.5" />
            </button>
            <button type="button" onClick={() => { const ta = textareaRef.current; if (ta) { setContent(wrapSelection(ta, '_', '_')); ta.focus(); } }} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Italic (Ctrl+I)">
              <Italic className="size-3.5" />
            </button>
            <button type="button" onClick={() => { const ta = textareaRef.current; if (ta) { setContent(wrapSelection(ta, '~~', '~~')); ta.focus(); } }} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Strikethrough (Ctrl+Shift+X)">
              <Strikethrough className="size-3.5" />
            </button>
            <button type="button" onClick={() => { const ta = textareaRef.current; if (ta) { setContent(wrapSelection(ta, '`', '`')); ta.focus(); } }} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Code (Ctrl+Shift+C)">
              <Code className="size-3.5" />
            </button>
            <button type="button" onClick={() => { const ta = textareaRef.current; if (ta) { setContent(wrapSelection(ta, '> ', '')); ta.focus(); } }} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Quote (Ctrl+Shift+9)">
              <Quote className="size-3.5" />
            </button>
            <button type="button" onClick={() => { const ta = textareaRef.current; if (ta) { setContent(wrapSelection(ta, '- ', '')); ta.focus(); } }} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Bulleted list (Ctrl+Shift+8)">
              <List className="size-3.5" />
            </button>
            <button type="button" onClick={() => { const ta = textareaRef.current; if (ta) { setContent(wrapSelection(ta, '1. ', '')); ta.focus(); } }} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Numbered list (Ctrl+Shift+7)">
              <ListOrdered className="size-3.5" />
            </button>
            <div className="flex-1" />
          </div>
        </div>
      </form>
    </div>
  );
}
