'use client';

import { useEffect, useRef, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

const EMOJI_LIST = [
  { emoji: '\uD83D\uDC4D', label: 'thumbs up' },
  { emoji: '\uD83D\uDC4E', label: 'thumbs down' },
  { emoji: '\u2764\uFE0F', label: 'heart' },
  { emoji: '\uD83D\uDE02', label: 'joy' },
  { emoji: '\uD83D\uDE2E', label: 'open mouth' },
  { emoji: '\uD83D\uDE22', label: 'cry' },
  { emoji: '\uD83D\uDE21', label: 'rage' },
  { emoji: '\uD83D\uDE80', label: 'rocket' },
  { emoji: '\uD83C\uDF89', label: 'party' },
  { emoji: '\uD83D\uDD25', label: 'fire' },
  { emoji: '\u2705', label: 'check' },
  { emoji: '\uD83D\uDC40', label: 'eyes' },
  { emoji: '\uD83D\uDE4F', label: 'pray' },
  { emoji: '\uD83D\uDCAF', label: '100' },
  { emoji: '\uD83E\uDD14', label: 'thinking' },
  { emoji: '\uD83D\uDC4F', label: 'clap' },
];

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
  const [customEmojis, setCustomEmojis] = useState<CustomEmoji[]>(cachedCustomEmojis || []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    if (cachedCustomEmojis) return;

    const token = localStorage.getItem('token');
    if (!token) return;

    fetch(`${API_URL}/api/v1/emojis/custom`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : [])
      .then((data: CustomEmoji[]) => {
        cachedCustomEmojis = data;
        setCustomEmojis(data);
      })
      .catch(() => {});
  }, []);

  return (
    <div
      ref={ref}
      className="max-h-64 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-2 shadow-xl"
    >
      {customEmojis.length > 0 && (
        <>
          <div className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Custom
          </div>
          <div className="mb-2 grid grid-cols-8 gap-0.5">
            {customEmojis.map((item) => (
              <button
                key={item.name}
                onClick={() => onSelect(`:${item.name}:`)}
                title={item.name}
                className="flex size-8 items-center justify-center rounded hover:bg-slate-700"
              >
                <img
                  src={`${API_URL}${item.url}`}
                  alt={item.name}
                  className="size-6 object-contain"
                />
              </button>
            ))}
          </div>
        </>
      )}
      <div className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">
        Emoji
      </div>
      <div className="grid grid-cols-8 gap-0.5">
        {EMOJI_LIST.map((item) => (
          <button
            key={item.label}
            onClick={() => onSelect(item.emoji)}
            title={item.label}
            className="flex size-8 items-center justify-center rounded text-lg hover:bg-slate-700"
          >
            {item.emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
