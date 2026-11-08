'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import type { Theme } from '@/lib/theme';
import { cn } from '@/lib/utils';

const OPTIONS: { value: Theme; label: string; hint: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'Automático', hint: 'Segue o aparelho', icon: Monitor },
  { value: 'light', label: 'Claro', hint: 'Sempre claro', icon: Sun },
  { value: 'dark', label: 'Escuro', hint: 'Sempre escuro', icon: Moon },
];

export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  return (
    <fieldset>
      <legend className="sr-only">Tema</legend>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {OPTIONS.map(({ value, label, hint, icon: Icon }) => (
          <label
            key={value}
            className={cn(
              'has-focus-visible:ring-ring/50 flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 p-3 text-center transition-colors has-focus-visible:ring-[3px]',
              theme === value ? 'border-primary bg-primary/5' : 'hover:bg-muted border-transparent bg-muted/50',
            )}
          >
            <input type="radio" name="theme" value={value} checked={theme === value} onChange={() => setTheme(value)} className="sr-only" />
            <Icon className={cn('size-6', theme === value ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
            <span className="text-sm font-medium">{label}</span>
            <span className="text-muted-foreground hidden text-xs sm:block">{hint}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
