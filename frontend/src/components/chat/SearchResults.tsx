'use client';

import { useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { SearchResult } from '@/lib/types';
import { useChannelStore } from '@/stores/channelStore';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';

interface SearchResultsProps {
  onClose: () => void;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '...';
}

export function SearchResults({ onClose }: SearchResultsProps) {
  const router = useRouter();
  const channels = useChannelStore((s) => s.channels);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const doSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setIsSearching(true);
    setHasSearched(true);
    try {
      const data = await api.get<SearchResult[]>(
        `/api/v1/search?q=${encodeURIComponent(q)}&limit=20`,
      );
      setResults(data);
    } catch {
      setResults([]);
    }
    setIsSearching(false);
  }, [query]);

  function handleResultClick(result: SearchResult) {
    setActiveChannel(result.channel_id);
    router.push(`/channel/${result.channel_id}`);
    onClose();
  }

  function getChannelName(channelId: string): string {
    const ch = channels.find((c) => c.id === channelId);
    return ch ? `#${ch.name}` : '';
  }

  return (
    <div className="flex h-full w-[400px] shrink-0 flex-col border-l border-slate-800 bg-slate-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-100">Search</h3>
        <button
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Search input */}
      <div className="border-b border-slate-800 p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            doSearch();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages..."
            autoFocus
            className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-slate-600 focus:outline-none focus:ring-1 focus:ring-slate-600"
          />
          <button
            type="submit"
            disabled={!query.trim() || isSearching}
            className="rounded-lg bg-indigo-600 p-1.5 text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <Search className="size-4" />
          </button>
        </form>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {isSearching && (
          <p className="py-4 text-center text-xs text-slate-500">Searching...</p>
        )}
        {!isSearching && hasSearched && results.length === 0 && (
          <p className="py-4 text-center text-xs text-slate-500">No results found</p>
        )}
        {results.map((r) => (
          <button
            key={r.id}
            onClick={() => handleResultClick(r)}
            className="w-full border-b border-slate-800/50 px-4 py-3 text-left hover:bg-slate-800/30"
          >
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-medium text-slate-300">
                {r.display_name || r.username}
              </span>
              <span className="text-[10px] text-slate-500">
                {getChannelName(r.channel_id)}
              </span>
              <span className="text-[10px] text-slate-600">
                {formatDate(r.created_at)}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              {truncate(r.content, 120)}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
