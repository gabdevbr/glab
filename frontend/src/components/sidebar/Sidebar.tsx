'use client';

import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ChannelList } from './ChannelList';
import { DMList } from './DMList';
import { AgentList } from './AgentList';
import { CreateChannelDialog } from './CreateChannelDialog';
import { NewDMDialog } from './NewDMDialog';
import { ProfileModal } from './ProfileModal';
import { LogOut, Bot, Settings, ChevronDown, ChevronRight, Search, LayoutDashboard, Users, Hash, ArrowLeftRight, Key, Bug } from 'lucide-react';
import Link from 'next/link';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/+$/, '');

interface SidebarProps {
  onOpenSearch?: () => void;
}

export function Sidebar({ onOpenSearch }: SidebarProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [profileOpen, setProfileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  function handleLogout() {
    logout();
    router.push('/login');
  }

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col bg-sidebar">
      {/* Workspace header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-1">
          <h1 className="text-lg font-bold text-foreground tracking-tight">Glab</h1>
          <ChevronDown className="size-3.5 text-sidebar-section-text" />
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleLogout}
          className="text-sidebar-section-text hover:text-foreground"
        >
          <LogOut className="size-3.5" />
        </Button>
      </div>

      {/* User info */}
      {user && (
        <div className="flex items-center gap-2 px-4 pb-2">
          <span className="inline-block size-2 shrink-0 rounded-full bg-status-online" />
          <p className="truncate text-sm text-sidebar-section-text">{user.display_name}</p>
        </div>
      )}

      {/* Search — opens Quick Switcher */}
      <div className="px-3 pb-3">
        <button
          onClick={onOpenSearch}
          className="flex h-8 w-full items-center gap-2 rounded-md border border-chat-input-border bg-chat-input-bg px-2 text-xs text-muted-foreground hover:border-chat-input-focus"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="flex-1 text-left">Search...</span>
          <kbd className="rounded border border-border bg-secondary px-1 py-0.5 text-[9px] text-muted-foreground">
            {typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent) ? '⌘K' : 'Ctrl+K'}
          </kbd>
        </button>
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto px-2 pt-3">
        {/* Channels section */}
        <button
          onClick={() => setCollapsed((s) => ({ ...s, channels: !s.channels }))}
          className="mb-1 flex w-full items-center justify-between px-3 py-2 hover:bg-sidebar-hover rounded-md transition-colors"
        >
          <div className="flex items-center gap-1">
            {collapsed.channels ? (
              <ChevronRight className="size-3 text-sidebar-section-text" />
            ) : (
              <ChevronDown className="size-3 text-sidebar-section-text" />
            )}
            <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-section-text">
              Channels
            </span>
          </div>
        </button>
        {!collapsed.channels && (
          <>
            <div className="flex justify-end px-3 -mt-1 mb-1">
              <CreateChannelDialog />
            </div>
            <ChannelList />
          </>
        )}

        {/* DMs section */}
        <button
          onClick={() => setCollapsed((s) => ({ ...s, dms: !s.dms }))}
          className="mt-5 mb-1 flex w-full items-center justify-between px-3 py-2 hover:bg-sidebar-hover rounded-md transition-colors"
        >
          <div className="flex items-center gap-1">
            {collapsed.dms ? (
              <ChevronRight className="size-3 text-sidebar-section-text" />
            ) : (
              <ChevronDown className="size-3 text-sidebar-section-text" />
            )}
            <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-section-text">
              Direct Messages
            </span>
          </div>
        </button>
        {!collapsed.dms && (
          <>
            <div className="flex justify-end px-3 -mt-1 mb-1">
              <NewDMDialog />
            </div>
            <DMList />
          </>
        )}

        {/* AI Agents section */}
        <button
          onClick={() => setCollapsed((s) => ({ ...s, agents: !s.agents }))}
          className="mt-5 mb-1 flex w-full items-center gap-1 px-3 py-2 hover:bg-sidebar-hover rounded-md transition-colors"
        >
          {collapsed.agents ? (
            <ChevronRight className="size-3 text-sidebar-section-text" />
          ) : (
            <ChevronDown className="size-3 text-sidebar-section-text" />
          )}
          <Bot className="size-3 text-sidebar-section-text" />
          <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-section-text">
            AI Agents
          </span>
        </button>
        {!collapsed.agents && <AgentList />}

        {/* Settings section */}
        <button
          onClick={() => setCollapsed((s) => ({ ...s, settings: !s.settings }))}
          className="mt-5 mb-1 flex w-full items-center gap-1 px-3 py-2 hover:bg-sidebar-hover rounded-md transition-colors"
        >
          {collapsed.settings ? (
            <ChevronRight className="size-3 text-sidebar-section-text" />
          ) : (
            <ChevronDown className="size-3 text-sidebar-section-text" />
          )}
          <Settings className="size-3 text-sidebar-section-text" />
          <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-section-text">
            Settings
          </span>
        </button>
        {!collapsed.settings && (
          <Link
            href="/settings/tokens"
            className="mx-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-section-text transition-all duration-150 hover:bg-sidebar-hover hover:text-foreground hover:translate-x-0.5"
          >
            <Key className="size-3.5" />
            API Tokens
          </Link>
        )}

        {/* Admin section */}
        {user?.role === 'admin' && (
          <>
            <button
              onClick={() => setCollapsed((s) => ({ ...s, admin: !s.admin }))}
              className="mt-5 mb-1 flex w-full items-center gap-1 px-3 py-2 hover:bg-sidebar-hover rounded-md transition-colors"
            >
              {collapsed.admin ? (
                <ChevronRight className="size-3 text-sidebar-section-text" />
              ) : (
                <ChevronDown className="size-3 text-sidebar-section-text" />
              )}
              <Settings className="size-3 text-sidebar-section-text" />
              <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-section-text">
                Admin
              </span>
            </button>
            {!collapsed.admin && (
              <>
                <Link
                  href="/admin"
                  className="mx-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-section-text transition-all duration-150 hover:bg-sidebar-hover hover:text-foreground hover:translate-x-0.5"
                >
                  <LayoutDashboard className="size-3.5" />
                  Dashboard
                </Link>
                <Link
                  href="/admin/users"
                  className="mx-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-section-text transition-all duration-150 hover:bg-sidebar-hover hover:text-foreground hover:translate-x-0.5"
                >
                  <Users className="size-3.5" />
                  Users
                </Link>
                <Link
                  href="/admin/channels"
                  className="mx-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-section-text transition-all duration-150 hover:bg-sidebar-hover hover:text-foreground hover:translate-x-0.5"
                >
                  <Hash className="size-3.5" />
                  Channels
                </Link>
                <Link
                  href="/admin/migration"
                  className="mx-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-section-text transition-all duration-150 hover:bg-sidebar-hover hover:text-foreground hover:translate-x-0.5"
                >
                  <ArrowLeftRight className="size-3.5" />
                  Migration
                </Link>
              </>
            )}
          </>
        )}
      </div>

      {/* Bottom user bar */}
      {user && (
        <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
          <button
            onClick={() => setProfileOpen(true)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-0.5 -ml-0.5 transition-colors hover:bg-sidebar-hover"
          >
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-primary text-xs font-bold text-accent-primary-text overflow-hidden">
              {user.avatar_url ? (
                <img
                  src={user.avatar_url.startsWith('/') ? `${API_URL}${user.avatar_url}` : user.avatar_url}
                  alt={user.display_name}
                  className="size-7 rounded-full object-cover"
                />
              ) : (
                user.display_name?.charAt(0).toUpperCase() || '?'
              )}
            </div>
            <p className="truncate text-sm font-medium text-foreground">{user.display_name}</p>
          </button>
          <ThemeSwitcher />
          <a
            href="https://github.com/gabdevbr/glab/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-md text-sidebar-section-text hover:text-foreground hover:bg-sidebar-hover size-7 transition-colors"
            title="Report a bug"
          >
            <Bug className="size-3.5" />
          </a>
          <span className="inline-block size-2 shrink-0 rounded-full bg-status-online" />
        </div>
      )}
      <ProfileModal open={profileOpen} onOpenChange={setProfileOpen} />
    </aside>
  );
}
