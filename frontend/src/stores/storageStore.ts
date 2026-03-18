import { create } from 'zustand';
import { api } from '@/lib/api';
import { StorageConfig, StorageMigrationProgress } from '@/lib/types';

interface StorageState {
  config: StorageConfig | null;
  migration: StorageMigrationProgress | null;
  isLoading: boolean;
  isSaving: boolean;
  isTesting: boolean;
  isDeleting: boolean;

  fetchConfig: () => Promise<void>;
  saveConfig: (cfg: StorageConfig) => Promise<void>;
  testConnection: (cfg: StorageConfig) => Promise<{ status: string; message: string }>;
  fetchMigrationStatus: () => Promise<void>;
  startMigration: (source: string, dest: string) => Promise<void>;
  cancelMigration: () => Promise<void>;
  updateMigrationProgress: (progress: StorageMigrationProgress) => void;
  deleteAllFiles: () => Promise<{ deleted: number }>;
}

export const useStorageStore = create<StorageState>((set) => ({
  config: null,
  migration: null,
  isLoading: false,
  isSaving: false,
  isTesting: false,
  isDeleting: false,

  fetchConfig: async () => {
    set({ isLoading: true });
    try {
      const cfg = await api.get<StorageConfig>('/api/v1/admin/storage/config');
      set({ config: cfg });
    } finally {
      set({ isLoading: false });
    }
  },

  saveConfig: async (cfg) => {
    set({ isSaving: true });
    try {
      await api.put('/api/v1/admin/storage/config', cfg);
      set({ config: cfg });
    } finally {
      set({ isSaving: false });
    }
  },

  testConnection: async (cfg) => {
    set({ isTesting: true });
    try {
      return await api.post<{ status: string; message: string }>(
        '/api/v1/admin/storage/test',
        cfg,
      );
    } finally {
      set({ isTesting: false });
    }
  },

  fetchMigrationStatus: async () => {
    const data = await api.get<StorageMigrationProgress & { file_counts?: Record<string, number> }>(
      '/api/v1/admin/storage/migrate/status',
    );
    set({ migration: data });
  },

  startMigration: async (source, dest) => {
    await api.post('/api/v1/admin/storage/migrate', { source, dest });
  },

  cancelMigration: async () => {
    await api.post('/api/v1/admin/storage/migrate/cancel');
  },

  updateMigrationProgress: (progress) => {
    set({ migration: progress });
  },

  deleteAllFiles: async () => {
    set({ isDeleting: true });
    try {
      const res = await api.delete<{ deleted: number }>('/api/v1/admin/storage/files');
      return res;
    } finally {
      set({ isDeleting: false });
    }
  },
}));
