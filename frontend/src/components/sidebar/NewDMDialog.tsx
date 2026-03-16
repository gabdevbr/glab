'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useChannelStore } from '@/stores/channelStore';
import { User, Channel } from '@/lib/types';
import { useAuthStore } from '@/stores/authStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Plus } from 'lucide-react';

export function NewDMDialog() {
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.user);
  const addChannel = useChannelStore((s) => s.addChannel);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);

  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    api
      .get<User[]>('/api/v1/users')
      .then((data) => setUsers(data))
      .catch(() => setError('Failed to load users'))
      .finally(() => setIsLoading(false));
  }, [open]);

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();
    return users
      .filter((u) => u.id !== currentUser?.id)
      .filter(
        (u) =>
          u.display_name.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q),
      );
  }, [users, search, currentUser?.id]);

  async function handleSelectUser(user: User) {
    setError('');
    try {
      // TODO: Backend needs a dedicated DM creation endpoint (POST /api/v1/dm).
      // For now, we use channel creation with type='dm' as a workaround.
      const channel = await api.post<Channel>('/api/v1/channels', {
        name: user.display_name,
        type: 'dm',
      });
      addChannel(channel);
      setActiveChannel(channel.id);
      setOpen(false);
      setSearch('');
      router.push(`/channel/${channel.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create DM');
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setSearch('');
          setError('');
        }
      }}
    >
      <DialogTrigger
        render={
          <button className="rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-200" />
        }
      >
        <Plus className="size-4" />
      </DialogTrigger>
      <DialogContent className="border-slate-700 bg-slate-900 text-slate-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-slate-100">New message</DialogTitle>
          <DialogDescription className="text-slate-400">
            Start a direct message with someone.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or username..."
          className="border-slate-700 bg-slate-800 text-slate-50 placeholder:text-slate-500"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="max-h-60 overflow-y-auto">
          {isLoading ? (
            <p className="py-4 text-center text-sm text-slate-500">Loading users...</p>
          ) : filteredUsers.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">No users found</p>
          ) : (
            <ul className="space-y-0.5">
              {filteredUsers.map((user) => (
                <li key={user.id}>
                  <button
                    onClick={() => handleSelectUser(user)}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-700/50 hover:text-slate-100"
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-medium text-slate-300">
                      {user.display_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="truncate font-medium">{user.display_name}</p>
                      <p className="truncate text-xs text-slate-500">@{user.username}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
