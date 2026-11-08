'use client';

import { useSyncExternalStore } from 'react';

/** O evento que o Chrome/Edge/Samsung Internet disparam quando o site é instalável. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window { __ergatisInstall?: InstallPromptEvent | null; __ergatisInstalled?: boolean }
  interface Navigator { standalone?: boolean }
}

import { INSTALL_EVENT as EVENT } from './install-script';

export type Platform = 'ios' | 'android' | 'desktop' | 'unknown';

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  // iPadOS se apresenta como Mac; o toque denuncia.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

const subscribe = (onChange: () => void) => {
  const standalone = matchMedia('(display-mode: standalone)');
  addEventListener(EVENT, onChange);
  standalone.addEventListener('change', onChange);
  return () => { removeEventListener(EVENT, onChange); standalone.removeEventListener('change', onChange); };
};

const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true || !!window.__ergatisInstalled;

/** Estado da instalação. No servidor, tudo "desconhecido": a página decide depois de montar. */
export function useInstall() {
  const platform = useSyncExternalStore(subscribe, detectPlatform, () => 'unknown' as Platform);
  const installed = useSyncExternalStore(subscribe, isStandalone, () => false);
  const canPrompt = useSyncExternalStore(subscribe, () => !!window.__ergatisInstall, () => false);

  async function install() {
    const event = window.__ergatisInstall;
    if (!event) return 'unavailable' as const;
    await event.prompt();
    const { outcome } = await event.userChoice;
    // O evento só serve uma vez.
    window.__ergatisInstall = null;
    dispatchEvent(new Event(EVENT));
    return outcome;
  }

  return { platform, installed, canPrompt, install };
}
