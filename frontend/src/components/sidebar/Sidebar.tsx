'use client';

import { useAuthStore } from '@/stores/authStore';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ChannelList } from './ChannelList';
import { DMList } from './DMList';
import { CreateChannelDialog } from './CreateChannelDialog';
import { NewDMDialog } from './NewDMDialog';
import { LogOut } from 'lucide-react';

export function Sidebar() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  function handleLogout() {
    logout();
    router.push('/login');
  }

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col bg-slate-900">
      {/* Workspace header */}
      <div className="flex items-center justify-between px-4 py-3">
        <h1 className="text-lg font-bold text-white">Glab</h1>
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
        <div className="px-4 pb-2">
          <p className="truncate text-xs text-slate-400">{user.display_name}</p>
        </div>
      )}

      {/* Search */}
      <div className="px-3 pb-3">
        <Input
          placeholder="Search..."
          className="h-7 border-slate-700 bg-slate-800 text-xs text-slate-50 placeholder:text-slate-500"
        />
      </div>

      <Separator className="bg-slate-800" />

      {/* Channels section */}
      <div className="flex-1 overflow-y-auto px-1 pt-3">
        <div className="mb-1 flex items-center justify-between px-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Channels
          </span>
          <CreateChannelDialog />
        </div>
        <ChannelList />

        <Separator className="my-3 bg-slate-800" />

        {/* DMs section */}
        <div className="mb-1 flex items-center justify-between px-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Direct Messages
          </span>
          <NewDMDialog />
        </div>
        <DMList />
      </div>
    </aside>
  );
}
