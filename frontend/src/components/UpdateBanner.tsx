'use client';

import { useWSStore } from '@/stores/wsStore';
import { RefreshCw } from 'lucide-react';

export function UpdateBanner() {
  const newVersionAvailable = useWSStore((s) => s.newVersionAvailable);
  const dismissUpdate = useWSStore((s) => s.dismissUpdate);

  if (!newVersionAvailable) return null;

  return (
    <div className="flex items-center justify-center gap-3 bg-accent px-4 py-1.5 text-sm text-accent-foreground">
      <RefreshCw className="h-3.5 w-3.5" />
      <span>A new version is available.</span>
      <button
        onClick={() => window.location.reload()}
        className="font-medium underline underline-offset-2 hover:opacity-80"
      >
        Refresh
      </button>
      <button
        onClick={dismissUpdate}
        className="ml-1 text-accent-foreground/60 hover:text-accent-foreground"
      >
        Later
      </button>
    </div>
  );
}
