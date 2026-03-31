'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { EMOJI_CATEGORIES } from '@/lib/emoji-data';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/+$/, '');

interface CustomEmoji {
  id: string;
  name: string;
  aliases: string[];
  url: string;
}

// Cache custom emojis across component mounts
let cachedCustomEmojis: CustomEmoji[] | null = null;

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [customEmojis, setCustomEmojis] = useState<CustomEmoji[]>(cachedCustomEmojis || []);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState(0);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Auto-focus search
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Fetch custom emojis
  useEffect(() => {
    if (cachedCustomEmojis) return;
    const token = localStorage.getItem('glab_token');
    if (!token) return;

    fetch(`${API_URL}/api/v1/emojis/custom`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: CustomEmoji[]) => {
        cachedCustomEmojis = data;
        setCustomEmojis(data);
      })
      .catch(() => {});
  }, []);

  const query = search.toLowerCase().trim();

  const filteredCustom = useMemo(
    () =>
      query
        ? customEmojis.filter(
            (e) =>
              e.name.toLowerCase().includes(query) ||
              e.aliases?.some((a) => a.toLowerCase().includes(query)),
          )
        : customEmojis,
    [customEmojis, query],
  );

  const filteredCategories = useMemo(
    () =>
      query
        ? EMOJI_CATEGORIES.map((cat) => ({
            ...cat,
            emojis: cat.emojis.filter((e) => e.name.toLowerCase().includes(query)),
          })).filter((cat) => cat.emojis.length > 0)
        : EMOJI_CATEGORIES,
    [query],
  );

  const scrollToCategory = useCallback((index: number) => {
    setSearch('');
    setActiveCategory(index);
    // Wait for search clear to re-render full list, then scroll
    setTimeout(() => {
      const el = document.getElementById(`emoji-cat-${index}`);
      if (el && scrollRef.current) {
        scrollRef.current.scrollTo({ top: el.offsetTop - scrollRef.current.offsetTop, behavior: 'smooth' });
      }
    }, 0);
  }, []);

  // Track active category on scroll
  const handleScroll = useCallback(() => {
    if (query || !scrollRef.current) return;
    const container = scrollRef.current;
    const scrollTop = container.scrollTop + container.offsetTop + 8;

    for (let i = EMOJI_CATEGORIES.length - 1; i >= 0; i--) {
      const el = document.getElementById(`emoji-cat-${i}`);
      if (el && el.offsetTop <= scrollTop) {
        setActiveCategory(i);
        break;
      }
    }
  }, [query]);

  const hasCustom = filteredCustom.length > 0;

  return (
    <div
      ref={ref}
      className="flex w-80 flex-col rounded-lg border border-border bg-panel-bg shadow-xl"
      style={{ height: '22rem' }}
    >
      {/* Search */}
      <div className="border-b border-border px-2 pt-2 pb-1">
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search emoji..."
          className="w-full rounded bg-muted/50 px-2 py-1.5 text-xs text-foreground placeholder-muted-foreground outline-none focus:ring-1 focus:ring-chat-input-focus"
        />
      </div>

      {/* Category tabs */}
      {!query && (
        <div className="flex gap-0.5 border-b border-border px-1 py-1">
          {hasCustom && (
            <button
              onClick={() => {
                setSearch('');
                scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="flex size-7 items-center justify-center rounded text-xs hover:bg-muted"
              title="Custom"
            >
              ⭐
            </button>
          )}
          {EMOJI_CATEGORIES.map((cat, i) => (
            <button
              key={cat.name}
              onClick={() => scrollToCategory(i)}
              className={`flex size-7 items-center justify-center rounded text-sm hover:bg-muted ${
                activeCategory === i && !query ? 'bg-muted' : ''
              }`}
              title={cat.name}
            >
              {cat.icon}
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-2 py-1"
      >
        {/* Custom emojis section */}
        {hasCustom && (
          <div id="emoji-cat-custom">
            <div className="sticky top-0 z-10 bg-panel-bg py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Custom
            </div>
            <div className="grid grid-cols-8 gap-0.5">
              {filteredCustom.map((item) => (
                <button
                  key={item.name}
                  onClick={() => onSelect(`:${item.name}:`)}
                  title={item.name}
                  className="flex size-8 items-center justify-center rounded hover:bg-muted"
                >
                  <img
                    src={`${API_URL}${item.url}`}
                    alt={item.name}
                    className="size-6 object-contain"
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Unicode emoji categories */}
        {filteredCategories.map((cat, i) => {
          // Find original index for scroll tracking
          const originalIndex = EMOJI_CATEGORIES.findIndex((c) => c.name === cat.name);
          return (
            <div key={cat.name} id={`emoji-cat-${originalIndex}`}>
              <div className="sticky top-0 z-10 bg-panel-bg py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {cat.name}
              </div>
              <div className="grid grid-cols-8 gap-0.5">
                {cat.emojis.map((item) => (
                  <button
                    key={`${cat.name}-${item.emoji}`}
                    onClick={() => onSelect(item.emoji)}
                    title={item.name}
                    className="flex size-8 items-center justify-center rounded text-lg hover:bg-muted"
                  >
                    {item.emoji}
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {/* Empty state */}
        {filteredCategories.length === 0 && filteredCustom.length === 0 && (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No emojis found
          </div>
        )}
      </div>
    </div>
  );
}
