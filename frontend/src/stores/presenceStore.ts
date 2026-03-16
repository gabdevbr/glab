import { create } from 'zustand';

interface PresenceState {
  statuses: Record<string, string>;
  typing: Record<string, string[]>;
  _typingTimers: Record<string, ReturnType<typeof setTimeout>>;
  setStatus: (userId: string, status: string) => void;
  bulkSetStatus: (statuses: Record<string, string>) => void;
  setTyping: (channelId: string, userId: string, isTyping: boolean) => void;
  clearTyping: (channelId: string, userId: string) => void;
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  statuses: {},
  typing: {},
  _typingTimers: {},
  setStatus: (userId, status) =>
    set((s) => ({
      statuses: { ...s.statuses, [userId]: status },
    })),
  bulkSetStatus: (statuses) =>
    set((s) => ({
      statuses: { ...s.statuses, ...statuses },
    })),
  setTyping: (channelId, userId, isTyping) => {
    const state = get();
    const timerKey = `${channelId}:${userId}`;

    // Clear existing timer for this user/channel
    if (state._typingTimers[timerKey]) {
      clearTimeout(state._typingTimers[timerKey]);
    }

    if (isTyping) {
      // Add user to typing list if not already there
      const current = state.typing[channelId] || [];
      if (!current.includes(userId)) {
        set((s) => ({
          typing: {
            ...s.typing,
            [channelId]: [...(s.typing[channelId] || []), userId],
          },
        }));
      }

      // Auto-expire typing after 6 seconds
      const timer = setTimeout(() => {
        get().clearTyping(channelId, userId);
      }, 6000);

      set((s) => ({
        _typingTimers: { ...s._typingTimers, [timerKey]: timer },
      }));
    } else {
      get().clearTyping(channelId, userId);
    }
  },
  clearTyping: (channelId, userId) => {
    const state = get();
    const timerKey = `${channelId}:${userId}`;

    if (state._typingTimers[timerKey]) {
      clearTimeout(state._typingTimers[timerKey]);
    }

    set((s) => ({
      typing: {
        ...s.typing,
        [channelId]: (s.typing[channelId] || []).filter(
          (id) => id !== userId,
        ),
      },
      _typingTimers: Object.fromEntries(
        Object.entries(s._typingTimers).filter(([k]) => k !== timerKey),
      ),
    }));
  },
}));
