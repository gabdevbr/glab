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
  }, [theme]);

  return <>{children}</>;
}
