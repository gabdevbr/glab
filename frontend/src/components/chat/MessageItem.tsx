'use client';

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Message } from '@/lib/types';
import { useAuthStore } from '@/stores/authStore';
import { useMessageStore } from '@/stores/messageStore';
import { wsClient } from '@/lib/ws';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmojiPicker } from './EmojiPicker';
import { ImageLightbox } from './ImageLightbox';
import { MoreHorizontal, Pin, PinOff, Pencil, Trash2, MessageSquare, SmilePlus, Copy, Check, Reply } from 'lucide-react';
import { has as hasEmoji, get as getEmoji } from 'node-emoji';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/+$/, '');

// Custom emoji cache shared across all MessageItem instances
let customEmojiNames: Set<string> | null = null;
let customEmojiFetchPromise: Promise<void> | null = null;

function ensureCustomEmojisLoaded(onLoaded: () => void) {
  if (customEmojiNames) return;
  if (customEmojiFetchPromise) {
    customEmojiFetchPromise.then(onLoaded);
    return;
  }
  const token = localStorage.getItem('glab_token');
  if (!token) return;

  customEmojiFetchPromise = fetch(`${API_URL}/api/v1/emojis/custom`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((r) => (r.ok ? r.json() : []))
    .then((data: { name: string }[]) => {
      customEmojiNames = new Set(data.map((e) => e.name));
      onLoaded();
    })
    .catch(() => {
      customEmojiNames = new Set();
    });
}

/**
 * Resolves an emoji shortcode to its display form.
 * Returns { type: 'custom', name } for custom emojis,
 * { type: 'unicode', emoji } for standard shortcodes, or null if unknown.
 */
function resolveEmoji(name: string): { type: 'custom'; name: string } | { type: 'unicode'; emoji: string } | null {
  if (customEmojiNames?.has(name)) return { type: 'custom', name };
  const unicode = getEmoji(name);
  if (unicode) return { type: 'unicode', emoji: unicode };
  return null;
}

const URL_REGEX = /https?:\/\/[^\s<>'")\]]+/g;
const IMAGE_URL_REGEX = /\.(gif|gifv|webp|png|jpg|jpeg)(\?[^\s]*)?$/i;

function renderWithLinks(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = URL_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const url = match[0].replace(/[.,;:!?)]+$/, '');

    // Render image URLs inline instead of as links
    if (IMAGE_URL_REGEX.test(url)) {
      parts.push(
        <img
          key={`img-${match.index}`}
          src={url}
          alt="image"
          className="mt-1 max-h-64 max-w-xs rounded-lg border border-border"
          loading="lazy"
        />,
      );
    } else {
      parts.push(
        <a
          key={`link-${match.index}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-link-text underline hover:text-link-hover"
        >
          {url}
        </a>,
      );
    }
    lastIndex = match.index + url.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

function renderWithCustomEmojis(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /:([a-zA-Z0-9_+-]+):/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const resolved = resolveEmoji(match[1]);
    if (!resolved) continue;

    if (match.index > lastIndex) {
      parts.push(...renderWithLinks(text.slice(lastIndex, match.index)));
    }

    if (resolved.type === 'custom') {
      parts.push(
        <img
          key={`${match.index}-${resolved.name}`}
          src={`${API_URL}/api/v1/emojis/custom/${resolved.name}`}
          alt={`:${resolved.name}:`}
          title={`:${resolved.name}:`}
          className="inline-block size-5 align-text-bottom"
        />,
      );
    } else {
      parts.push(
        <span key={`${match.index}-${match[1]}`} title={`:${match[1]}:`}>
          {resolved.emoji}
        </span>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(...renderWithLinks(text.slice(lastIndex)));
  }

  return parts.length > 0 ? parts : renderWithLinks(text);
}

// Edit timeout cache shared across all MessageItem instances
let editTimeoutSeconds: number | null = null;
let editTimeoutFetchPromise: Promise<void> | null = null;

function ensureEditTimeoutLoaded(onLoaded: () => void) {
  if (editTimeoutSeconds !== null) return;
  if (editTimeoutFetchPromise) {
    editTimeoutFetchPromise.then(onLoaded);
    return;
  }
  editTimeoutFetchPromise = api
    .getEditTimeoutConfig<{ seconds: number }>()
    .then((data) => {
      editTimeoutSeconds = data.seconds;
      onLoaded();
    })
    .catch(() => {
      editTimeoutSeconds = 900; // default 15 minutes
    });
}

const MENTION_GROUP_KEYWORDS = new Set(['all', 'here', 'channel']);

/**
 * Renders message content with both @mention pills and custom emoji support.
 * First splits by mentions, then applies emoji rendering to text segments.
 */
// Matches RocketChat-style quote links: [ ](https://your-rc-host/...?msg=ID)
// Used to convert legacy RC quotes into Glab thread references during migration.
const RC_QUOTE_RE = /\[[\s]*\]\(https?:\/\/[^)]*[?&]msg=([a-zA-Z0-9]+)[^)]*\)\s*/g;

// Migration namespace — must match backend/migrate transform.go
const MIGRATION_NS = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

/** UUID v5 (SHA-1) matching Go's uuid.NewSHA1 */
async function uuidV5(namespace: string, name: string): Promise<string> {
  // Parse namespace UUID to bytes
  const hex = namespace.replace(/-/g, '');
  const nsBytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) nsBytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  // SHA-1(namespace + name)
  const data = new Uint8Array(nsBytes.length + new TextEncoder().encode(name).length);
  data.set(nsBytes);
  data.set(new TextEncoder().encode(name), nsBytes.length);
  const hash = await crypto.subtle.digest('SHA-1', data);
  const bytes = new Uint8Array(hash);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const h = Array.from(bytes.slice(0, 16), b => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Extract RC quote message ID and clean content. */
function parseRCQuote(content: string): { cleanContent: string; rcMsgId: string | null } {
  let rcMsgId: string | null = null;
  const cleanContent = content
    .replace(RC_QUOTE_RE, (_, id) => { rcMsgId = id; return ''; })
    .replace(/\(edited\)\s*$/g, '')
    .trim();
  return { cleanContent, rcMsgId };
}

function renderWithMentionsAndEmojis(content: string, onUserInfoOpen?: (userId: string) => void): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const mentionRegex = /(?:^|(?<=\s))@(\w+(?:[.-]\w+)*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = mentionRegex.exec(content)) !== null) {
    const name = match[1];
    const isGroup = MENTION_GROUP_KEYWORDS.has(name.toLowerCase());

    if (!isGroup && name.length < 2) continue;

    // Text before mention - apply emoji rendering
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index);
      for (const node of renderWithCustomEmojis(textBefore)) {
        parts.push(typeof node === 'string' ? node : React.cloneElement(node as React.ReactElement, { key: `e${key++}` }));
      }
    }

    // Mention pill
    const displayName = isGroup ? name.toLowerCase() : name;
    parts.push(
      <MentionPill key={`m${key++}`} name={displayName} isGroup={isGroup} onUserInfoOpen={onUserInfoOpen} />,
    );
    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex);
    parts.push(...renderWithCustomEmojis(remaining));
  }

  return parts.length > 0 ? parts : renderWithCustomEmojis(content);
}

function MentionPill({ name, isGroup, onUserInfoOpen }: { name: string; isGroup: boolean; onUserInfoOpen?: (userId: string) => void }) {
  const handleClick = useCallback(() => {
    if (isGroup || !onUserInfoOpen) return;
    api.get<{ id: string }>(`/api/v1/users/by-username/${name}`).then(u => onUserInfoOpen(u.id)).catch(() => {});
  }, [name, isGroup, onUserInfoOpen]);

  return (
    <span
      onClick={isGroup ? undefined : handleClick}
      className={cn(
        'inline-flex items-center rounded px-0.5 font-medium text-[0.9em] transition-all duration-150',
        'bg-accent-primary-subtle text-accent-primary-subtle-text',
        isGroup ? 'cursor-default' : 'cursor-pointer hover:scale-105 hover:brightness-110',
      )}
    >
      @{name}
    </span>
  );
}

function CodeBlock({ className, children }: { className?: string; children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const code = String(children).replace(/\n$/, '');

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div className="group/code relative my-2 overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between bg-secondary/80 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span>{language || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 transition-colors hover:text-foreground"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={language || 'text'}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: '0.8125rem',
          background: 'oklch(0.18 0.01 260)',
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

function InlineCode({ children }: { children?: React.ReactNode }) {
  return (
    <code className="rounded bg-secondary/80 px-1.5 py-0.5 text-[0.85em] font-mono text-foreground">
      {children}
    </code>
  );
}

/** Custom renderers for ReactMarkdown — handles mentions and emojis inside text nodes. */
function useMarkdownComponents(onUserInfoOpen?: (userId: string) => void): Components {
  return useMemo(() => ({
    code({ className, children }) {
      const isBlock = /language-(\w+)/.test(className || '') || String(children).includes('\n');
      if (isBlock) {
        return <CodeBlock className={className}>{children}</CodeBlock>;
      }
      return <InlineCode>{children}</InlineCode>;
    },
    pre({ children }) {
      return <>{children}</>;
    },
    p({ children }) {
      return <p className="whitespace-pre-wrap break-words">{processChildren(children, onUserInfoOpen)}</p>;
    },
    li({ children }) {
      return <li>{processChildren(children, onUserInfoOpen)}</li>;
    },
    a({ href, children }) {
      if (href && IMAGE_URL_REGEX.test(href)) {
        return (
          <img
            src={href}
            alt={String(children)}
            className="mt-1 max-h-64 max-w-xs rounded-lg border border-border"
            loading="lazy"
          />
        );
      }
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-link-text underline hover:text-link-hover">
          {children}
        </a>
      );
    },
    blockquote({ children }) {
      return <blockquote className="border-l-2 border-accent-primary/50 pl-3 text-muted-foreground italic">{children}</blockquote>;
    },
  }), [onUserInfoOpen]);
}

/** Walks ReactMarkdown children, replacing string nodes with mention+emoji rendered nodes. */
function processChildren(children: React.ReactNode, onUserInfoOpen?: (userId: string) => void): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (typeof child === 'string') {
      const nodes = renderWithMentionsAndEmojis(child, onUserInfoOpen);
      return nodes.length === 1 && typeof nodes[0] === 'string' ? nodes[0] : <>{nodes}</>;
    }
    return child;
  });
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString();
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

interface MessageItemProps {
  message: Message;
  isCompact: boolean;
  onThreadOpen?: (messageId: string) => void;
  onUserInfoOpen?: (userId: string) => void;
  editingMessageId?: string | null;
  onEditingDone?: () => void;
}

export function MessageItem({ message, isCompact, onThreadOpen, onUserInfoOpen, editingMessageId, onEditingDone }: MessageItemProps) {
  const user = useAuthStore((s) => s.user);
  const channelMessages = useMessageStore((s) => s.messages[message.channel_id]);
  const mdComponents = useMarkdownComponents(onUserInfoOpen);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiPickerPos, setEmojiPickerPos] = useState<{ top: number; left: number } | null>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [quotedMessage, setQuotedMessage] = useState<Message | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null);
  const [, setImageLoaded] = useState(false);

  const { cleanContent, rcMsgId } = useMemo(() => parseRCQuote(message.content), [message.content]);

  // Resolve RC quote to a Glab message
  useEffect(() => {
    if (!rcMsgId) return;
    let cancelled = false;
    uuidV5(MIGRATION_NS, `msg:${rcMsgId}`).then((glabId) => {
      if (cancelled) return;
      const found = channelMessages?.find((m) => m.id === glabId);
      if (found) setQuotedMessage(found);
    });
    return () => { cancelled = true; };
  }, [rcMsgId, channelMessages]);

  const [, setEmojiReady] = useState(false);
  const [, setTimeoutReady] = useState(false);

  useEffect(() => {
    ensureCustomEmojisLoaded(() => setEmojiReady(true));
    ensureEditTimeoutLoaded(() => setTimeoutReady(true));
  }, []);

  // Auto-enter edit mode when triggered by ArrowUp
  useEffect(() => {
    if (editingMessageId === message.id && !isEditing) {
      setEditContent(message.content);
      setIsEditing(true);
    }
  }, [editingMessageId, message.id, message.content, isEditing]);

  const isOwnMessage = user?.id === message.user_id;
  const isAdmin = user?.role === 'admin';
  const timeoutMs = (editTimeoutSeconds ?? 900) * 1000;
  const isEditExpired = Date.now() - new Date(message.created_at).getTime() > timeoutMs;
  const canEdit = isAdmin || (isOwnMessage && !isEditExpired);

  const handleEdit = useCallback(() => {
    setEditContent(message.content);
    setIsEditing(true);
  }, [message.content]);

  const handleEditSave = useCallback(() => {
    const trimmed = editContent.trim();
    if (trimmed && trimmed !== message.content) {
      wsClient.send('message.edit', {
        message_id: message.id,
        content: trimmed,
      });
    }
    setIsEditing(false);
    onEditingDone?.();
  }, [editContent, message.id, message.content, onEditingDone]);

  const handleEditCancel = useCallback(() => {
    setIsEditing(false);
    setEditContent(message.content);
    onEditingDone?.();
  }, [message.content, onEditingDone]);

  const handleDelete = useCallback(() => {
    if (confirm('Delete this message?')) {
      wsClient.send('message.delete', { message_id: message.id });
    }
  }, [message.id]);

  const handlePin = useCallback(() => {
    wsClient.send(message.is_pinned ? 'message.unpin' : 'message.pin', {
      message_id: message.id,
    });
  }, [message.id, message.is_pinned]);

  const handleReaction = useCallback(
    (emoji: string) => {
      const existing = message.reactions?.find(
        (r) => r.emoji === emoji && r.user_id === user?.id,
      );
      if (existing) {
        wsClient.send('reaction.remove', {
          message_id: message.id,
          emoji,
        });
      } else {
        wsClient.send('reaction.add', {
          message_id: message.id,
          emoji,
        });
      }
      setShowEmojiPicker(false);
    },
    [message.id, message.reactions, user?.id],
  );

  // Group reactions by emoji with counts
  const reactionGroups = (message.reactions || []).reduce<
    Record<string, { emoji: string; count: number; users: string[]; hasOwn: boolean }>
  >((acc, r) => {
    if (!acc[r.emoji]) {
      acc[r.emoji] = { emoji: r.emoji, count: 0, users: [], hasOwn: false };
    }
    acc[r.emoji].count++;
    acc[r.emoji].users.push(r.username);
    if (r.user_id === user?.id) acc[r.emoji].hasOwn = true;
    return acc;
  }, {});

  const isFile = message.content_type === 'file';

  const renderContent = () => {
    if (isEditing) {
      return (
        <div className="mt-1">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleEditSave();
              }
              if (e.key === 'Escape') handleEditCancel();
            }}
            className="w-full resize-none rounded border border-chat-input-focus bg-chat-input-bg px-2 py-1 text-sm text-foreground focus:border-chat-input-focus focus:outline-none"
            rows={2}
            autoFocus
          />
          <div className="mt-1 flex gap-2 text-[10px]">
            <button onClick={handleEditSave} className="text-link-text hover:text-link-hover">
              Save
            </button>
            <button onClick={handleEditCancel} className="text-muted-foreground hover:text-muted-foreground">
              Cancel
            </button>
          </div>
        </div>
      );
    }

    if (isFile) {
      const caption = (message.metadata as Record<string, unknown>)?.caption as string | undefined;
      if (message.file) {
        const isImage = message.file.mime_type.startsWith('image/');
        return (
          <div className="mt-1">
            {isImage ? (
              <button
                onClick={() => setLightboxImage({ src: `${API_URL}/api/v1/files/${message.file!.id}`, alt: message.file!.original_name })}
                className="cursor-pointer"
              >
                <img
                  src={`${API_URL}/api/v1/files/${message.file.id}/thumbnail`}
                  alt={message.file.original_name}
                  className="max-w-xs rounded-lg border border-border hover:brightness-90 transition-[filter]"
                  onLoad={() => setImageLoaded(true)}
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (!img.dataset.fallbackAttempted) {
                      img.dataset.fallbackAttempted = 'true';
                      img.style.display = 'none';
                    }
                  }}
                />
              </button>
            ) : (
              <a
                href={`${API_URL}/api/v1/files/${message.file.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-link-text hover:bg-secondary"
              >
                <span>{message.file.original_name}</span>
                <span className="text-[10px] text-muted-foreground">
                  ({formatFileSize(message.file.size_bytes)})
                </span>
              </a>
            )}
            {caption && (
              <p className="mt-1 text-sm text-foreground">{caption}</p>
            )}
          </div>
        );
      }
      // File message without metadata (e.g. migrated from RocketChat)
      return (
        <div className="mt-1 inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-muted-foreground">
          <span>{message.content}</span>
        </div>
      );
    }

    return (
      <>
        {quotedMessage && (
          <div className="mb-1 border-l-2 border-accent-primary/50 pl-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/70">{quotedMessage.display_name}</span>
            <p className="truncate">{quotedMessage.content.slice(0, 120)}</p>
          </div>
        )}
        <div className="prose-chat max-w-none text-sm text-foreground">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {message.is_bot ? message.content : cleanContent}
          </ReactMarkdown>
          {message.edited_at && (
            <span
              className="ml-1 text-[10px] text-muted-foreground cursor-default group/edited relative inline-block"
              title={message.original_content ? `Original: ${message.original_content}` : undefined}
            >
              (edited)
              {message.original_content && (
                <span className="invisible group-hover/edited:visible absolute bottom-full left-0 z-50 mb-1 w-max max-w-xs rounded-lg border border-border bg-panel-bg px-3 py-2 text-xs text-foreground shadow-lg whitespace-pre-wrap">
                  {message.original_content}
                </span>
              )}
            </span>
          )}
        </div>
      </>
    );
  };

  const renderReactions = () => {
    const groups = Object.values(reactionGroups);
    if (groups.length === 0) return null;

    return (
      <div className="mt-1.5 flex flex-wrap gap-1">
        {groups.map((g) => (
          <button
            key={`${g.emoji}-${g.count}`}
            onClick={() => handleReaction(g.emoji)}
            title={g.users.join(', ')}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors animate-pop-scale',
              g.hasOwn
                ? 'border-reaction-own-border bg-reaction-own-bg text-reaction-own-text'
                : 'border-border bg-secondary/50 text-muted-foreground hover:border-chat-input-focus',
            )}
          >
            <span>
              {(() => {
                const resolved = resolveEmoji(g.emoji);
                if (resolved?.type === 'custom') {
                  return (
                    <img
                      src={`${API_URL}/api/v1/emojis/custom/${resolved.name}`}
                      alt={g.emoji}
                      className="inline-block size-4"
                    />
                  );
                }
                return resolved?.emoji || g.emoji;
              })()}
            </span>
            <span>{g.count}</span>
          </button>
        ))}
      </div>
    );
  };

  const renderThreadBadge = () => {
    if (!message.thread_summary || message.thread_summary.reply_count === 0) return null;
    return (
      <button
        onClick={() => onThreadOpen?.(message.id)}
        className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-link-text hover:text-link-hover"
      >
        <MessageSquare className="size-3" />
        <span>
          {message.thread_summary.reply_count}{' '}
          {message.thread_summary.reply_count === 1 ? 'reply' : 'replies'}
        </span>
      </button>
    );
  };

  const menuOpen = showEmojiPicker || dropdownOpen;
  const actionBar = (
    <div className={cn(
      "absolute -top-4 right-4 flex gap-0.5 rounded-lg border border-border bg-panel-bg shadow-lg transition-opacity",
      menuOpen ? "opacity-100" : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto",
    )}>
      <button
        ref={emojiButtonRef}
        onClick={() => {
          setDropdownOpen(false);
          if (!showEmojiPicker && emojiButtonRef.current) {
            const rect = emojiButtonRef.current.getBoundingClientRect();
            const pickerWidth = 320;
            const pickerHeight = 352;
            let top = rect.bottom + 4;
            let left = rect.right - pickerWidth;
            if (top + pickerHeight > window.innerHeight) {
              top = rect.top - pickerHeight - 4;
            }
            if (left < 8) left = 8;
            setEmojiPickerPos({ top, left });
          }
          setShowEmojiPicker(!showEmojiPicker);
        }}
        className="p-1.5 text-muted-foreground hover:text-foreground"
        title="Add reaction"
      >
        <SmilePlus className="size-4" />
      </button>
      <button
        onClick={() => onThreadOpen?.(message.id)}
        className="p-1.5 text-muted-foreground hover:text-foreground"
        title="Reply in thread"
      >
        <MessageSquare className="size-4" />
      </button>
      <DropdownMenu open={dropdownOpen} onOpenChange={(open) => { setDropdownOpen(open); if (open) setShowEmojiPicker(false); }}>
        <DropdownMenuTrigger className="p-1.5 text-muted-foreground hover:text-foreground">
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[140px]">
          <DropdownMenuItem onClick={() => onThreadOpen?.(message.id)}>
            <Reply className="mr-2 size-3.5" /> Reply in thread
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handlePin}>
            {message.is_pinned ? (
              <><PinOff className="mr-2 size-3.5" /> Unpin</>
            ) : (
              <><Pin className="mr-2 size-3.5" /> Pin message</>
            )}
          </DropdownMenuItem>
          {canEdit && (
            <DropdownMenuItem onClick={handleEdit}>
              <Pencil className="mr-2 size-3.5" /> Edit
            </DropdownMenuItem>
          )}
          {(isOwnMessage || isAdmin) && (
            <DropdownMenuItem onClick={handleDelete} className="text-status-error focus:text-status-error">
              <Trash2 className="mr-2 size-3.5" /> Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  if (isCompact) {
    return (
      <div className="group relative flex items-start gap-3 px-5 py-[3px] hover:bg-chat-hover">
        <div className="flex w-9 shrink-0 items-center justify-end">
          <span className="hidden text-[10px] text-muted-foreground group-hover:inline">
            {formatTime(message.created_at)}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          {renderContent()}
          {renderReactions()}
          {renderThreadBadge()}
        </div>
        {actionBar}
        {showEmojiPicker && emojiPickerPos && createPortal(
          <div className="fixed z-[9999]" style={{ top: emojiPickerPos.top, left: emojiPickerPos.left }}>
            <EmojiPicker onSelect={handleReaction} onClose={() => setShowEmojiPicker(false)} />
          </div>,
          document.body,
        )}
        {lightboxImage && (
          <ImageLightbox src={lightboxImage.src} alt={lightboxImage.alt} onClose={() => setLightboxImage(null)} />
        )}
      </div>
    );
  }

  const initials = message.display_name
    ? message.display_name.charAt(0).toUpperCase()
    : message.username.charAt(0).toUpperCase();

  return (
    <div className="group relative flex items-start gap-3 px-5 pt-5 pb-1 hover:bg-chat-hover">
      {/* Avatar */}
      <button
        onClick={() => onUserInfoOpen?.(message.user_id)}
        className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-avatar-bg text-sm font-medium text-avatar-text hover:opacity-80 transition-opacity"
      >
        {message.avatar_url ? (
          <img
            src={message.avatar_url}
            alt={message.display_name}
            className="size-9 rounded-full object-cover"
          />
        ) : (
          initials
        )}
      </button>

      {/* Body */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <button
            onClick={() => onUserInfoOpen?.(message.user_id)}
            className="text-sm font-semibold text-foreground hover:underline"
          >
            {message.display_name || message.username}
          </button>
          {message.is_bot && (
            <span
              className={cn(
                'inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium leading-none',
                'bg-bot-badge-bg text-bot-badge-text',
              )}
            >
              BOT
            </span>
          )}
          {message.is_pinned && (
            <Pin className="size-3 text-pin-color" />
          )}
          {message.thread_id && (
            <span className="inline-flex items-center gap-0.5 rounded bg-secondary/60 px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
              <MessageSquare className="size-2.5" />
              Reply
            </span>
          )}
          <span
            className="text-[11px] text-muted-foreground"
            title={formatFullDate(message.created_at)}
          >
            {formatTime(message.created_at)}
          </span>
        </div>
        {renderContent()}
        {renderReactions()}
        {renderThreadBadge()}
      </div>

      {actionBar}
      {showEmojiPicker && emojiPickerPos && createPortal(
        <div className="fixed z-[9999]" style={{ top: emojiPickerPos.top, left: emojiPickerPos.left }}>
          <EmojiPicker onSelect={handleReaction} onClose={() => setShowEmojiPicker(false)} />
        </div>,
        document.body,
      )}
      {lightboxImage && (
        <ImageLightbox src={lightboxImage.src} alt={lightboxImage.alt} onClose={() => setLightboxImage(null)} />
      )}
    </div>
  );
}
