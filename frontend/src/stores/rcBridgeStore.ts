import { create } from 'zustand';
import { api } from '@/lib/api';

export interface RCBridgeConfig {
  enabled: boolean;
  url: string;
  login_mode: 'delegated' | 'local' | 'dual';
  sync_scope: 'all_user_rooms' | 'allowlist';
  max_concurrent_sessions: number;
  outbound_enabled: boolean;
}

export interface RCBridgeStatus {
  enabled: boolean;
  active_sessions: number;
}

interface RCBridgeState {
  config: RCBridgeConfig | null;
  status: RCBridgeStatus | null;
  isLoading: boolean;
  isSaving: boolean;

  fetchConfig: () => Promise<void>;
  fetchStatus: () => Promise<void>;
  saveConfig: (cfg: RCBridgeConfig) => Promise<void>;
}

const defaults: RCBridgeConfig = {
  enabled: false,
  url: 'https://chat.geovendas.com',
  login_mode: 'dual',
  sync_scope: 'all_user_rooms',
  max_concurrent_sessions: 500,
  outbound_enabled: true,
};

export const useRCBridgeStore = create<RCBridgeState>((set) => ({
  config: null,
  status: null,
  isLoading: false,
  isSaving: false,

  fetchConfig: async () => {
    set({ isLoading: true });
    try {
      const cfg = await api.get<RCBridgeConfig>('/api/v1/admin/rc-bridge/config');
      set({ config: cfg ?? defaults });
    } catch {
      set({ config: defaults });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchStatus: async () => {
    try {
      const status = await api.get<RCBridgeStatus>('/api/v1/admin/rc-bridge/status');
      set({ status });
    } catch {
      // non-fatal
    }
  },

  saveConfig: async (cfg) => {
    set({ isSaving: true });
    try {
      await api.put('/api/v1/admin/rc-bridge/config', cfg);
      set({ config: cfg });
    } finally {
      set({ isSaving: false });
    }
  },
}));
