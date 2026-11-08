'use client';

import { createContext, useContext } from 'react';
import { can, type AccessLevel, type AccessResource, type ResolvedAccess } from '@ergatis/shared';

const AccessContext = createContext<ResolvedAccess | null>(null);

/** Permissões da pessoa logada, vindas do servidor no layout. Servem para mostrar ou esconder; quem barra é a API. */
export function AccessProvider({ access, children }: { access: ResolvedAccess | null; children: React.ReactNode }) {
  return <AccessContext.Provider value={access}>{children}</AccessContext.Provider>;
}

export function useAccess() {
  const access = useContext(AccessContext);
  return {
    access,
    can: (resource: AccessResource, level: AccessLevel = 'view') => can(access, resource, level),
  };
}
