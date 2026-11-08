export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_KEY = 'ergatis-theme';
/** Cor da barra do sistema no celular, por tema efetivo. */
export const THEME_COLORS = { light: '#ffffff', dark: '#09090b' } as const;

/**
 * Roda no <head>, antes de pintar a página: aplica o tema salvo e evita o
 * "flash" de tela branca no modo escuro. Precisa ser autocontido (vira string).
 */
export const themeScript = `(() => {
  try {
    var t = localStorage.getItem('${THEME_KEY}') || 'system';
    var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {}
})()`;
