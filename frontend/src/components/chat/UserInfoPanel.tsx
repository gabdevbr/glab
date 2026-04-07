'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { User, Channel } from '@/lib/types';
import { usePresenceStore } from '@/stores/presenceStore';
import { useAuthStore } from '@/stores/authStore';
import { useChannelStore } from '@/stores/channelStore';
import { X, UserIcon, MessageSquare, Shield, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UserInfoPanelProps {
  userId: string;
  onClose: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  online: { label: 'Online', color: 'bg-status-online' },
  away: { label: 'Away', color: 'bg-status-away' },
  dnd: { label: 'Do not disturb', color: 'bg-status-dnd' },
  offline: { label: 'Offline', color: 'bg-status-offline' },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function UserInfoPanel({ userId, onClose }: UserInfoPanelProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const presenceStatus = usePresenceStore((s) => s.statuses[userId]);
  const currentUser = useAuthStore((s) => s.user);
  const channels = useChannelStore((s) => s.channels);
  const addChannel = useChannelStore((s) => s.addChannel);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const router = useRouter();

  useEffect(() => {
    setIsLoading(true);
    setUser(null);
    api
      .get<User>(`/api/v1/users/${userId}`)
      .then((data) => {
        setUser(data);
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, [userId]);

  const status = presenceStatus || user?.status || 'offline';
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.offline;

  const handleSendMessage = async () => {
    if (!currentUser || currentUser.id === userId || isSending) return;

    // Check if a DM channel already exists with this user
    const existingDM = channels.find(
      (c) => c.type === 'dm' && c.dm_user_id === userId,
    );

    if (existingDM) {
      router.push(`/channel/${existingDM.id}`);
      onClose();
      return;
    }

    // Create a new DM channel
    setIsSending(true);
    try {
      const newChannel = await api.post<Channel>('/api/v1/channels', {
        type: 'dm',
        member_id: userId,
      });
      addChannel(newChannel);
      setActiveChannel(newChannel.id);
      router.push(`/channel/${newChannel.id}`);
      onClose();
    } catch {
      setIsSending(false);
    }
  };

  const initials = user?.display_name
    ? user.display_name.charAt(0).toUpperCase()
    : user?.username?.charAt(0).toUpperCase() || '?';

  return (
    <div className="flex h-full w-[400px] shrink-0 flex-col border-l border-border bg-background animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <UserIcon className="size-4 text-muted-foreground" />
        <h3 className="flex-1 text-sm font-semibold text-foreground">Profile</h3>
        <button
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <p className="py-8 text-center text-xs text-muted-foreground">Loading...</p>
        )}
        {!isLoading && !user && (
          <p className="py-8 text-center text-xs text-muted-foreground">User not found</p>
        )}
        {!isLoading && user && (
          <div className="flex flex-col items-center px-6 py-6">
            {/* Large avatar */}
            <div className="relative mb-4">
              <div className="flex size-20 items-center justify-center rounded-full bg-avatar-bg text-2xl font-semibold text-avatar-text">
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.display_name}
                    className="size-20 rounded-full object-cover"
                  />
                ) : (
                  initials
                )}
              </div>
              {/* Status dot */}
              <div
                className={cn(
                  'absolute bottom-0.5 right-0.5 size-4 rounded-full border-2 border-background',
                  statusCfg.color,
                )}
                title={statusCfg.label}
              />
            </div>

            {/* Display name */}
            <h2 className="text-lg font-bold text-foreground">{user.display_name || user.username}</h2>

            {/* Username */}
            <p className="text-sm text-muted-foreground">@{user.username}</p>

            {/* Status text */}
            <span className="mt-1 text-xs text-muted-foreground">{statusCfg.label}</span>

            {/* Role + Bot badges */}
            <div className="mt-3 flex items-center gap-2">
              {user.role === 'admin' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
                  <Shield className="size-3" />
                  Admin
                </span>
              )}
              {user.is_bot && (
                <span className="inline-flex items-center gap-1 rounded-full bg-bot-badge-bg px-2.5 py-0.5 text-xs font-medium text-bot-badge-text">
                  <Bot className="size-3" />
                  Bot
                </span>
              )}
              {user.role === 'user' && !user.is_bot && (
                <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  Member
                </span>
              )}
            </div>

            {/* Info fields */}
            <div className="mt-6 w-full space-y-3 border-t border-border pt-4">
              {user.email && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Email</p>
                  <p className="text-sm text-foreground">{user.email}</p>
                </div>
              )}
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Member since</p>
                <p className="text-sm text-foreground">{formatDate(user.created_at)}</p>
              </div>
            </div>

            {/* Action buttons */}
            {currentUser && currentUser.id !== userId && !user.is_bot && (
              <div className="mt-6 w-full">
                <button
                  onClick={handleSendMessage}
                  disabled={isSending}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-accent-primary-text hover:bg-accent-primary/90 disabled:opacity-50"
                >
                  <MessageSquare className="size-4" />
                  {isSending ? 'Opening...' : 'Send Message'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
