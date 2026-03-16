'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface MentionUser {
  id: string;
  username: string;
  display_name: string;
  is_bot: boolean;
}

interface MentionAutocompleteProps {
  users: MentionUser[];
  query: string;
  selectedIndex: number;
  onSelect: (username: string) => void;
  onClose: () => void;
}

export function MentionAutocomplete({
  users,
  query,
  selectedIndex,
  onSelect,
  onClose,
}: MentionAutocompleteProps) {
  const ref = useRef<HTMLDivElement>(null);

  const filtered = users.filter((u) => {
    const q = query.toLowerCase();
    return (
      u.username.toLowerCase().includes(q) ||
      u.display_name.toLowerCase().includes(q)
    );
  }).slice(0, 8);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 mb-1 w-64 rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl"
    >
      {filtered.map((user, i) => (
        <button
          key={user.id}
          onClick={() => onSelect(user.username)}
          className={cn(
            'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm',
            i === selectedIndex
              ? 'bg-indigo-600/20 text-slate-100'
              : 'text-slate-300 hover:bg-slate-800',
          )}
        >
          <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[10px] font-medium text-slate-300">
            {user.display_name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <span className="font-medium">{user.display_name}</span>
            <span className="ml-1 text-xs text-slate-500">@{user.username}</span>
          </div>
          {user.is_bot && (
            <span className="rounded bg-indigo-500/20 px-1 py-0.5 text-[9px] font-medium text-indigo-300">
              BOT
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
