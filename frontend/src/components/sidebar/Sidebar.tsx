'use client';

import { useAuthStore } from '@/stores/authStore';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ChannelList } from './ChannelList';
import { DMList } from './DMList';
import { AgentList } from './AgentList';
import { CreateChannelDialog } from './CreateChannelDialog';
import { NewDMDialog } from './NewDMDialog';
import { LogOut, Bot, Settings, ChevronDown, Search } from 'lucide-react';
import Link from 'next/link';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';

export function Sidebar() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

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

      {/* Search */}
      <div className="px-3 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search..."
            className="h-8 rounded-md border-chat-input-border bg-chat-input-bg pl-7 text-xs text-foreground placeholder:text-muted-foreground"
          />
        </div>
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
              href="/admin/migration"
              className="mx-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-section-text hover:bg-sidebar-hover hover:text-foreground"
            >
              Migration
            </Link>
          </>
        )}
      </div>

      {/* Bottom user bar */}
      {user && (
        <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded bg-accent-primary text-xs font-bold text-accent-primary-text">
            {user.display_name?.charAt(0).toUpperCase() || '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{user.display_name}</p>
          </div>
          <ThemeSwitcher />
          <span className="inline-block size-2 shrink-0 rounded-full bg-status-online" />
        </div>
      )}
    </aside>
  );
}
