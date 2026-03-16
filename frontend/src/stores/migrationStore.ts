import { create } from 'zustand';
import { api } from '@/lib/api';
import { MigrationJob, MigrationLog, MigrationProgress, MigrationRoomState } from '@/lib/types';

interface MigrationState {
  job: MigrationJob | null;
  isRunning: boolean;
  logs: MigrationLog[];
  rooms: MigrationRoomState[];
  isLoading: boolean;
  error: string | null;

  // REST actions
  fetchStatus: () => Promise<void>;
  fetchLogs: (jobId: string, after?: number) => Promise<void>;
  fetchRooms: () => Promise<void>;
  startMigration: (config: {
    rc_url: string;
    rc_token: string;
    rc_user_id: string;
    migrate_files: boolean;
  }) => Promise<string>;
  cancelMigration: () => Promise<void>;

  // WS handlers
  addLog: (log: MigrationLog) => void;
  updateStatus: (status: string, phase: string, progress: MigrationProgress | null) => void;
  updateProgress: (progress: MigrationProgress) => void;
}

export const useMigrationStore = create<MigrationState>((set, get) => ({
  job: null,
  isRunning: false,
  logs: [],
  rooms: [],
  isLoading: false,
  error: null,

  fetchStatus: async () => {
    try {
      const data = await api.get<{ job: MigrationJob | null; is_running: boolean }>(
        '/api/v1/admin/migration/status',
      );
      set({ job: data.job, isRunning: data.is_running });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  fetchLogs: async (jobId: string, after = 0) => {
    try {
      const data = await api.get<{ logs: MigrationLog[]; total: number }>(
        `/api/v1/admin/migration/logs?job_id=${jobId}&after=${after}&limit=1000`,
      );
      if (after === 0) {
        set({ logs: data.logs });
      } else {
        set((state) => ({ logs: [...state.logs, ...data.logs] }));
      }
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  fetchRooms: async () => {
    try {
      const data = await api.get<{ rooms: MigrationRoomState[] }>(
        '/api/v1/admin/migration/rooms',
      );
      set({ rooms: data.rooms });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  startMigration: async (config) => {
    set({ isLoading: true, error: null });
    try {
      const data = await api.post<{ job_id: string }>(
        '/api/v1/admin/migration/start',
        config,
      );
      set({ isLoading: false, isRunning: true });
      // Refresh status to get the full job object
      get().fetchStatus();
      return data.job_id;
    } catch (err) {
      set({ isLoading: false, error: (err as Error).message });
      throw err;
    }
  },

  cancelMigration: async () => {
    try {
      await api.post('/api/v1/admin/migration/cancel');
      set({ isRunning: false });
      get().fetchStatus();
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  // WS handlers
  addLog: (log) => {
    set((state) => ({ logs: [...state.logs, log] }));
  },

  updateStatus: (status, phase, progress) => {
    set((state) => ({
      isRunning: status === 'running',
      job: state.job
        ? {
            ...state.job,
            status: status as MigrationJob['status'],
            phase,
            progress: progress ?? state.job.progress,
          }
        : state.job,
    }));
  },

  updateProgress: (progress) => {
    set((state) => ({
      job: state.job ? { ...state.job, progress } : state.job,
    }));
  },
}));
