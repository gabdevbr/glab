import { create } from 'zustand';
import { api } from '@/lib/api';

export interface AdminStats {
  users: number;
  channels: number;
  messages: number;
  files: number;
  storage_bytes: number;
  online_count: number;
}

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  role: string;
  status: string;
  last_seen?: string;
  is_bot: boolean;
  is_deactivated: boolean;
  created_at: string;
}

export interface AdminChannel {
  id: string;
  name: string;
  slug: string;
  type: string;
  is_archived: boolean;
  created_at: string;
  member_count: number;
  message_count: number;
}

interface AdminState {
  stats: AdminStats | null;
  users: AdminUser[];
  channels: AdminChannel[];
  isLoading: boolean;

  fetchStats: () => Promise<void>;
  fetchUsers: (search?: string) => Promise<void>;
  fetchChannels: () => Promise<void>;
  createUser: (data: {
    username: string;
    email: string;
    display_name: string;
    password: string;
    role: string;
  }) => Promise<void>;
  updateUser: (id: string, data: { display_name?: string; email?: string }) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  changeRole: (id: string, role: string) => Promise<void>;
  resetPassword: (id: string, password: string) => Promise<void>;
}

export const useAdminStore = create<AdminState>((set) => ({
  stats: null,
  users: [],
  channels: [],
  isLoading: false,

  fetchStats: async () => {
    try {
      const stats = await api.get<AdminStats>('/api/v1/admin/stats');
      set({ stats });
    } catch {
      // ignore
    }
  },

  fetchUsers: async (search = '') => {
    set({ isLoading: true });
    try {
      const q = search ? `?q=${encodeURIComponent(search)}&limit=200` : '?limit=200';
      const users = await api.get<AdminUser[]>(`/api/v1/admin/users${q}`);
      set({ users, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  fetchChannels: async () => {
    set({ isLoading: true });
    try {
      const channels = await api.get<AdminChannel[]>('/api/v1/admin/channels');
      set({ channels, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  createUser: async (data) => {
    await api.post('/api/v1/admin/users', data);
  },

  updateUser: async (id, data) => {
    await api.patch(`/api/v1/users/${id}`, data);
  },

  deleteUser: async (id) => {
    await api.delete(`/api/v1/admin/users/${id}`);
  },

  changeRole: async (id, role) => {
    await api.patch(`/api/v1/admin/users/${id}/role`, { role });
  },

  resetPassword: async (id, password) => {
    await api.post(`/api/v1/admin/users/${id}/reset-password`, { password });
  },
}));
