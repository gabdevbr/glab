import { create } from 'zustand';
import { api } from '@/lib/api';
import { AIGatewayConfig } from '@/lib/types';

interface AIConfigState {
  config: AIGatewayConfig | null;
  isLoading: boolean;
  isSaving: boolean;
  isTesting: boolean;

  fetchConfig: () => Promise<void>;
  saveConfig: (cfg: AIGatewayConfig) => Promise<void>;
  testConnection: (cfg: AIGatewayConfig) => Promise<{ status: string; message: string }>;
}

export const useAIConfigStore = create<AIConfigState>((set) => ({
  config: null,
  isLoading: false,
  isSaving: false,
  isTesting: false,

  fetchConfig: async () => {
    set({ isLoading: true });
    try {
      const cfg = await api.get<AIGatewayConfig>('/api/v1/admin/ai/config');
      set({ config: cfg });
    } finally {
      set({ isLoading: false });
    }
  },

  saveConfig: async (cfg) => {
    set({ isSaving: true });
    try {
      await api.put('/api/v1/admin/ai/config', cfg);
      set({ config: cfg });
    } finally {
      set({ isSaving: false });
    }
  },

  testConnection: async (cfg) => {
    set({ isTesting: true });
    try {
      return await api.post<{ status: string; message: string }>(
        '/api/v1/admin/ai/test',
        cfg,
      );
    } finally {
      set({ isTesting: false });
    }
  },
}));
