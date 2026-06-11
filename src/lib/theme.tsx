'use client';
// src/lib/theme.tsx — ThemeProvider + useTheme hook

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type Theme = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

interface ThemeCtx {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeCtx>({
  theme: 'system',
  resolvedTheme: 'dark',
  toggle: () => {},
});

export const useTheme = () => useContext(ThemeContext);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(t: Theme): ResolvedTheme {
  const resolved = t === 'system' ? getSystemTheme() : t;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  return resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('dark');

  useEffect(() => {
    const saved = (localStorage.getItem('psm-theme') as Theme | null) ?? 'system';
    setThemeState(saved);
    setResolvedTheme(applyTheme(saved));

    // Ascolta cambiamenti del tema di sistema
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      setThemeState((prev) => {
        if (prev === 'system') setResolvedTheme(applyTheme('system'));
        return prev;
      });
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Ciclo: light → dark → system → light → ...
  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const cycle: Theme[] = ['light', 'dark', 'system'];
      const next = cycle[(cycle.indexOf(prev) + 1) % cycle.length];
      localStorage.setItem('psm-theme', next);
      setResolvedTheme(applyTheme(next));
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

