'use client';

import { useState, useCallback } from 'react';
import { Message } from '@/lib/types';
import { useAuthStore } from '@/stores/authStore';
import { wsClient } from '@/lib/ws';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmojiPicker } from './EmojiPicker';
import { MoreHorizontal, Pin, PinOff, Pencil, Trash2, MessageSquare, SmilePlus } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
}

export function MessageItem({ message, isCompact, onThreadOpen }: MessageItemProps) {
  const user = useAuthStore((s) => s.user);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const isOwnMessage = user?.id === message.user_id;

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
  }, [editContent, message.id, message.content]);

  const handleEditCancel = useCallback(() => {
    setIsEditing(false);
    setEditContent(message.content);
  }, [message.content]);

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
            className="w-full resize-none rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
            rows={2}
            autoFocus
          />
          <div className="mt-1 flex gap-2 text-[10px]">
            <button onClick={handleEditSave} className="text-indigo-400 hover:text-indigo-300">
              Save
            </button>
            <button onClick={handleEditCancel} className="text-slate-500 hover:text-slate-400">
              Cancel
            </button>
          </div>
        </div>
      );
    }

    if (isFile && message.file) {
      const isImage = message.file.mime_type.startsWith('image/');
      return (
        <div className="mt-1">
          {isImage ? (
            <a href={`${API_URL}/api/v1/files/${message.file.id}`} target="_blank" rel="noreferrer">
              <img
                src={`${API_URL}/api/v1/files/${message.file.id}/thumbnail`}
                alt={message.file.original_name}
                className="max-w-xs rounded-lg border border-slate-700"
              />
            </a>
          ) : (
            <a
              href={`${API_URL}/api/v1/files/${message.file.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-indigo-400 hover:bg-slate-800"
            >
              <span>{message.file.original_name}</span>
              <span className="text-[10px] text-slate-500">
                ({formatFileSize(message.file.size_bytes)})
              </span>
            </a>
          )}
        </div>
      );
    }

    if (message.is_bot) {
      return (
        <div className="prose prose-invert prose-sm max-w-none text-sm text-slate-200">
          <ReactMarkdown>{message.content}</ReactMarkdown>
          {message.edited_at && (
            <span className="ml-1 text-[10px] text-slate-500">(edited)</span>
          )}
        </div>
      );
    }

    return (
      <p className="whitespace-pre-wrap break-words text-sm text-slate-200">
        {message.content}
        {message.edited_at && (
          <span className="ml-1 text-[10px] text-slate-500">(edited)</span>
        )}
      </p>
    );
  };

  const renderReactions = () => {
    const groups = Object.values(reactionGroups);
    if (groups.length === 0) return null;

    return (
      <div className="mt-1 flex flex-wrap gap-1">
        {groups.map((g) => (
          <button
            key={g.emoji}
            onClick={() => handleReaction(g.emoji)}
            title={g.users.join(', ')}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors',
              g.hasOwn
                ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300'
                : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600',
            )}
          >
            <span>{g.emoji}</span>
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
        className="mt-1 inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
      >
        <MessageSquare className="size-3" />
        <span>
          {message.thread_summary.reply_count}{' '}
          {message.thread_summary.reply_count === 1 ? 'reply' : 'replies'}
        </span>
      </button>
    );
  };

  const actionBar = (
    <div className="absolute -top-3 right-2 hidden rounded border border-slate-700 bg-slate-900 shadow-md group-hover:flex">
      <button
        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
        className="p-1 text-slate-400 hover:text-slate-200"
        title="Add reaction"
      >
        <SmilePlus className="size-3.5" />
      </button>
      <button
        onClick={() => onThreadOpen?.(message.id)}
        className="p-1 text-slate-400 hover:text-slate-200"
        title="Reply in thread"
      >
        <MessageSquare className="size-3.5" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger className="p-1 text-slate-400 hover:text-slate-200">
          <MoreHorizontal className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[140px]">
          <DropdownMenuItem onClick={handlePin}>
            {message.is_pinned ? (
              <><PinOff className="mr-2 size-3.5" /> Unpin</>
            ) : (
              <><Pin className="mr-2 size-3.5" /> Pin message</>
            )}
          </DropdownMenuItem>
          {isOwnMessage && (
            <DropdownMenuItem onClick={handleEdit}>
              <Pencil className="mr-2 size-3.5" /> Edit
            </DropdownMenuItem>
          )}
          {(isOwnMessage || user?.role === 'admin') && (
            <DropdownMenuItem onClick={handleDelete} className="text-red-400 focus:text-red-400">
              <Trash2 className="mr-2 size-3.5" /> Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  if (isCompact) {
    return (
      <div className="group relative flex items-start gap-2 px-4 py-0.5 hover:bg-slate-800/30">
        <div className="flex w-9 shrink-0 items-center justify-end">
          <span className="hidden text-[10px] text-slate-500 group-hover:inline">
            {formatTime(message.created_at)}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          {renderContent()}
          {renderReactions()}
          {renderThreadBadge()}
        </div>
        {actionBar}
        {showEmojiPicker && (
          <div className="absolute right-2 top-6 z-50">
            <EmojiPicker onSelect={handleReaction} onClose={() => setShowEmojiPicker(false)} />
          </div>
        )}
      </div>
    );
  }

  const initials = message.display_name
    ? message.display_name.charAt(0).toUpperCase()
    : message.username.charAt(0).toUpperCase();

  return (
    <div className="group relative flex items-start gap-2 px-4 pt-2 pb-0.5 hover:bg-slate-800/30">
      {/* Avatar */}
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-700 text-sm font-medium text-slate-300">
        {message.avatar_url ? (
          <img
            src={message.avatar_url}
            alt={message.display_name}
            className="size-9 rounded-full object-cover"
          />
        ) : (
          initials
        )}
      </div>

      {/* Body */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-slate-100">
            {message.display_name || message.username}
          </span>
          {message.is_bot && (
            <span
              className={cn(
                'inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium leading-none',
                'bg-indigo-500/20 text-indigo-300',
              )}
            >
              BOT
            </span>
          )}
          {message.is_pinned && (
            <Pin className="size-3 text-amber-400" />
          )}
          <span
            className="text-[11px] text-slate-500"
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
      {showEmojiPicker && (
        <div className="absolute right-2 top-10 z-50">
          <EmojiPicker onSelect={handleReaction} onClose={() => setShowEmojiPicker(false)} />
        </div>
      )}
    </div>
  );
}
