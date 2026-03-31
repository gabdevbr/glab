'use client';

import { useEffect, useRef, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { EMOJI_CATEGORIES, EmojiItem } from '@/lib/emoji-data';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/+$/, '');

interface CustomEmoji {
  id: string;
  name: string;
  aliases: string[];
  url: string;
}

interface EmojiAutocompleteProps {
  query: string;
  selectedIndex: number;
  customEmojis: CustomEmoji[];
  onSelect: (emoji: string, isCustom: boolean) => void;
  onClose: () => void;
}

// Flat list of all unicode emojis for search
const ALL_EMOJIS: EmojiItem[] = EMOJI_CATEGORIES.flatMap((c) => c.emojis);

const MAX_RESULTS = 8;

export function EmojiAutocomplete({
  query,
  selectedIndex,
  customEmojis,
  onSelect,
  onClose,
}: EmojiAutocompleteProps) {
  const ref = useRef<HTMLDivElement>(null);
  const q = query.toLowerCase();

  const filteredCustom = useMemo(
    () =>
      customEmojis
        .filter(
          (e) =>
            e.name.toLowerCase().includes(q) ||
            e.aliases?.some((a) => a.toLowerCase().includes(q)),
        )
        .slice(0, MAX_RESULTS),
    [customEmojis, q],
  );

  const remainingSlots = MAX_RESULTS - filteredCustom.length;
  const filteredUnicode = useMemo(
    () =>
      remainingSlots > 0
        ? ALL_EMOJIS.filter((e) => e.name.toLowerCase().includes(q)).slice(0, remainingSlots)
        : [],
    [q, remainingSlots],
  );

  const totalItems = filteredCustom.length + filteredUnicode.length;

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
      {filteredCustom.map((emoji, i) => (
        <button
          key={`custom-${emoji.name}`}
          onClick={() => onSelect(`:${emoji.name}:`, true)}
          className={cn(
            'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm',
            i === wrappedIndex
              ? 'bg-accent-primary-subtle text-foreground'
              : 'text-muted-foreground hover:bg-secondary',
          )}
        >
          <img
            src={`${API_URL}${emoji.url}`}
            alt={emoji.name}
            className="size-5 shrink-0 object-contain"
          />
          <span className="truncate">:{emoji.name}:</span>
        </button>
      ))}

      {filteredCustom.length > 0 && filteredUnicode.length > 0 && (
        <div className="mx-3 my-1 border-t border-border/50" />
      )}

      {filteredUnicode.map((emoji, i) => {
        const globalIndex = filteredCustom.length + i;
        return (
          <button
            key={`unicode-${emoji.name}`}
            onClick={() => onSelect(emoji.emoji, false)}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm',
              globalIndex === wrappedIndex
                ? 'bg-accent-primary-subtle text-foreground'
                : 'text-muted-foreground hover:bg-secondary',
            )}
          >
            <span className="flex size-5 shrink-0 items-center justify-center text-base">{emoji.emoji}</span>
            <span className="truncate">:{emoji.name.replace(/\s+/g, '_')}:</span>
          </button>
        );
      })}
    </div>
  );
}

/** Returns the total number of visible items for keyboard navigation. */
export function getEmojiItemCount(customEmojis: CustomEmoji[], query: string): number {
  const q = query.toLowerCase();
  const customCount = customEmojis
    .filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.aliases?.some((a) => a.toLowerCase().includes(q)),
    )
    .slice(0, MAX_RESULTS).length;
  const remaining = MAX_RESULTS - customCount;
  const unicodeCount =
    remaining > 0
      ? ALL_EMOJIS.filter((e) => e.name.toLowerCase().includes(q)).slice(0, remaining).length
      : 0;
  return customCount + unicodeCount;
}

/** Returns the selected emoji value at the given index. */
export function getEmojiAtIndex(
  customEmojis: CustomEmoji[],
  query: string,
  index: number,
): { value: string; isCustom: boolean } | null {
  const q = query.toLowerCase();
  const filteredCustom = customEmojis
    .filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.aliases?.some((a) => a.toLowerCase().includes(q)),
    )
    .slice(0, MAX_RESULTS);
  const remaining = MAX_RESULTS - filteredCustom.length;
  const filteredUnicode =
    remaining > 0
      ? ALL_EMOJIS.filter((e) => e.name.toLowerCase().includes(q)).slice(0, remaining)
      : [];
  const total = filteredCustom.length + filteredUnicode.length;
  if (total === 0) return null;
  const wrapped = index % total;
  if (wrapped < filteredCustom.length) {
    return { value: `:${filteredCustom[wrapped].name}:`, isCustom: true };
  }
  const unicodeIdx = wrapped - filteredCustom.length;
  return { value: filteredUnicode[unicodeIdx].emoji, isCustom: false };
}
