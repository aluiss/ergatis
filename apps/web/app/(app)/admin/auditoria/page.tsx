'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Empty, ErrorState, Loading } from '@/components/app-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';

interface Person { id: string; name: string; email: string }
interface Item {
  id: string; action: string; targetType: string; targetId: string | null;
  metadata: Record<string, unknown> | null; createdAt: string;
  actor: Person | null; targetUser: Person | null;
}
interface Result { items: Item[]; total: number; pageSize: number }

const LABELS: Record<string, string> = {
  'user.created': 'Conta criada',
  'user.made_admin_cli': 'Promovido a admin (CLI)',
  'user.made_admin_seed': 'Promovido a admin (seed)',
  'auth.signed_in': 'Login',
  'auth.signed_out': 'Logout',
  'auth.sign_in_failed': 'Login recusado',
  'auth.sign_up_failed': 'Cadastro recusado',
  'auth.email_verified': 'E-mail confirmado',
  'auth.password_reset_requested': 'Pediu redefinição de senha',
  'auth.password_reset': 'Senha redefinida',
  'auth.password_reset_failed': 'Redefinição de senha recusada',
  'auth.impersonation_started': 'Acesso como outro usuário',
  'email.sent': 'E-mail enviado',
  'email.not_sent': 'E-mail não enviado (sem SMTP)',
  'email.failed': 'Falha no envio de e-mail',
  'profile.updated': 'Perfil atualizado',
  'account.data_exported': 'Dados exportados',
  'account.deleted': 'Conta excluída',
  'professional.profile_updated': 'Perfil profissional atualizado',
  'professional.verification_requested': 'Pediu verificação',
  'service_request.created': 'Pedido criado',
  'service_request.cancelled': 'Pedido cancelado',
  'proposal.created': 'Proposta enviada',
  'proposal.withdrawn': 'Proposta retirada',
  'proposal.accepted': 'Proposta aceita',
  'proposal.rejected': 'Proposta recusada',
  'engagement.completed': 'Serviço concluído',
  'engagement.cancelled': 'Serviço cancelado',
  'review.created': 'Avaliação enviada',
  'message.sent': 'Mensagem enviada',
  'report.created': 'Denúncia enviada',
  'file.uploaded': 'Arquivo enviado',
  'file.removed': 'Arquivo removido',
  'document.viewed': 'Documento consultado',
  'subscription.requested': 'Assinatura solicitada',
  'subscription.cancelled': 'Assinatura cancelada',
  'billing.event_processed': 'Evento de cobrança',
  'user.banned': 'Usuário banido',
  'user.unbanned': 'Banimento removido',
  'user.role_changed': 'Papel alterado',
  'grant.created': 'Cortesia concedida',
  'grant.revoked': 'Cortesia revogada',
  'plan.updated': 'Plano alterado',
  'report.updated': 'Denúncia tratada',
  'verification.approved': 'Verificação aprovada',
  'verification.rejected': 'Verificação recusada',
};

const FILTERS = [
  ['', 'Tudo'], ['auth.', 'Acesso'], ['user.', 'Contas e papéis'], ['email.', 'E-mails'],
  ['account.', 'Dados pessoais'], ['subscription.', 'Assinaturas'], ['billing.', 'Cobrança'],
  ['grant.', 'Cortesias'], ['document.', 'Documentos'],
] as const;

const who = (p: Person | null, fallback: string) => (p ? `${p.name} (${p.email})` : fallback);

export default function AdminAudit() {
  const [action, setAction] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ['admin-audit', action, q, page],
    queryFn: () => api<Result>(`/admin/audit-logs?${new URLSearchParams({ action, q, page: String(page) })}`),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(([value, label]) => (
          <Button key={value} size="sm" variant={action === value ? 'default' : 'outline'} onClick={() => { setAction(value); setPage(1); }}>
            {label}
          </Button>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); setPage(1); setQ(String(new FormData(e.currentTarget).get('q'))); }} className="flex max-w-md gap-2">
        <Input name="q" placeholder="Nome ou e-mail de quem fez ou de quem sofreu" aria-label="Buscar na auditoria" />
        <Button>Buscar</Button>
      </form>

      {list.isPending ? <Loading /> : list.error ? <ErrorState error={list.error} /> : list.data.items.length === 0 ? <Empty>Nenhum registro.</Empty> : (
        <>
          <ul className="divide-y rounded-lg border text-sm">
            {list.data.items.map((l) => {
              const details = Object.entries(l.metadata ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== '');
              return (
                <li key={l.id} className="space-y-1 p-3">
                  <div className="flex justify-between gap-3">
                    <span>
                      <b>{LABELS[l.action] ?? l.action}</b>
                      <span className="text-muted-foreground ml-2 font-mono text-xs">{l.action}</span>
                    </span>
                    <time className="text-muted-foreground shrink-0">{new Date(l.createdAt).toLocaleString('pt-BR')}</time>
                  </div>
                  <div className="text-muted-foreground">
                    Por: {l.actor ? <Link className="hover:text-primary underline-offset-2 hover:underline" href={`/admin/usuarios/${l.actor.id}`}>{who(l.actor, '')}</Link> : 'sistema / anônimo'}
                    {' · '}Alvo: {l.targetUser
                      ? <Link className="hover:text-primary underline-offset-2 hover:underline" href={`/admin/usuarios/${l.targetUser.id}`}>{who(l.targetUser, '')}</Link>
                      : `${l.targetType}${l.targetId ? ` ${l.targetId}` : ''}`}
                  </div>
                  {details.length > 0 && (
                    <dl className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                      {details.map(([k, v]) => (
                        <div key={k} className="flex gap-1"><dt className="font-medium">{k}:</dt><dd className="break-all">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd></div>
                      ))}
                    </dl>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex items-center gap-3 text-sm">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</Button>
            <span>Página {page} de {Math.max(1, Math.ceil(list.data.total / list.data.pageSize))}</span>
            <Button size="sm" variant="outline" disabled={page * list.data.pageSize >= list.data.total} onClick={() => setPage(page + 1)}>Próxima</Button>
          </div>
        </>
      )}
    </div>
  );
}
