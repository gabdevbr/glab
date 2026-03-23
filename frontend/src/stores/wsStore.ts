import { create } from 'zustand';

interface WSState {
  isConnected: boolean;
  setConnected: (connected: boolean) => void;
  newVersionAvailable: boolean;
  setNewVersionAvailable: (available: boolean) => void;
  dismissUpdate: () => void;
}

export const useWSStore = create<WSState>((set) => ({
  isConnected: false,
  setConnected: (connected) => set({ isConnected: connected }),
  newVersionAvailable: false,
  setNewVersionAvailable: (available) => set({ newVersionAvailable: available }),
  dismissUpdate: () => set({ newVersionAvailable: false }),
}));
