import { inferAdditionalFields, twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields({ user: { termsVersion: { type: 'string', required: true } } }),
    // O redirecionamento para o segundo fator é feito pela tela de login, que conhece o destino (`next`).
    twoFactorClient(),
  ],
});

/** Só caminhos internos: evita usar o login para mandar alguém a outro site. */
export const safeNext = (next: string | null) => (next?.startsWith('/') && !next.startsWith('//') ? next : '/painel');
