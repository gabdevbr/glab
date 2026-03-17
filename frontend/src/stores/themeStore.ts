import { create } from 'zustand';

export type ThemeId = 'dark' | 'classic-dark' | 'light' | 'dracula';

export interface ThemeOption {
  id: ThemeId;
  label: string;
  isDark: boolean;
  accent: string; // CSS color for preview swatch
}

export const THEMES: ThemeOption[] = [
  { id: 'dark', label: 'Dark', isDark: true, accent: '#06F4E4' },
  { id: 'classic-dark', label: 'Classic Dark', isDark: true, accent: '#818cf8' },
  { id: 'light', label: 'Light', isDark: false, accent: '#0d9488' },
  { id: 'dracula', label: 'Dracula', isDark: true, accent: '#bd93f9' },
];

const STORAGE_KEY = 'glab_theme';
const DEFAULT_THEME: ThemeId = 'dark';

function getInitialTheme(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && THEMES.some((t) => t.id === stored)) return stored as ThemeId;
  return DEFAULT_THEME;
}

interface ThemeState {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getInitialTheme(),
  setTheme: (theme) => {
    localStorage.setItem(STORAGE_KEY, theme);
    set({ theme });
  },
}));
