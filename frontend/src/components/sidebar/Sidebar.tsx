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

export function Sidebar() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  function handleLogout() {
    logout();
    router.push('/login');
  }

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col bg-slate-900">
      {/* Workspace header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-1">
          <h1 className="text-lg font-bold text-white tracking-tight">Glab</h1>
          <ChevronDown className="size-3.5 text-slate-400" />
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleLogout}
          className="text-slate-400 hover:text-slate-200"
        >
          <LogOut className="size-3.5" />
        </Button>
      </div>

      {/* User info */}
      {user && (
        <div className="flex items-center gap-2 px-4 pb-2">
          <span className="inline-block size-2 shrink-0 rounded-full bg-green-500" />
          <p className="truncate text-sm text-slate-400">{user.display_name}</p>
        </div>
      )}

      {/* Search */}
      <div className="px-3 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-slate-500" />
          <Input
            placeholder="Search..."
            className="h-8 rounded-md border-slate-700 bg-slate-800 pl-7 text-xs text-slate-50 placeholder:text-slate-500"
          />
        </div>
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto px-2 pt-3">
        {/* Channels section */}
        <div className="mb-1 flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-1">
            <ChevronDown className="size-3 text-slate-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Channels
            </span>
          </div>
          <CreateChannelDialog />
        </div>
        <ChannelList />

        {/* DMs section */}
        <div className="mt-5 mb-1 flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-1">
            <ChevronDown className="size-3 text-slate-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Direct Messages
            </span>
          </div>
          <NewDMDialog />
        </div>
        <DMList />

        {/* AI Agents section */}
        <div className="mt-5 mb-1 flex items-center gap-1 px-3 py-2">
          <ChevronDown className="size-3 text-slate-400" />
          <Bot className="size-3 text-slate-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            AI Agents
          </span>
        </div>
        <AgentList />

        {/* Admin section */}
        {user?.role === 'admin' && (
          <>
            <div className="mt-5 mb-1 flex items-center gap-1 px-3 py-2">
              <ChevronDown className="size-3 text-slate-400" />
              <Settings className="size-3 text-slate-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Admin
              </span>
            </div>
            <Link
              href="/admin/migration"
              className="mx-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-400 hover:bg-slate-700/50 hover:text-slate-200"
            >
              Migration
            </Link>
          </>
        )}
      </div>

      {/* Bottom user bar */}
      {user && (
        <div className="flex items-center gap-2 border-t border-slate-800 px-4 py-2.5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded bg-indigo-600 text-xs font-bold text-white">
            {user.display_name?.charAt(0).toUpperCase() || '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user.display_name}</p>
          </div>
          <span className="inline-block size-2 shrink-0 rounded-full bg-green-500" />
        </div>
      )}
    </aside>
  );
}
