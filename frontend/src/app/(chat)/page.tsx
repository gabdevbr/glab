'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useChannelStore } from '@/stores/channelStore';

export default function ChatHome() {
  const router = useRouter();
  const channels = useChannelStore((s) => s.channels);
  const isLoading = useChannelStore((s) => s.isLoading);

  // Redirect to first available channel
  useEffect(() => {
    if (!isLoading && channels.length > 0) {
      const firstNonDm = channels.find((c) => c.type !== 'dm');
      const target = firstNonDm || channels[0];
      router.replace(`/channel/${target.id}`);
    }
  }, [channels, isLoading, router]);

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">Welcome to Glab</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {isLoading
            ? 'Loading channels...'
            : channels.length > 0
              ? 'Redirecting...'
              : 'No channels yet. Create one from the sidebar to get started.'}
        </p>
      </div>
    </div>
  );
}
