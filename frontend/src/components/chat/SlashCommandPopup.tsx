'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Search, Loader2 } from 'lucide-react';

interface GiphyGif {
  id: string;
  title: string;
  url: string;
  preview_url: string;
  width: number;
  height: number;
}

interface SlashCommand {
  name: string;
  description: string;
}

const COMMANDS: SlashCommand[] = [
  { name: 'giphy', description: 'Search for GIFs' },
];

interface SlashCommandPopupProps {
  /** The raw text after "/" — e.g. "" for just "/", "gi" for "/gi", "giphy cats" for "/giphy cats" */
  input: string;
  onSelectGif: (gifUrl: string) => void;
  onClose: () => void;
  selectedIndex: number;
}

export function SlashCommandPopup({ input, onSelectGif, onClose, selectedIndex }: SlashCommandPopupProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Parse input: is it a known command with args, or still filtering the command list?
  const parts = input.split(/\s+/);
  const commandName = parts[0]?.toLowerCase() || '';
  const matchedCommand = COMMANDS.find((c) => c.name === commandName);
  const hasArgs = parts.length > 1 || (matchedCommand && input.length > commandName.length);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (matchedCommand?.name === 'giphy') {
    const query = input.slice(commandName.length).trim();
    return (
      <div ref={ref} className="absolute bottom-full left-0 mb-1 w-[420px] rounded-lg border border-border bg-panel-bg shadow-xl">
        <GiphySearch query={query} onSelect={onSelectGif} />
      </div>
    );
  }

  // Show command list filtered by what's typed
  const filtered = COMMANDS.filter((c) => c.name.startsWith(commandName));
  if (filtered.length === 0) return null;

  const wrappedIndex = selectedIndex % filtered.length;

  return (
    <div ref={ref} className="absolute bottom-full left-0 mb-1 w-72 rounded-lg border border-border bg-panel-bg py-1 shadow-xl">
      {filtered.map((cmd, i) => (
        <button
          key={cmd.name}
          onClick={() => {
            // User clicked a command — we don't auto-execute, just hint the parent
            // Actually for giphy, we let the parent know to set the command
          }}
          className={cn(
            'flex w-full items-center gap-3 px-3 py-2 text-left text-sm',
            i === wrappedIndex
              ? 'bg-accent-primary-subtle text-foreground'
              : 'text-muted-foreground hover:bg-secondary',
          )}
        >
          <span className="font-mono font-semibold text-foreground">/{cmd.name}</span>
          <span className="text-xs text-muted-foreground">{cmd.description}</span>
        </button>
      ))}
    </div>
  );
}

/** Returns the total number of visible command items for keyboard navigation. */
export function getSlashCommandCount(input: string): number {
  const commandName = input.split(/\s+/)[0]?.toLowerCase() || '';
  const matched = COMMANDS.find((c) => c.name === commandName);
  if (matched) return 0; // In GIF mode, no keyboard nav on commands
  return COMMANDS.filter((c) => c.name.startsWith(commandName)).length;
}

/** Returns the matched command name if the input exactly matches a known command. */
export function getMatchedCommand(input: string): string | null {
  const parts = input.split(/\s+/);
  const commandName = parts[0]?.toLowerCase() || '';
  const matched = COMMANDS.find((c) => c.name === commandName);
  return matched ? matched.name : null;
}

function GiphySearch({ query, onSelect }: { query: string; onSelect: (url: string) => void }) {
  const [gifs, setGifs] = useState<GiphyGif[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const fetchGifs = useCallback(async (q: string) => {
    setLoading(true);
    setError('');
    try {
      const endpoint = q
        ? `/api/v1/giphy/search?q=${encodeURIComponent(q)}&limit=20`
        : '/api/v1/giphy/trending?limit=20';
      const data = await api.get<GiphyGif[]>(endpoint);
      setGifs(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load GIFs');
      setGifs([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchGifs(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchGifs]);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Search className="size-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          {query ? `Searching: ${query}` : 'Trending GIFs'}
        </span>
        {loading && <Loader2 className="ml-auto size-3.5 animate-spin text-muted-foreground" />}
      </div>

      {error && (
        <div className="px-3 py-4 text-center text-xs text-red-500">{error}</div>
      )}

      {!error && gifs.length === 0 && !loading && (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">
          {query ? 'No GIFs found' : 'Type to search for GIFs'}
        </div>
      )}

      {gifs.length > 0 && (
        <div className="grid max-h-64 grid-cols-3 gap-1 overflow-y-auto p-2">
          {gifs.map((gif) => (
            <button
              key={gif.id}
              onClick={() => onSelect(gif.url)}
              className="group relative overflow-hidden rounded-md hover:ring-2 hover:ring-accent transition-all"
              title={gif.title}
            >
              <img
                src={gif.preview_url}
                alt={gif.title}
                className="h-24 w-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-border px-3 py-1.5 text-center">
        <span className="text-[10px] text-muted-foreground">Powered by GIPHY</span>
      </div>
    </div>
  );
}
