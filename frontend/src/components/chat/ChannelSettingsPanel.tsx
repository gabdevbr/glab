'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { Channel, ChannelMember, User } from '@/lib/types';
import { useAuthStore } from '@/stores/authStore';
import { useChannelStore } from '@/stores/channelStore';
import {
  X, Settings, Users, UserPlus, Crown, Shield, Trash2,
  Hash, Pencil, Check, ChevronDown, Archive, Lock, Unlock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChannelSettingsPanelProps {
  channelId: string;
  onClose: () => void;
}

type Tab = 'info' | 'members';

const ROLE_LABELS: Record<string, { label: string; icon: typeof Crown; color: string }> = {
  owner: { label: 'Owner', icon: Crown, color: 'text-yellow-500' },
  admin: { label: 'Admin', icon: Shield, color: 'text-blue-500' },
  member: { label: 'Member', icon: Users, color: 'text-muted-foreground' },
};

export function ChannelSettingsPanel({ channelId, onClose }: ChannelSettingsPanelProps) {
  const currentUser = useAuthStore((s) => s.user);
  const updateStoreChannel = useChannelStore((s) => s.updateChannel);
  const removeChannel = useChannelStore((s) => s.removeChannel);

  const [channel, setChannel] = useState<Channel | null>(null);
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('info');
  const [showAddMember, setShowAddMember] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Editable fields
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTopic, setEditTopic] = useState('');

  // Role dropdown
  const [roleDropdownUser, setRoleDropdownUser] = useState<string | null>(null);

  const isOwner = channel?.my_role === 'owner';
  const isAdmin = channel?.my_role === 'admin' || isOwner;
  const isSysAdmin = currentUser?.role === 'admin';
  const canManage = isAdmin || isSysAdmin;

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [ch, mem] = await Promise.all([
        api.get<Channel>(`/api/v1/channels/${channelId}`),
        api.listChannelMembers<ChannelMember[]>(channelId),
      ]);
      setChannel(ch);
      setMembers(mem);
      setEditName(ch.name);
      setEditDescription(ch.description || '');
      setEditTopic(ch.topic || '');
    } catch {
      // ignore
    }
    setIsLoading(false);
  }, [channelId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Server-side user search with debounce
  useEffect(() => {
    if (!showAddMember) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    searchTimerRef.current = setTimeout(() => {
      const query = addSearch.trim();
      const url = query
        ? `/api/v1/users?search=${encodeURIComponent(query)}&limit=20`
        : '/api/v1/users?limit=20';
      api.get<User[]>(url).then(setSearchResults).catch(() => {});
    }, 200);

    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [showAddMember, addSearch]);

  const handleSaveField = async (field: string) => {
    if (!channel) return;
    const data: Record<string, unknown> = {};
    if (field === 'name') data.name = editName.trim();
    if (field === 'description') data.description = editDescription.trim();
    if (field === 'topic') data.topic = editTopic.trim();

    try {
      const updated = await api.updateChannel(channelId, data) as Channel;
      setChannel(updated);
      updateStoreChannel(updated);
      setEditingField(null);
    } catch {
      // ignore
    }
  };

  const handleToggleReadOnly = async () => {
    if (!channel) return;
    try {
      const updated = await api.updateChannel(channelId, { read_only: !channel.read_only }) as Channel;
      setChannel(updated);
      updateStoreChannel(updated);
    } catch {
      // ignore
    }
  };

  const handleToggleArchive = async () => {
    if (!channel) return;
    try {
      const updated = await api.updateChannel(channelId, { is_archived: !channel.is_archived }) as Channel;
      setChannel(updated);
      updateStoreChannel(updated);
    } catch {
      // ignore
    }
  };

  const handleDeleteChannel = async () => {
    if (!channel || !confirm('Delete this channel permanently? This cannot be undone.')) return;
    try {
      await api.delete(`/api/v1/channels/${channelId}`);
      removeChannel(channelId);
      onClose();
    } catch {
      // ignore
    }
  };

  const handleAddMember = async (userId: string) => {
    try {
      await api.addChannelMember(channelId, userId);
      setShowAddMember(false);
      setAddSearch('');
      fetchData();
    } catch {
      // ignore
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!confirm('Remove this member from the channel?')) return;
    try {
      await api.removeChannelMember(channelId, userId);
      fetchData();
    } catch {
      // ignore
    }
  };

  const handleChangeRole = async (userId: string, role: string) => {
    try {
      await api.updateMemberRole(channelId, userId, role);
      setRoleDropdownUser(null);
      fetchData();
    } catch {
      // ignore
    }
  };

  const memberIds = new Set(members.map((m) => m.id));
  const filteredUsers = searchResults.filter(
    (u) => !memberIds.has(u.id) && !u.is_bot,
  );

  if (isLoading) {
    return (
      <div className="flex h-full w-[400px] shrink-0 flex-col border-l border-border bg-background animate-slide-in-right">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Settings className="size-4 text-muted-foreground" />
          <h3 className="flex-1 text-sm font-semibold text-foreground">Channel Settings</h3>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        <p className="py-8 text-center text-xs text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="flex h-full w-[400px] shrink-0 flex-col border-l border-border bg-background animate-slide-in-right">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Settings className="size-4 text-muted-foreground" />
          <h3 className="flex-1 text-sm font-semibold text-foreground">Channel Settings</h3>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        <p className="py-8 text-center text-xs text-muted-foreground">Channel not found</p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-[400px] shrink-0 flex-col border-l border-border bg-background animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Settings className="size-4 text-muted-foreground" />
        <h3 className="flex-1 text-sm font-semibold text-foreground">Channel Settings</h3>
        <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setTab('info')}
          className={cn(
            'flex-1 px-4 py-2.5 text-xs font-medium transition-colors',
            tab === 'info'
              ? 'border-b-2 border-accent-primary text-accent-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Details
        </button>
        <button
          onClick={() => setTab('members')}
          className={cn(
            'flex-1 px-4 py-2.5 text-xs font-medium transition-colors',
            tab === 'members'
              ? 'border-b-2 border-accent-primary text-accent-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Members ({members.length})
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'info' && (
          <div className="space-y-4 px-4 py-4">
            {/* Channel icon + name */}
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-lg bg-secondary text-lg">
                <Hash className="size-6 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                {editingField === 'name' && canManage ? (
                  <div className="flex items-center gap-1">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:border-accent-primary focus:outline-none"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveField('name');
                        if (e.key === 'Escape') setEditingField(null);
                      }}
                    />
                    <button onClick={() => handleSaveField('name')} className="rounded p-1 text-green-500 hover:bg-secondary">
                      <Check className="size-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <h2 className="truncate text-base font-bold text-foreground">{channel.name}</h2>
                    {canManage && (
                      <button
                        onClick={() => setEditingField('name')}
                        className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <Pencil className="size-3" />
                      </button>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {channel.type === 'private' ? 'Private' : 'Public'} channel
                </p>
              </div>
            </div>

            {/* Topic */}
            <div>
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Topic</p>
                {canManage && editingField !== 'topic' && (
                  <button onClick={() => setEditingField('topic')} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
                    <Pencil className="size-3" />
                  </button>
                )}
              </div>
              {editingField === 'topic' && canManage ? (
                <div className="mt-1 flex items-start gap-1">
                  <input
                    value={editTopic}
                    onChange={(e) => setEditTopic(e.target.value)}
                    className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:border-accent-primary focus:outline-none"
                    placeholder="Set a topic..."
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveField('topic');
                      if (e.key === 'Escape') setEditingField(null);
                    }}
                  />
                  <button onClick={() => handleSaveField('topic')} className="rounded p-1 text-green-500 hover:bg-secondary">
                    <Check className="size-3.5" />
                  </button>
                </div>
              ) : (
                <p className="mt-1 text-sm text-foreground">
                  {channel.topic || <span className="text-muted-foreground italic">No topic set</span>}
                </p>
              )}
            </div>

            {/* Description */}
            <div>
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Description</p>
                {canManage && editingField !== 'description' && (
                  <button onClick={() => setEditingField('description')} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
                    <Pencil className="size-3" />
                  </button>
                )}
              </div>
              {editingField === 'description' && canManage ? (
                <div className="mt-1 flex items-start gap-1">
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="flex-1 resize-none rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:border-accent-primary focus:outline-none"
                    rows={3}
                    placeholder="Add a description..."
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setEditingField(null);
                    }}
                  />
                  <button onClick={() => handleSaveField('description')} className="rounded p-1 text-green-500 hover:bg-secondary">
                    <Check className="size-3.5" />
                  </button>
                </div>
              ) : (
                <p className="mt-1 text-sm text-foreground">
                  {channel.description || <span className="text-muted-foreground italic">No description</span>}
                </p>
              )}
            </div>

            {/* Channel info */}
            <div className="space-y-2 border-t border-border pt-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Created</span>
                <span className="text-foreground">{new Date(channel.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Members</span>
                <span className="text-foreground">{members.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Your role</span>
                <span className={cn('font-medium', ROLE_LABELS[channel.my_role || 'member']?.color)}>
                  {ROLE_LABELS[channel.my_role || 'member']?.label || 'Member'}
                </span>
              </div>
            </div>

            {/* Channel settings (owner/admin only) */}
            {canManage && (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Settings</p>
                <button
                  onClick={handleToggleReadOnly}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-secondary"
                >
                  {channel.read_only ? <Lock className="size-4 text-yellow-500" /> : <Unlock className="size-4 text-muted-foreground" />}
                  <span className="flex-1 text-left">{channel.read_only ? 'Read-only (enabled)' : 'Read-only (disabled)'}</span>
                </button>
                <button
                  onClick={handleToggleArchive}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-secondary"
                >
                  <Archive className="size-4 text-muted-foreground" />
                  <span className="flex-1 text-left">{channel.is_archived ? 'Unarchive channel' : 'Archive channel'}</span>
                </button>
              </div>
            )}

            {/* Danger zone (owner only) */}
            {(isOwner || isSysAdmin) && (
              <div className="border-t border-border pt-3">
                <button
                  onClick={handleDeleteChannel}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="size-4" />
                  <span>Delete channel</span>
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'members' && (
          <div className="px-4 py-4">
            {/* Add member button */}
            {canManage && (
              <div className="mb-3">
                {showAddMember ? (
                  <div className="space-y-2">
                    <input
                      value={addSearch}
                      onChange={(e) => setAddSearch(e.target.value)}
                      placeholder="Search users..."
                      className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent-primary focus:outline-none"
                      autoFocus
                    />
                    <div className="max-h-40 overflow-y-auto rounded border border-border">
                      {filteredUsers.length === 0 && (
                        <p className="px-3 py-2 text-xs text-muted-foreground">No users found</p>
                      )}
                      {filteredUsers.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => handleAddMember(u.id)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-secondary"
                        >
                          <div className="flex size-6 items-center justify-center rounded-full bg-avatar-bg text-xs font-medium text-avatar-text">
                            {u.avatar_url ? (
                              <img src={u.avatar_url} alt={u.display_name} className="size-6 rounded-full object-cover" />
                            ) : (
                              u.display_name.charAt(0).toUpperCase()
                            )}
                          </div>
                          <span className="text-foreground">{u.display_name}</span>
                          <span className="text-xs text-muted-foreground">@{u.username}</span>
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => { setShowAddMember(false); setAddSearch(''); setSearchResults([]); }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddMember(true)}
                    className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-accent-primary hover:text-accent-primary"
                  >
                    <UserPlus className="size-4" />
                    <span>Add member</span>
                  </button>
                )}
              </div>
            )}

            {/* Member list */}
            <div className="space-y-1">
              {members.map((m) => {
                const roleCfg = ROLE_LABELS[m.role] || ROLE_LABELS.member;
                const RoleIcon = roleCfg.icon;
                const isCurrentUser = m.id === currentUser?.id;

                return (
                  <div
                    key={m.id}
                    className="group flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-secondary"
                  >
                    {/* Avatar */}
                    <div className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-avatar-bg text-sm font-medium text-avatar-text">
                      {m.avatar_url ? (
                        <img src={m.avatar_url} alt={m.display_name} className="size-8 rounded-full object-cover" />
                      ) : (
                        m.display_name.charAt(0).toUpperCase()
                      )}
                    </div>

                    {/* Name + role */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-foreground">
                          {m.display_name}
                          {isCurrentUser && <span className="text-xs text-muted-foreground"> (you)</span>}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <RoleIcon className={cn('size-3', roleCfg.color)} />
                        <span>{roleCfg.label}</span>
                      </div>
                    </div>

                    {/* Actions (visible on hover for owner) */}
                    {canManage && !isCurrentUser && !m.is_bot && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Role change (owner only) */}
                        {(isOwner || isSysAdmin) && (
                          <div className="relative">
                            <button
                              onClick={() => setRoleDropdownUser(roleDropdownUser === m.id ? null : m.id)}
                              className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                              title="Change role"
                            >
                              <ChevronDown className="size-3.5" />
                            </button>
                            {roleDropdownUser === m.id && (
                              <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded-md border border-border bg-popover shadow-md">
                                {(['owner', 'admin', 'member'] as const).map((role) => {
                                  const Icon = ROLE_LABELS[role].icon;
                                  return (
                                    <button
                                      key={role}
                                      onClick={() => handleChangeRole(m.id, role)}
                                      className={cn(
                                        'flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-secondary',
                                        m.role === role && 'bg-secondary font-medium',
                                      )}
                                    >
                                      <Icon className={cn('size-3', ROLE_LABELS[role].color)} />
                                      {ROLE_LABELS[role].label}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                        {/* Remove member */}
                        <button
                          onClick={() => handleRemoveMember(m.id)}
                          className="rounded p-1 text-muted-foreground hover:bg-background hover:text-destructive"
                          title="Remove member"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
