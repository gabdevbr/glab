import { create } from 'zustand';
import { api } from '@/lib/api';
import { Message, Reaction } from '@/lib/types';

interface MessageState {
  messages: Record<string, Message[]>;
  newMessageIds: Set<string>;
  isLoading: boolean;
  fetchMessages: (
    channelId: string,
    limit?: number,
    offset?: number,
  ) => Promise<void>;
  addMessage: (channelId: string, message: Message) => void;
  updateMessage: (
    channelId: string,
    messageId: string,
    partial: Partial<Message>,
  ) => void;
  deleteMessage: (channelId: string, messageId: string) => void;
  prependMessages: (channelId: string, messages: Message[]) => void;
  addReaction: (
    channelId: string,
    messageId: string,
    reaction: Reaction,
  ) => void;
  removeReaction: (
    channelId: string,
    messageId: string,
    emoji: string,
    userId: string,
  ) => void;
  updateThreadSummary: (
    channelId: string,
    messageId: string,
    replyCount: number,
    lastReplyAt: string,
  ) => void;
  pinMessage: (channelId: string, messageId: string) => void;
  unpinMessage: (channelId: string, messageId: string) => void;
}

export const useMessageStore = create<MessageState>((set) => ({
  messages: {},
  newMessageIds: new Set(),
  isLoading: false,
  fetchMessages: async (channelId, limit = 50, offset = 0) => {
    set({ isLoading: true });
    try {
      const msgs = await api.get<Message[]>(
        `/api/v1/channels/${channelId}/messages?limit=${limit}&offset=${offset}`,
      );
      // API returns newest first, reverse so oldest is first in our array
      const reversed = [...msgs].reverse();
      set((s) => {
        const existing = s.messages[channelId] || [];
        // If loading older messages (offset > 0), prepend to existing
        const merged =
          offset > 0 && existing.length > 0
            ? [...reversed.filter((m) => !existing.some((e) => e.id === m.id)), ...existing]
            : reversed;
        return {
          messages: { ...s.messages, [channelId]: merged },
          isLoading: false,
        };
      });
    } catch {
      set({ isLoading: false });
    }
  },
  addMessage: (channelId, message) => {
    set((s) => {
      const next = new Set(s.newMessageIds);
      next.add(message.id);
      return {
        messages: {
          ...s.messages,
          [channelId]: [...(s.messages[channelId] || []), message],
        },
        newMessageIds: next,
      };
    });
    // Clear the "new" flag after animation completes
    setTimeout(() => {
      set((s) => {
        const next = new Set(s.newMessageIds);
        next.delete(message.id);
        return { newMessageIds: next };
      });
    }, 1500);
  },
  updateMessage: (channelId, messageId, partial) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [channelId]: (s.messages[channelId] || []).map((m) =>
          m.id === messageId ? { ...m, ...partial } : m,
        ),
      },
    })),
  deleteMessage: (channelId, messageId) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [channelId]: (s.messages[channelId] || []).filter(
          (m) => m.id !== messageId,
        ),
      },
    })),
  prependMessages: (channelId, messages) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [channelId]: [...messages, ...(s.messages[channelId] || [])],
      },
    })),
  addReaction: (channelId, messageId, reaction) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [channelId]: (s.messages[channelId] || []).map((m) => {
          if (m.id !== messageId) return m;
          const existing = m.reactions || [];
          // Don't add duplicate
          if (existing.some((r) => r.emoji === reaction.emoji && r.user_id === reaction.user_id)) {
            return m;
          }
          return { ...m, reactions: [...existing, reaction] };
        }),
      },
    })),
  removeReaction: (channelId, messageId, emoji, userId) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [channelId]: (s.messages[channelId] || []).map((m) => {
          if (m.id !== messageId) return m;
          return {
            ...m,
            reactions: (m.reactions || []).filter(
              (r) => !(r.emoji === emoji && r.user_id === userId),
            ),
          };
        }),
      },
    })),
  updateThreadSummary: (channelId, messageId, replyCount, lastReplyAt) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [channelId]: (s.messages[channelId] || []).map((m) => {
          if (m.id !== messageId) return m;
          return {
            ...m,
            thread_summary: {
              message_id: messageId,
              reply_count: replyCount,
              last_reply_at: lastReplyAt,
            },
          };
        }),
      },
    })),
  pinMessage: (channelId, messageId) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [channelId]: (s.messages[channelId] || []).map((m) =>
          m.id === messageId ? { ...m, is_pinned: true } : m,
        ),
      },
    })),
  unpinMessage: (channelId, messageId) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [channelId]: (s.messages[channelId] || []).map((m) =>
          m.id === messageId ? { ...m, is_pinned: false } : m,
        ),
      },
    })),
}));
