'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { THEME_COLORS, THEME_KEY, THEMES, type Theme } from '@/lib/theme';

interface ThemeState { theme: Theme; resolved: 'light' | 'dark'; setTheme: (t: Theme) => void }

const ThemeContext = createContext<ThemeState | null>(null);
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

function read(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return (THEMES as readonly string[]).includes(saved ?? '') ? (saved as Theme) : 'system';
  } catch { return 'system'; }
}

function apply(theme: Theme): 'light' | 'dark' {
  const resolved = theme === 'dark' || (theme === 'system' && media().matches) ? 'dark' : 'light';
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
  // A barra do sistema acompanha a escolha manual, não só a do aparelho.
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', THEME_COLORS[resolved]));
  return resolved;
}

/** Tema por aparelho (localStorage): o celular pode ficar escuro e o computador, claro. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const initial = read();
    setThemeState(initial);
    setResolved(apply(initial));
  }, []);

  // Em "sistema", acompanha a troca do aparelho (ex.: modo escuro automático à noite).
  useEffect(() => {
    if (theme !== 'system') return;
    const list = media();
    const onChange = () => setResolved(apply('system'));
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    try { localStorage.setItem(THEME_KEY, next); } catch { /* modo privado: vale só nesta visita */ }
    setThemeState(next);
    setResolved(apply(next));
  }, []);

  return <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme fora do ThemeProvider');
  return ctx;
}
