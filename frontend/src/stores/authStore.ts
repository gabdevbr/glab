import { create } from 'zustand';
import { api } from '@/lib/api';
import { User, LoginResponse } from '@/lib/types';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  loadFromStorage: () => Promise<void>;
  updateUser: (updated: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoading: true,
  login: async (username, password) => {
    const data = await api.post<LoginResponse>('/api/v1/auth/login', {
      username,
      password,
    });
    api.setToken(data.token);
    localStorage.setItem('glab_token', data.token);
    set({ user: data.user, token: data.token });
  },
  logout: () => {
    api.setToken(null);
    localStorage.removeItem('glab_token');
    set({ user: null, token: null });
  },
  updateUser: (updated) => {
    set((state) => ({
      user: state.user ? { ...state.user, ...updated } : null,
    }));
  },
  loadFromStorage: async () => {
    const token = localStorage.getItem('glab_token');
    if (!token) {
      set({ isLoading: false });
      return;
    }
    api.setToken(token);
    try {
      const user = await api.get<User>('/api/v1/auth/me');
      set({ user, token, isLoading: false });
    } catch {
      localStorage.removeItem('glab_token');
      api.setToken(null);
      set({ isLoading: false });
    }
  },
}));
