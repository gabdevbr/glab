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
          <button className="rounded p-0.5 text-sidebar-section-text transition-colors hover:bg-sidebar-hover hover:text-foreground" />
        }
      >
        <Plus className="size-4" />
      </DialogTrigger>
      <DialogContent className="border-border bg-panel-bg text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">New message</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Start a direct message with someone.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or username..."
          className="border-chat-input-border bg-chat-input-bg text-foreground placeholder:text-muted-foreground"
        />
        {error && <p className="text-sm text-status-error">{error}</p>}
        <div className="max-h-60 overflow-y-auto">
          {isLoading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Loading users...</p>
          ) : filteredUsers.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No users found</p>
          ) : (
            <ul className="space-y-0.5">
              {filteredUsers.map((user) => (
                <li key={user.id}>
                  <button
                    onClick={() => handleSelectUser(user)}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground"
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-avatar-bg text-xs font-medium text-avatar-text">
                      {user.display_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="truncate font-medium">{user.display_name}</p>
                      <p className="truncate text-xs text-muted-foreground">@{user.username}</p>
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
