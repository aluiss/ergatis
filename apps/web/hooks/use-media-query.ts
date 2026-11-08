'use client';

import { useSyncExternalStore } from 'react';

/** `true` quando a media query casa. No servidor (e no primeiro render), `false`: pensa primeiro no celular. */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Mesmo ponto de corte do layout: abaixo dele, barra inferior; acima, menu no topo. */
export const DESKTOP = '(min-width: 1024px)';
