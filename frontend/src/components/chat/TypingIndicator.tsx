'use client';

import { usePresenceStore } from '@/stores/presenceStore';
import { useAuthStore } from '@/stores/authStore';

interface TypingIndicatorProps {
  channelId: string;
}

const EMPTY_IDS: string[] = [];

export function TypingIndicator({ channelId }: TypingIndicatorProps) {
  const typingUserIds = usePresenceStore((s) => s.typing[channelId] ?? EMPTY_IDS);
  const currentUserId = useAuthStore((s) => s.user?.id);

  // Filter out current user
  const others = typingUserIds.filter((id) => id !== currentUserId);

  let text = '';
  if (others.length === 1) {
    text = 'Alguém está digitando';
  } else if (others.length === 2) {
    text = '2 pessoas estão digitando';
  } else if (others.length > 2) {
    text = `${others.length} pessoas estão digitando`;
  }

  return (
    <div className="h-6 px-5">
      {text && (
        <p className="text-xs text-muted-foreground">
          {text}
          <span className="ml-0.5 inline-flex w-5">
            <span className="typing-dots" />
          </span>
        </p>
      )}
    </div>
  );
}
