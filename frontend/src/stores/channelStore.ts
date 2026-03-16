import { create } from 'zustand';
import { api } from '@/lib/api';
import { Channel } from '@/lib/types';

interface ChannelState {
  channels: Channel[];
  activeChannelId: string | null;
  isLoading: boolean;
  unreadCounts: Record<string, number>;
  fetchChannels: () => Promise<void>;
  setActiveChannel: (id: string) => void;
  addChannel: (channel: Channel) => void;
  updateChannel: (id: string, partial: Partial<Channel>) => void;
  incrementUnread: (channelId: string) => void;
  clearUnread: (channelId: string) => void;
}

export const useChannelStore = create<ChannelState>((set) => ({
  channels: [],
  activeChannelId: null,
  isLoading: false,
  unreadCounts: {},
  fetchChannels: async () => {
    set({ isLoading: true });
    try {
      const channels = await api.get<Channel[]>('/api/v1/channels');
      set({ channels, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },
  setActiveChannel: (id) => set({ activeChannelId: id }),
  addChannel: (channel) =>
    set((s) => ({ channels: [...s.channels, channel] })),
  updateChannel: (id, partial) =>
    set((s) => ({
      channels: s.channels.map((c) =>
        c.id === id ? { ...c, ...partial } : c,
      ),
    })),
  incrementUnread: (channelId) =>
    set((s) => ({
      unreadCounts: {
        ...s.unreadCounts,
        [channelId]: (s.unreadCounts[channelId] || 0) + 1,
      },
    })),
  clearUnread: (channelId) =>
    set((s) => ({
      unreadCounts: { ...s.unreadCounts, [channelId]: 0 },
    })),
}));
