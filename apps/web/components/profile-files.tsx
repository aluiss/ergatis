/* eslint-disable @next/next/no-img-element */
'use client';

import { MAX_PORTFOLIO_ITEMS, MAX_VERIFICATION_DOCUMENTS } from '@ergatis/shared';
import { useQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import { pendingFor, post, useAction } from '@/components/app-ui';
import { ConfirmAction } from '@/components/confirm-action';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, uploadFile } from '@/lib/api';

interface StoredFile { id: string; kind: string; mimeType: string; caption: string | null }

function FilePicker({ label, accept, disabled, loading, onPick }: { label: string; accept: string; disabled?: boolean; loading?: boolean; onPick: (f: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input} type="file" accept={accept} className="sr-only" aria-label={label} tabIndex={-1}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ''; }}
      />
      <Button type="button" variant="outline" size="sm" disabled={disabled} loading={loading} onClick={() => input.current?.click()}>{label}</Button>
    </>
  );
}

function useFiles() {
  const q = useQuery({ queryKey: ['files'], queryFn: () => api<StoredFile[]>('/files/mine') });
  const remove = useAction((id: string) => api(`/files/${id}`, { method: 'DELETE' }), { invalidate: ['files', 'me'], success: 'Arquivo removido.' });
  return { files: q.data ?? [], remove };
}

const IMAGE_TYPES = 'image/jpeg,image/png,image/webp';

export function AvatarCard({ fileId, name }: { fileId: string | null; name: string }) {
  const send = useAction((f: File) => uploadFile('avatar', f), { invalidate: ['files', 'me'], success: 'Foto atualizada.' });
  const { remove } = useFiles();
  return (
    <Card>
      <CardHeader><CardTitle>Foto</CardTitle></CardHeader>
      <CardContent className="flex items-center gap-4">
        <Avatar fileId={fileId} name={name} className="size-20" />
        <div className="flex flex-wrap gap-2">
          <FilePicker label={send.isPending ? 'Enviando...' : 'Trocar foto'} accept={IMAGE_TYPES} loading={send.isPending} onPick={(f) => send.mutate(f)} />
          {fileId && (
            <ConfirmAction title="Remover sua foto?" description="Seu perfil volta a mostrar as iniciais do seu nome." confirmLabel="Remover foto" destructive onConfirm={() => remove.mutateAsync(fileId)}>
              <Button size="sm" variant="ghost" loading={pendingFor(remove, (v) => v === fileId)}>Remover</Button>
            </ConfirmAction>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function PortfolioCard() {
  const { files, remove } = useFiles();
  const caption = useRef<HTMLInputElement>(null);
  const items = files.filter((f) => f.kind === 'portfolio');
  const send = useAction((f: File) => uploadFile('portfolio', f, caption.current?.value), {
    invalidate: ['files'], success: 'Imagem adicionada.', onDone: () => { if (caption.current) caption.current.value = ''; },
  });
  return (
    <Card>
      <CardHeader><CardTitle>Portfólio</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">Até {MAX_PORTFOLIO_ITEMS} imagens. Aparecem no seu perfil público nos planos Profissional e Premium.</p>
        {items.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {items.map((f) => (
              <li key={f.id} className="space-y-1">
                <img src={`/api/files/${f.id}`} alt={f.caption ?? 'Imagem do portfólio'} className="aspect-square w-full rounded-md object-cover" />
                {f.caption && <p className="text-muted-foreground truncate text-xs">{f.caption}</p>}
                <ConfirmAction title="Remover esta imagem do portfólio?" description="Ela some do seu perfil público. Não dá para recuperar." confirmLabel="Remover imagem" destructive onConfirm={() => remove.mutateAsync(f.id)}>
                  <Button size="sm" variant="ghost" loading={pendingFor(remove, (v) => v === f.id)}>Remover</Button>
                </ConfirmAction>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Input ref={caption} className="max-w-xs" maxLength={140} placeholder="Legenda (opcional)" aria-label="Legenda" />
          <FilePicker label={send.isPending ? 'Enviando...' : 'Adicionar imagem'} accept={IMAGE_TYPES} loading={send.isPending} disabled={items.length >= MAX_PORTFOLIO_ITEMS} onPick={(f) => send.mutate(f)} />
        </div>
      </CardContent>
    </Card>
  );
}

const VERIFICATION: Record<string, string> = { none: 'Não solicitada', pending: 'Em análise', approved: 'Verificado', rejected: 'Recusada' };

export function VerificationCard({ status }: { status: string }) {
  const { files, remove } = useFiles();
  const documents = files.filter((f) => f.kind === 'verification_document');
  const send = useAction((f: File) => uploadFile('verification_document', f), { invalidate: ['files'], success: 'Documento enviado.' });
  const request = useAction(() => post('/professionals/me/verification'), { invalidate: ['me'], success: 'Verificação solicitada.' });
  const canRequest = ['none', 'rejected'].includes(status);
  return (
    <Card>
      <CardHeader><CardTitle>Verificação de identidade</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>Situação: <b>{VERIFICATION[status]}</b></p>
        {canRequest && (
          <>
            <p className="text-muted-foreground">Envie uma foto ou PDF de um documento oficial. Só a equipe da plataforma tem acesso, e ele é apagado assim que a análise termina.</p>
            {documents.length > 0 && (
              <ul className="divide-y rounded-lg border">
                {documents.map((d, i) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 p-2">
                    <span>Documento {i + 1}</span>
                    <ConfirmAction title={`Remover o documento ${i + 1}?`} description="O arquivo é apagado. Envie outro antes de pedir a verificação." confirmLabel="Remover documento" destructive onConfirm={() => remove.mutateAsync(d.id)}>
                      <Button size="sm" variant="ghost" loading={pendingFor(remove, (v) => v === d.id)}>Remover</Button>
                    </ConfirmAction>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <FilePicker label={send.isPending ? 'Enviando...' : 'Enviar documento'} accept={`${IMAGE_TYPES},application/pdf`} loading={send.isPending} disabled={documents.length >= MAX_VERIFICATION_DOCUMENTS} onPick={(f) => send.mutate(f)} />
              <Button size="sm" disabled={documents.length === 0} loading={request.isPending} onClick={() => request.mutate()}>Solicitar verificação</Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
