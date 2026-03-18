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
import { LogOut, Bot, Settings, ChevronDown, Search, LayoutDashboard, Users, Hash, ArrowLeftRight, Key, Bug } from 'lucide-react';
import Link from 'next/link';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { BugReportDialog } from './BugReportDialog';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

interface SidebarProps {
  onOpenSearch?: () => void;
}

export function Sidebar({ onOpenSearch }: SidebarProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [profileOpen, setProfileOpen] = useState(false);
  const [bugReportOpen, setBugReportOpen] = useState(false);

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
        <div className="mb-1 flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-1">
            <ChevronDown className="size-3 text-sidebar-section-text" />
            <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-section-text">
              Channels
            </span>
          </div>
          <CreateChannelDialog />
        </div>
        <ChannelList />

        {/* DMs section */}
        <div className="mt-5 mb-1 flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-1">
            <ChevronDown className="size-3 text-sidebar-section-text" />
            <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-section-text">
              Direct Messages
            </span>
          </div>
          <NewDMDialog />
        </div>
        <DMList />

        {/* AI Agents section */}
        <div className="mt-5 mb-1 flex items-center gap-1 px-3 py-2">
          <ChevronDown className="size-3 text-sidebar-section-text" />
          <Bot className="size-3 text-sidebar-section-text" />
          <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-section-text">
            AI Agents
          </span>
        </div>
        <AgentList />

        {/* Settings section */}
        <div className="mt-5 mb-1 flex items-center gap-1 px-3 py-2">
          <ChevronDown className="size-3 text-sidebar-section-text" />
          <Settings className="size-3 text-sidebar-section-text" />
          <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-section-text">
            Settings
          </span>
        </div>
        <Link
          href="/settings/tokens"
          className="mx-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-section-text transition-all duration-150 hover:bg-sidebar-hover hover:text-foreground hover:translate-x-0.5"
        >
          <Key className="size-3.5" />
          API Tokens
        </Link>

        {/* Admin section */}
        {user?.role === 'admin' && (
          <>
            <div className="mt-5 mb-1 flex items-center gap-1 px-3 py-2">
              <ChevronDown className="size-3 text-sidebar-section-text" />
              <Settings className="size-3 text-sidebar-section-text" />
              <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-section-text">
                Admin
              </span>
            </div>
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
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setBugReportOpen(true)}
            className="text-sidebar-section-text hover:text-foreground"
            title="Report a bug"
          >
            <Bug className="size-3.5" />
          </Button>
          <span className="inline-block size-2 shrink-0 rounded-full bg-status-online" />
        </div>
      )}
      <ProfileModal open={profileOpen} onOpenChange={setProfileOpen} />
      <BugReportDialog open={bugReportOpen} onOpenChange={setBugReportOpen} />
    </aside>
  );
}
