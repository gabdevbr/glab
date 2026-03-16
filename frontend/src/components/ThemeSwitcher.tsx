'use client';

import { useThemeStore, THEMES, ThemeId } from '@/stores/themeStore';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Palette, Check } from 'lucide-react';

export function ThemeSwitcher() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-md p-1 text-sidebar-section-text hover:text-sidebar-item-text"
        title="Change theme"
      >
        <Palette className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="min-w-[180px]">
        {THEMES.map((t) => (
          <DropdownMenuItem
            key={t.id}
            onClick={() => setTheme(t.id as ThemeId)}
            className="flex items-center gap-2"
          >
            <span
              className="inline-block size-3 shrink-0 rounded-full border border-border"
              style={{ backgroundColor: t.accent }}
            />
            <span className="flex-1">{t.label}</span>
            {theme === t.id && <Check className="size-3.5 text-accent-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
