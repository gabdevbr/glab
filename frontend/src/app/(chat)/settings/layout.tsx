'use client';

import { useRouter, usePathname } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Key, Settings } from 'lucide-react';

const settingsTabs = [
  { value: '/settings/preferences', label: 'Preferences', icon: Settings },
  { value: '/settings/tokens', label: 'API Tokens', icon: Key },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const currentTab =
    settingsTabs.find((t) => pathname.startsWith(t.value))?.value || settingsTabs[0].value;

  return (
    <div className="flex h-full flex-1 flex-col bg-chat-bg animate-in fade-in-0 duration-150">
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-bold text-foreground">Settings</h1>
        <Tabs
          value={currentTab}
          onValueChange={(v) => router.push(v)}
          className="mt-3"
        >
          <TabsList className="bg-secondary/50">
            {settingsTabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 text-xs">
                <tab.icon className="size-3.5" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </header>

      <div className="flex-1 overflow-y-auto p-6">{children}</div>
    </div>
  );
}
