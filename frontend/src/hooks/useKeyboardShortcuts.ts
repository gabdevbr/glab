'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useChannelStore } from '@/stores/channelStore';
import { wsClient } from '@/lib/ws';

interface ShortcutActions {
  openQuickSwitcher: () => void;
}

/**
 * Global keyboard shortcuts matching Slack conventions.
 * Handles both Mac (⌘) and Windows/Linux (Ctrl) modifier keys.
 */
export function useKeyboardShortcuts(actions: ShortcutActions) {
  const router = useRouter();
  const channels = useChannelStore((s) => s.channels);
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const unreadCounts = useChannelStore((s) => s.unreadCounts);

  // Build ordered channel list (same order as sidebar: channels then DMs)
  const orderedChannels = useCallback(() => {
    const nonDm = channels.filter((c) => c.type !== 'dm');
    const dm = channels.filter((c) => c.type === 'dm');
    return [...nonDm, ...dm];
  }, [channels]);

  const navigateToChannel = useCallback(
    (channelId: string) => {
      setActiveChannel(channelId);
      router.push(`/channel/${channelId}`);
    },
    [setActiveChannel, router],
  );

  // Navigate to adjacent channel in sidebar
  const navigateRelative = useCallback(
    (direction: 'up' | 'down') => {
      const ordered = orderedChannels();
      if (ordered.length === 0) return;

      const currentIndex = ordered.findIndex((c) => c.id === activeChannelId);
      let nextIndex: number;

      if (currentIndex === -1) {
        nextIndex = 0;
      } else if (direction === 'up') {
        nextIndex = currentIndex > 0 ? currentIndex - 1 : ordered.length - 1;
      } else {
        nextIndex = currentIndex < ordered.length - 1 ? currentIndex + 1 : 0;
      }

      navigateToChannel(ordered[nextIndex].id);
    },
    [orderedChannels, activeChannelId, navigateToChannel],
  );

  // Navigate to next/prev unread channel
  const navigateUnread = useCallback(
    (direction: 'up' | 'down') => {
      const ordered = orderedChannels();
      const currentIndex = ordered.findIndex((c) => c.id === activeChannelId);

      const unreadChannels = ordered.filter(
        (c, i) => (unreadCounts[c.id] || 0) > 0 && i !== currentIndex,
      );
      if (unreadChannels.length === 0) return;

      if (direction === 'up') {
        // Find the nearest unread channel above current position
        const above = unreadChannels.filter(
          (c) => ordered.indexOf(c) < currentIndex,
        );
        const target = above.length > 0 ? above[above.length - 1] : unreadChannels[unreadChannels.length - 1];
        navigateToChannel(target.id);
      } else {
        // Find the nearest unread channel below current position
        const below = unreadChannels.filter(
          (c) => ordered.indexOf(c) > currentIndex,
        );
        const target = below.length > 0 ? below[0] : unreadChannels[0];
        navigateToChannel(target.id);
      }
    },
    [orderedChannels, activeChannelId, unreadCounts, navigateToChannel],
  );

  // Mark current channel as read
  const markChannelRead = useCallback(() => {
    if (!activeChannelId) return;
    // The channel page already handles clearing unreads, just send WS event
    const store = useChannelStore.getState();
    store.clearUnread(activeChannelId);
  }, [activeChannelId]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      const isAlt = e.altKey;
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // --- Quick Switcher: Ctrl/⌘ + K ---
      if (isMod && e.key === 'k') {
        e.preventDefault();
        actions.openQuickSwitcher();
        return;
      }

      // --- Quick Switcher alt: Ctrl/⌘ + T ---
      if (isMod && e.key === 't') {
        e.preventDefault();
        actions.openQuickSwitcher();
        return;
      }

      // Don't process navigation shortcuts when typing in inputs
      if (isInput) return;

      // --- Channel navigation: Alt + ↑/↓ ---
      if (isAlt && !e.shiftKey && e.key === 'ArrowUp') {
        e.preventDefault();
        navigateRelative('up');
        return;
      }
      if (isAlt && !e.shiftKey && e.key === 'ArrowDown') {
        e.preventDefault();
        navigateRelative('down');
        return;
      }

      // --- Unread navigation: Alt + Shift + ↑/↓ ---
      if (isAlt && e.shiftKey && e.key === 'ArrowUp') {
        e.preventDefault();
        navigateUnread('up');
        return;
      }
      if (isAlt && e.shiftKey && e.key === 'ArrowDown') {
        e.preventDefault();
        navigateUnread('down');
        return;
      }

      // --- Mark channel as read: Escape ---
      if (e.key === 'Escape') {
        markChannelRead();
        return;
      }

      // --- Mark all as read: Shift + Escape ---
      if (e.shiftKey && e.key === 'Escape') {
        e.preventDefault();
        const store = useChannelStore.getState();
        store.channels.forEach((c) => store.clearUnread(c.id));
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actions, navigateRelative, navigateUnread, markChannelRead]);
}
