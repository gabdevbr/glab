'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LayoutDashboard, Users, Hash, ArrowLeftRight, HardDrive, Bot, Clock, Pencil } from 'lucide-react';

const adminTabs = [
  { value: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { value: '/admin/users', label: 'Users', icon: Users },
  { value: '/admin/channels', label: 'Channels', icon: Hash },
  { value: '/admin/storage', label: 'Storage', icon: HardDrive },
  { value: '/admin/ai', label: 'AI', icon: Bot },
  { value: '/admin/retention', label: 'Retention', icon: Clock },
  { value: '/admin/messages', label: 'Messages', icon: Pencil },
  { value: '/admin/migration', label: 'Migration', icon: ArrowLeftRight },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.replace('/channel');
    }
  }, [user, router]);

  if (!user || user.role !== 'admin') return null;

  const currentTab = adminTabs.find((t) => pathname === t.value)?.value
    || adminTabs.find((t) => t.value !== '/admin' && pathname.startsWith(t.value))?.value
    || '/admin';

  return (
    <div className="flex h-full flex-1 flex-col bg-chat-bg animate-in fade-in-0 duration-150">
      {/* Header */}
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-bold text-foreground">Administration</h1>
        <Tabs
          value={currentTab}
          onValueChange={(v) => router.push(v)}
          className="mt-3"
        >
          <TabsList className="bg-secondary/50">
            {adminTabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 text-xs">
                <tab.icon className="size-3.5" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {children}
      </div>
    </div>
  );
}
