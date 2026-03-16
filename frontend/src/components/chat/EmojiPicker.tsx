'use client';

import { useEffect, useRef } from 'react';

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

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="grid grid-cols-8 gap-0.5 rounded-lg border border-slate-700 bg-slate-900 p-2 shadow-xl"
    >
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
  );
}
