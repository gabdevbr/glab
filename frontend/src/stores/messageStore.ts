import { create } from 'zustand';
import { api } from '@/lib/api';
import { Message } from '@/lib/types';

interface MessageState {
  messages: Record<string, Message[]>;
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
}

export const useMessageStore = create<MessageState>((set) => ({
  messages: {},
  isLoading: false,
  fetchMessages: async (channelId, limit = 50, offset = 0) => {
    set({ isLoading: true });
    try {
      const msgs = await api.get<Message[]>(
        `/api/v1/channels/${channelId}/messages?limit=${limit}&offset=${offset}`,
      );
      // API returns newest first, reverse so oldest is first in our array
      const reversed = [...msgs].reverse();
      set((s) => ({
        messages: { ...s.messages, [channelId]: reversed },
        isLoading: false,
      }));
    } catch {
      set({ isLoading: false });
    }
  },
  addMessage: (channelId, message) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [channelId]: [...(s.messages[channelId] || []), message],
      },
    })),
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
}));
