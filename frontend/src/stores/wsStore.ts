import { create } from 'zustand';

interface WSState {
  isConnected: boolean;
  setConnected: (connected: boolean) => void;
}

export const useWSStore = create<WSState>((set) => ({
  isConnected: false,
  setConnected: (connected) => set({ isConnected: connected }),
}));
