import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AuditChange } from '@ergatis/shared';

/**
 * Contexto da requisição em curso, propagado por AsyncLocalStorage.
 *
 * É o que deixa qualquer `recordAudit` — num service, num hook do Better Auth ou
 * no envio de e-mail — saber IP, navegador, rota e autor sem receber o `Request`.
 * O `requestId` liga as linhas que uma mesma requisição gerou (ex.: cadastro,
 * e-mail de confirmação e aceite dos termos).
 */
export interface AuditContext {
  requestId: string;
  ip: string | null;
  userAgent: string | null;
  method: string | null;
  route: string | null;
  /** Preenchido pelo interceptor: o middleware roda antes da autenticação. */
  actorId: string | null;
  actorRole: string | null;
  /** O que o service quer acrescentar à linha que o @Audit da rota vai gravar. */
  annotation: AuditAnnotation;
  /** Nada dentro deste escopo é auditado (expurgo, cargas em lote). */
  suppressed: boolean;
}

export interface AuditAnnotation {
  summary?: string;
  changes?: AuditChange[];
  targetId?: string;
  metadata?: Record<string, unknown>;
}

const storage = new AsyncLocalStorage<AuditContext>();

export const getAuditContext = () => storage.getStore();

/**
 * Abre o contexto. Fica no Express, antes de tudo, para cobrir também as rotas
 * do Better Auth, que não passam pelos controllers do Nest. `req.ip` já respeita
 * o `trust proxy`, por isso é ele, e não o cabeçalho cru, que vai para a trilha.
 */
export function auditContextMiddleware(req: Request, _res: Response, next: NextFunction) {
  const context: AuditContext = {
    requestId: randomUUID(),
    ip: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 300) ?? null,
    method: req.method ?? null,
    route: req.originalUrl?.split('?')[0]?.slice(0, 200) ?? null,
    actorId: null,
    actorRole: null,
    annotation: {},
    suppressed: false,
  };
  storage.run(context, () => next());
}

/**
 * Detalha a linha que a rota vai gravar: um resumo legível, os campos alterados,
 * o alvo quando o resultado não o traz. Não grava nada sozinho.
 */
export function annotateAudit(annotation: AuditAnnotation) {
  const context = storage.getStore();
  if (!context) return;
  context.annotation = {
    ...context.annotation,
    ...annotation,
    metadata: { ...context.annotation.metadata, ...annotation.metadata },
  };
}

/** Executa `fn` sem gravar auditoria (jobs que reescrevem volume, o próprio expurgo). */
export function runWithoutAudit<T>(fn: () => T): T {
  const current = storage.getStore();
  const context: AuditContext = current
    ? { ...current, suppressed: true }
    : {
        requestId: 'sistema', ip: null, userAgent: null, method: null, route: null,
        actorId: null, actorRole: null, annotation: {}, suppressed: true,
      };
  return storage.run(context, fn);
}
