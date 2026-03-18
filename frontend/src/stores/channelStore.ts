import { create } from 'zustand';
import { api } from '@/lib/api';
import { Channel } from '@/lib/types';

interface ChannelState {
  channels: Channel[];
  hiddenChannels: Channel[];
  activeChannelId: string | null;
  isLoading: boolean;
  unreadCounts: Record<string, number>;
  fetchChannels: () => Promise<void>;
  fetchHiddenChannels: () => Promise<void>;
  hideChannel: (channelId: string) => Promise<void>;
  unhideChannel: (channelId: string) => Promise<void>;
  setActiveChannel: (id: string) => void;
  addChannel: (channel: Channel) => void;
  updateChannel: (id: string, partial: Partial<Channel>) => void;
  incrementUnread: (channelId: string) => void;
  clearUnread: (channelId: string) => void;
}

export const useChannelStore = create<ChannelState>((set, get) => ({
  channels: [],
  hiddenChannels: [],
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
  fetchHiddenChannels: async () => {
    try {
      const hiddenChannels = await api.listHiddenChannels<Channel[]>();
      set({ hiddenChannels });
    } catch {
      // ignore
    }
  },
  hideChannel: async (channelId) => {
    try {
      await api.hideChannel(channelId, true);
      const channel = get().channels.find((c) => c.id === channelId);
      set((s) => ({
        channels: s.channels.filter((c) => c.id !== channelId),
        hiddenChannels: channel ? [...s.hiddenChannels, channel] : s.hiddenChannels,
      }));
    } catch {
      // ignore
    }
  },
  unhideChannel: async (channelId) => {
    try {
      await api.hideChannel(channelId, false);
      const channel = get().hiddenChannels.find((c) => c.id === channelId);
      set((s) => ({
        hiddenChannels: s.hiddenChannels.filter((c) => c.id !== channelId),
        channels: channel ? [...s.channels, channel] : s.channels,
      }));
    } catch {
      // ignore
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
