'use client';

import { useEffect, useRef, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { EMOJI_CATEGORIES, EmojiItem } from '@/lib/emoji-data';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/+$/, '');

const STORAGE_KEY = 'glab_emoji_usage';
const MAX_FREQUENT = 20;

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

// --- Frequently used emoji tracking (localStorage) ---

interface EmojiUsageEntry {
  key: string; // emoji char or ":name:" for custom
  count: number;
  isCustom: boolean;
}

function getUsageMap(): Record<string, EmojiUsageEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function recordEmojiUsage(emoji: string, isCustom: boolean) {
  const map = getUsageMap();
  const key = emoji;
  const existing = map[key];
  map[key] = {
    key,
    count: (existing?.count || 0) + 1,
    isCustom,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch { /* ignore quota errors */ }
}

export function getFrequentEmojis(): EmojiUsageEntry[] {
  const map = getUsageMap();
  return Object.values(map)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_FREQUENT);
}

// --- Flat list of all unicode emojis for search ---

const ALL_EMOJIS: EmojiItem[] = EMOJI_CATEGORIES.flatMap((c) => c.emojis);

const MAX_RESULTS = 8;

// Unified item type for rendering
type AutocompleteItem =
  | { type: 'frequent-unicode'; emoji: string; name: string }
  | { type: 'frequent-custom'; name: string }
  | { type: 'custom'; name: string }
  | { type: 'unicode'; emoji: string; name: string };

function buildItems(
  query: string,
  customEmojis: CustomEmoji[],
): AutocompleteItem[] {
  const q = query.toLowerCase();
  const frequent = getFrequentEmojis();
  const items: AutocompleteItem[] = [];
  const seen = new Set<string>();

  // 1. Frequently used emojis (filtered by query)
  for (const entry of frequent) {
    if (items.length >= MAX_RESULTS) break;
    if (entry.isCustom) {
      // entry.key is ":name:"
      const name = entry.key.replace(/^:|:$/g, '');
      const ce = customEmojis.find((e) => e.name === name);
      if (!ce) continue;
      if (q && !name.toLowerCase().includes(q) && !ce.aliases?.some((a) => a.toLowerCase().includes(q))) continue;
      seen.add(`custom:${name}`);
      items.push({ type: 'frequent-custom', name });
    } else {
      const emojiItem = ALL_EMOJIS.find((e) => e.emoji === entry.key);
      if (!emojiItem) continue;
      if (q && !emojiItem.name.toLowerCase().includes(q)) continue;
      seen.add(`unicode:${entry.key}`);
      items.push({ type: 'frequent-unicode', emoji: entry.key, name: emojiItem.name });
    }
  }

  // 2. Custom emojis
  for (const ce of customEmojis) {
    if (items.length >= MAX_RESULTS) break;
    if (seen.has(`custom:${ce.name}`)) continue;
    if (q && !ce.name.toLowerCase().includes(q) && !ce.aliases?.some((a) => a.toLowerCase().includes(q))) continue;
    seen.add(`custom:${ce.name}`);
    items.push({ type: 'custom', name: ce.name });
  }

  // 3. Remaining unicode emojis
  for (const ue of ALL_EMOJIS) {
    if (items.length >= MAX_RESULTS) break;
    if (seen.has(`unicode:${ue.emoji}`)) continue;
    if (q && !ue.name.toLowerCase().includes(q)) continue;
    items.push({ type: 'unicode', emoji: ue.emoji, name: ue.name });
  }

  return items;
}

export function EmojiAutocomplete({
  query,
  selectedIndex,
  customEmojis,
  onSelect,
  onClose,
}: EmojiAutocompleteProps) {
  const ref = useRef<HTMLDivElement>(null);

  const items = useMemo(
    () => buildItems(query, customEmojis),
    [query, customEmojis],
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (items.length === 0) return null;

  const wrappedIndex = selectedIndex % items.length;

  // Determine section breaks for visual separators
  const sections: ('frequent' | 'custom' | 'unicode')[] = items.map((item) => {
    if (item.type === 'frequent-unicode' || item.type === 'frequent-custom') return 'frequent';
    if (item.type === 'custom') return 'custom';
    return 'unicode';
  });

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 mb-1 w-72 rounded-lg border border-border bg-panel-bg py-1 shadow-xl"
    >
      {items.map((item, i) => {
        const showSeparator = i > 0 && sections[i] !== sections[i - 1];
        const isCustomType = item.type === 'custom' || item.type === 'frequent-custom';
        const isSelected = i === wrappedIndex;

        return (
          <div key={isCustomType ? `c-${item.name}` : `u-${(item as { emoji: string }).emoji}`}>
            {showSeparator && <div className="mx-3 my-1 border-t border-border/50" />}
            <button
              onClick={() =>
                isCustomType
                  ? onSelect(`:${item.name}:`, true)
                  : onSelect((item as { emoji: string }).emoji, false)
              }
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm',
                isSelected
                  ? 'bg-accent-primary-subtle text-foreground'
                  : 'text-muted-foreground hover:bg-secondary',
              )}
            >
              {isCustomType ? (
                <img
                  src={`${API_URL}${customEmojis.find((e) => e.name === item.name)?.url}`}
                  alt={item.name}
                  className="size-5 shrink-0 object-contain"
                />
              ) : (
                <span className="flex size-5 shrink-0 items-center justify-center text-base">
                  {(item as { emoji: string }).emoji}
                </span>
              )}
              <span className="truncate">
                :{isCustomType ? item.name : item.name.replace(/\s+/g, '_')}:
              </span>
              {(item.type === 'frequent-unicode' || item.type === 'frequent-custom') && (
                <span className="ml-auto text-xs text-muted-foreground/50">freq</span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Returns the total number of visible items for keyboard navigation. */
export function getEmojiItemCount(customEmojis: CustomEmoji[], query: string): number {
  return buildItems(query, customEmojis).length;
}

/** Returns the selected emoji value at the given index. */
export function getEmojiAtIndex(
  customEmojis: CustomEmoji[],
  query: string,
  index: number,
): { value: string; isCustom: boolean } | null {
  const items = buildItems(query, customEmojis);
  if (items.length === 0) return null;
  const wrapped = index % items.length;
  const item = items[wrapped];
  if (item.type === 'custom' || item.type === 'frequent-custom') {
    return { value: `:${item.name}:`, isCustom: true };
  }
  return { value: (item as { emoji: string }).emoji, isCustom: false };
}
