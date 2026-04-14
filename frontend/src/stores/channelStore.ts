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
  hideAllChannels: () => Promise<void>;
  setActiveChannel: (id: string) => void;
  addChannel: (channel: Channel) => void;
  updateChannel: (channelOrId: string | Channel, partial?: Partial<Channel>) => void;
  removeChannel: (id: string) => void;
  incrementUnread: (channelId: string) => void;
  clearUnread: (channelId: string) => void;
  markAllRead: () => Promise<void>;
  pinChannel: (channelId: string, pinned: boolean) => Promise<void>;
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
      const counts: Record<string, number> = {};
      for (const c of channels) {
        if (c.unread_count && c.unread_count > 0) counts[c.id] = c.unread_count;
      }
      set({ channels, unreadCounts: counts, isLoading: false });
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
  hideAllChannels: async () => {
    try {
      await api.hideAllChannels();
      set((s) => ({
        channels: [],
        hiddenChannels: [...s.hiddenChannels, ...s.channels],
        unreadCounts: {},
      }));
    } catch {
      // ignore
    }
  },
  setActiveChannel: (id) => set({ activeChannelId: id }),
  addChannel: (channel) =>
    set((s) => ({ channels: [...s.channels, channel] })),
  updateChannel: (channelOrId, partial) => {
    if (typeof channelOrId === 'string') {
      set((s) => ({
        channels: s.channels.map((c) =>
          c.id === channelOrId ? { ...c, ...partial } : c,
        ),
      }));
    } else {
      // Full channel object passed — replace by id
      const updated = channelOrId;
      set((s) => ({
        channels: s.channels.map((c) =>
          c.id === updated.id ? { ...c, ...updated } : c,
        ),
      }));
    }
  },
  removeChannel: (id) =>
    set((s) => ({
      channels: s.channels.filter((c) => c.id !== id),
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
  markAllRead: async () => {
    try {
      await api.markAllRead();
      set({ unreadCounts: {} });
    } catch {
      // ignore
    }
  },
  pinChannel: async (channelId, pinned) => {
    try {
      await api.pinChannel(channelId, pinned);
      set((s) => ({
        channels: s.channels.map((c) =>
          c.id === channelId ? { ...c, is_pinned: pinned } : c,
        ),
      }));
    } catch {
      // ignore
    }
  },
}));
