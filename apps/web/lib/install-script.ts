/** Arquivo sem 'use client': o layout raiz (servidor) precisa da string em si, não de uma referência de cliente. */
export const INSTALL_EVENT = 'ergatis-install';
const EVENT = INSTALL_EVENT;

/**
 * Vai no <head>: o `beforeinstallprompt` pode disparar antes de o React montar a
 * página de configurações. Guardamos o evento para o botão "Instalar" usar depois
 * (e no lugar da faixa automática do Chrome, que aparece em hora ruim).
 */
export const installScript = `(() => {
  addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); window.__ergatisInstall = e; dispatchEvent(new Event('${EVENT}')); });
  addEventListener('appinstalled', function () { window.__ergatisInstall = null; window.__ergatisInstalled = true; dispatchEvent(new Event('${EVENT}')); });
})()`;

