'use client';

import { Message } from '@/lib/types';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString();
}

interface MessageItemProps {
  message: Message;
  isCompact: boolean;
}

export function MessageItem({ message, isCompact }: MessageItemProps) {
  if (isCompact) {
    return (
      <div className="group flex items-start gap-2 px-4 py-0.5 hover:bg-slate-800/30">
        {/* Timestamp on hover, aligned with avatar space */}
        <div className="flex w-9 shrink-0 items-center justify-end">
          <span className="hidden text-[10px] text-slate-500 group-hover:inline">
            {formatTime(message.created_at)}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-wrap break-words text-sm text-slate-200">
            {message.content}
            {message.edited_at && (
              <span className="ml-1 text-[10px] text-slate-500">(edited)</span>
            )}
          </p>
        </div>
      </div>
    );
  }

  const initials = message.display_name
    ? message.display_name.charAt(0).toUpperCase()
    : message.username.charAt(0).toUpperCase();

  return (
    <div className="group flex items-start gap-2 px-4 pt-2 pb-0.5 hover:bg-slate-800/30">
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
            <span className={cn(
              'inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium leading-none',
              'bg-indigo-500/20 text-indigo-300',
            )}>
              BOT
            </span>
          )}
          <span
            className="text-[11px] text-slate-500"
            title={formatFullDate(message.created_at)}
          >
            {formatTime(message.created_at)}
          </span>
        </div>
        {message.is_bot ? (
          <div className="prose prose-invert prose-sm max-w-none text-sm text-slate-200">
            <ReactMarkdown>{message.content}</ReactMarkdown>
            {message.edited_at && (
              <span className="ml-1 text-[10px] text-slate-500">(edited)</span>
            )}
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm text-slate-200">
            {message.content}
            {message.edited_at && (
              <span className="ml-1 text-[10px] text-slate-500">(edited)</span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
