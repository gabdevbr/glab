'use client';

import { useEffect } from 'react';
import { useThemeStore, THEMES } from '@/stores/themeStore';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    const meta = THEMES.find((t) => t.id === theme);

    root.setAttribute('data-theme', theme);

    if (meta?.isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Update theme-color meta tag for browser/PWA chrome
    const THEME_BG: Record<string, string> = {
      'dark-geo': '#1a2332',
      'light-geo': '#f8fcfc',
      'dark': '#252525',
      'classic-dark': '#1e1e44',
      'light': '#fdfdf9',
      'dracula': '#282a36',
    };
    const color = THEME_BG[theme] || '#1a2332';
    const metaTag = document.querySelector('meta[name="theme-color"]');
    if (metaTag) metaTag.setAttribute('content', color);
  }, [theme]);

  return <>{children}</>;
}
