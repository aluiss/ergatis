/* eslint-disable @next/next/no-img-element */
'use client';

import { BIOMETRIC_CONSENT_POINTS, MAX_PORTFOLIO_ITEMS, MAX_VERIFICATION_DOCUMENTS, type VerificationStatusView } from '@ergatis/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ScanFace, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { pendingFor, post, useAction } from '@/components/app-ui';
import { ConfirmAction } from '@/components/confirm-action';
import { Avatar } from '@/components/avatar';
import { FaceCheckDialog } from '@/components/face-check';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
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

function StepItem({ n, done, current, title, children }: { n: number; done: boolean; current: boolean; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
        done ? 'bg-emerald-600 text-white' : current ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
        {done ? <Check className="size-4" aria-label="Concluído" /> : n}
      </span>
      <div className="min-w-0 flex-1 space-y-2 pb-1">
        <p className={cn('pt-1 font-medium', !done && !current && 'text-muted-foreground')}>{title}</p>
        {current && children}
      </div>
    </li>
  );
}

/**
 * Verificação de identidade em quatro passos: consentimento da biometria, documento,
 * selfie com prova de vida e envio para a moderação. Sem ela, não há propostas
 * (salvo carência definida pela administração).
 */
export function VerificationCard() {
  const client = useQueryClient();
  const status = useQuery({ queryKey: ['verification'], queryFn: () => api<VerificationStatusView>('/verification/me') });
  const { files, remove } = useFiles();
  const [faceOpen, setFaceOpen] = useState(false);
  const refresh = ['verification', 'files', 'me'];
  const documents = files.filter((f) => f.kind === 'verification_document');
  const send = useAction((f: File) => uploadFile('verification_document', f), { invalidate: refresh, success: 'Documento enviado.' });
  const consent = useAction(() => post('/verification/consent'), { invalidate: refresh, success: 'Consentimento registrado.' });
  const revoke = useAction(() => api('/verification/consent', { method: 'DELETE' }), { invalidate: refresh, success: 'Biometria apagada.' });
  const request = useAction(() => post('/professionals/me/verification'), { invalidate: refresh, success: 'Verificação enviada para análise.' });

  if (status.isPending) return <Card><CardContent><Skeleton className="h-32" /></CardContent></Card>;
  if (status.error) return null;
  const v = status.data;
  const consentOk = !!v.consent && !v.consentOutdated;
  const docsOk = documents.length > 0;
  const faceOk = v.face?.status === 'captured' || v.face?.status === 'approved';
  const editable = v.verification !== 'pending' && v.verification !== 'approved';
  const step = !consentOk ? 1 : !docsOk ? 2 : !faceOk ? 3 : 4;

  return (
    <Card id="verificacao" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <ShieldCheck className="text-primary size-5" aria-hidden /> Verificação de identidade
          <Badge variant={v.verification === 'approved' ? 'default' : 'secondary'}>{VERIFICATION[v.verification] ?? v.verification}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {v.blockedReason && <p className="rounded-lg bg-amber-50 p-3 text-amber-900 dark:bg-amber-950 dark:text-amber-200">{v.blockedReason}</p>}
        {v.inGrace && v.graceUntil && (
          <p className="rounded-lg bg-sky-50 p-3 text-sky-900 dark:bg-sky-950 dark:text-sky-200">
            Você pode enviar propostas sem verificação até {new Date(v.graceUntil).toLocaleDateString('pt-BR')}. Depois disso, ela passa a ser obrigatória.
          </p>
        )}
        {v.verification === 'approved' && (
          <p className="text-muted-foreground">Identidade verificada. A cada proposta, você confirma o rosto em poucos segundos.</p>
        )}
        {v.verification === 'pending' && <p className="text-muted-foreground">Recebemos seus dados. A equipe analisa e avisa por notificação.</p>}
        {v.verification === 'rejected' && <p className="text-destructive">A verificação anterior foi recusada. Envie de novo com fotos nítidas.</p>}

        {editable && (
          <ol className="space-y-4">
            <StepItem n={1} done={consentOk} current={step === 1} title="Autorizar o uso da biometria">
              <ul className="text-muted-foreground list-disc space-y-1 pl-5">
                {BIOMETRIC_CONSENT_POINTS.map((p) => <li key={p}>{p}</li>)}
              </ul>
              <p className="text-muted-foreground">Detalhes na <Link className="text-primary underline-offset-2 hover:underline" href="/privacidade#biometria">Política de Privacidade</Link>.</p>
              <Button className="h-11 w-full sm:w-auto" loading={consent.isPending} onClick={() => consent.mutate()}>
                {v.consentOutdated ? 'Concordo com o texto atualizado' : 'Concordo e autorizo'}
              </Button>
            </StepItem>

            <StepItem n={2} done={docsOk} current={step === 2} title="Enviar um documento com foto">
              <p className="text-muted-foreground">RG, CNH ou passaporte, frente com a foto legível. Imagem ou PDF.</p>
              <FilePicker label={send.isPending ? 'Enviando...' : 'Enviar documento'} accept={`${IMAGE_TYPES},application/pdf`} loading={send.isPending} disabled={documents.length >= MAX_VERIFICATION_DOCUMENTS} onPick={(f) => send.mutate(f)} />
            </StepItem>

            <StepItem n={3} done={faceOk} current={step === 3} title="Reconhecimento facial">
              <p className="text-muted-foreground">Uma selfie com prova de vida, para confirmar que a pessoa do documento é você.</p>
              <Button className="h-11 w-full sm:w-auto" onClick={() => setFaceOpen(true)}><ScanFace /> Fazer reconhecimento facial</Button>
            </StepItem>

            <StepItem n={4} done={false} current={step === 4} title="Enviar para análise">
              <Button className="h-11 w-full sm:w-auto" loading={request.isPending} onClick={() => request.mutate()}>Enviar para análise</Button>
            </StepItem>
          </ol>
        )}

        {editable && documents.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {documents.map((d, i) => (
              <li key={d.id} className="flex items-center justify-between gap-3 p-2">
                <span>Documento {i + 1}</span>
                <ConfirmAction title={`Remover o documento ${i + 1}?`} description="O arquivo é apagado. Envie outro antes de pedir a verificação." confirmLabel="Remover documento" destructive onConfirm={() => remove.mutateAsync(d.id)}>
                  <Button size="sm" variant="ghost" loading={pendingFor(remove, (x) => x === d.id)}>Remover</Button>
                </ConfirmAction>
              </li>
            ))}
          </ul>
        )}
        {editable && faceOk && step === 4 && (
          <Button variant="link" className="h-auto p-0" onClick={() => setFaceOpen(true)}>Refazer o reconhecimento facial</Button>
        )}

        {v.consent && (
          <div className="border-t pt-3">
            <ConfirmAction
              title="Retirar a autorização da biometria?"
              description="O modelo do seu rosto é apagado, aqui e no provedor. Sua verificação volta ao início e, enquanto ela for exigida, você não poderá enviar propostas."
              confirmLabel="Retirar e apagar" destructive
              onConfirm={() => revoke.mutateAsync()}
            >
              <Button variant="ghost" size="sm" className="text-muted-foreground px-0">Retirar autorização e apagar biometria</Button>
            </ConfirmAction>
          </div>
        )}

        <FaceCheckDialog
          open={faceOpen} onOpenChange={setFaceOpen} purpose="enrollment"
          title="Reconhecimento facial" description="Vamos tirar uma selfie para comparar com o seu documento."
          onPassed={() => { void client.invalidateQueries({ queryKey: ['verification'] }); void client.invalidateQueries({ queryKey: ['files'] }); }}
        />
      </CardContent>
    </Card>
  );
}
