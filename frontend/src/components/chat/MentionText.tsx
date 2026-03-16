'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

interface MentionTextProps {
  content: string;
  /** Known usernames for validating @username mentions */
  knownUsernames?: Set<string>;
}

const GROUP_KEYWORDS = new Set(['all', 'here', 'channel']);

/**
 * Parses message text and renders @mentions as styled, clickable pills.
 * - @all/@here/@channel → accent pill (not clickable)
 * - @username → accent pill, click opens DM
 */
export function MentionText({ content, knownUsernames }: MentionTextProps) {
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.user);

  const handleUserClick = async (username: string) => {
    if (!currentUser || username === currentUser.username) return;
    try {
      // Create or get existing DM channel
      const channel = await api.post<{ id: string }>('/api/v1/channels', {
        name: `dm-${username}`,
        type: 'dm',
        member_username: username,
      });
      router.push(`/channel/${channel.id}`);
    } catch {
      // DM creation failed silently — user may not exist or endpoint not ready
    }
  };

  const parts = parseMentions(content, knownUsernames);

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'text') {
          return <React.Fragment key={i}>{part.value}</React.Fragment>;
        }

        const isGroup = GROUP_KEYWORDS.has(part.value);

        return (
          <span
            key={i}
            onClick={isGroup ? undefined : () => handleUserClick(part.value)}
            className={cn(
              'inline-flex items-center bg-accent-primary-subtle text-accent-primary-subtle-text',
              'rounded px-0.5 font-medium text-[0.9em] transition-colors',
              isGroup
                ? 'cursor-default'
                : 'cursor-pointer hover:brightness-110',
            )}
          >
            @{part.value}
          </span>
        );
      })}
    </>
  );
}

interface TextPart {
  type: 'text' | 'mention';
  value: string;
}

function parseMentions(content: string, knownUsernames?: Set<string>): TextPart[] {
  const parts: TextPart[] = [];
  // Match @word at word boundaries
  const regex = /(?:^|(?<=\s))@(\w+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const name = match[1];
    const isGroup = GROUP_KEYWORDS.has(name.toLowerCase());
    const isKnownUser = knownUsernames ? knownUsernames.has(name) : true;

    if (!isGroup && !isKnownUser) continue;

    // Text before this mention
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }

    parts.push({ type: 'mention', value: isGroup ? name.toLowerCase() : name });
    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < content.length) {
    parts.push({ type: 'text', value: content.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: 'text', value: content }];
}
