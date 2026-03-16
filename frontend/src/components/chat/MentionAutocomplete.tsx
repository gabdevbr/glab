'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Megaphone } from 'lucide-react';

interface MentionUser {
  id: string;
  username: string;
  display_name: string;
  is_bot: boolean;
}

interface SpecialMention {
  keyword: string;
  description: string;
}

const SPECIAL_MENTIONS: SpecialMention[] = [
  { keyword: 'all', description: 'Notify all in this room' },
  { keyword: 'here', description: 'Notify active in this room' },
  { keyword: 'channel', description: 'Notify all in this room' },
];

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

  const q = query.toLowerCase();

  // Filter special mentions
  const filteredSpecial = SPECIAL_MENTIONS.filter(
    (s) => s.keyword.startsWith(q),
  );

  // Filter users
  const filteredUsers = users.filter((u) => {
    return (
      u.username.toLowerCase().includes(q) ||
      u.display_name.toLowerCase().includes(q)
    );
  }).slice(0, 8);

  const totalItems = filteredSpecial.length + filteredUsers.length;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (totalItems === 0) return null;

  const wrappedIndex = selectedIndex % totalItems;

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 mb-1 w-72 rounded-lg border border-border bg-panel-bg py-1 shadow-xl"
    >
      {/* Special mentions (@all, @here, @channel) */}
      {filteredSpecial.map((special, i) => (
        <button
          key={special.keyword}
          onClick={() => onSelect(special.keyword)}
          className={cn(
            'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm',
            i === wrappedIndex
              ? 'bg-accent-primary-subtle text-foreground'
              : 'text-muted-foreground hover:bg-secondary',
          )}
        >
          <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-primary-subtle text-accent-primary-subtle-text">
            <Megaphone className="size-3" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="font-semibold text-foreground">{special.keyword}</span>
            <span className="ml-2 text-xs text-muted-foreground">{special.description}</span>
          </div>
        </button>
      ))}

      {/* Separator */}
      {filteredSpecial.length > 0 && filteredUsers.length > 0 && (
        <div className="mx-3 my-1 border-t border-border/50" />
      )}

      {/* User mentions */}
      {filteredUsers.map((user, i) => {
        const globalIndex = filteredSpecial.length + i;
        return (
          <button
            key={user.id}
            onClick={() => onSelect(user.username)}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm',
              globalIndex === wrappedIndex
                ? 'bg-accent-primary-subtle text-foreground'
                : 'text-muted-foreground hover:bg-secondary',
            )}
          >
            <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-avatar-bg text-[10px] font-medium text-avatar-text">
              {user.display_name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <span className="font-medium">{user.display_name}</span>
              <span className="ml-1 text-xs text-muted-foreground">@{user.username}</span>
            </div>
            {user.is_bot && (
              <span className="rounded bg-bot-badge-bg px-1 py-0.5 text-[9px] font-medium text-bot-badge-text">
                BOT
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Returns the total number of visible items for keyboard navigation. */
export function getMentionItemCount(users: MentionUser[], query: string): number {
  const q = query.toLowerCase();
  const specialCount = SPECIAL_MENTIONS.filter((s) => s.keyword.startsWith(q)).length;
  const userCount = users.filter(
    (u) => u.username.toLowerCase().includes(q) || u.display_name.toLowerCase().includes(q),
  ).slice(0, 8).length;
  return specialCount + userCount;
}
