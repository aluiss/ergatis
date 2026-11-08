'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import type { PlatformSettings } from '@ergatis/shared';
import { useAccess } from '@/components/access-provider';
import { ErrorState, Loading } from '@/components/app-ui';
import { ConfirmAction } from '@/components/confirm-action';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const toDate = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
const fromDate = (d: string, endOfDay = false) => (d ? new Date(`${d}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}-03:00`).toISOString() : null);

function Toggle({ id, checked, onChange, disabled, title, description }: {
  id: string; checked: boolean; onChange: (v: boolean) => void; disabled: boolean; title: string; description: string;
}) {
  return (
    <label htmlFor={id} className={cn('flex min-h-16 cursor-pointer items-start justify-between gap-4 rounded-lg border p-4', disabled && 'cursor-default opacity-70')}>
      <span>
        <span className="block font-medium">{title}</span>
        <span className="text-muted-foreground block text-sm">{description}</span>
      </span>
      <span className="relative mt-1 inline-flex shrink-0">
        <input id={id} type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span aria-hidden className="bg-muted peer-checked:bg-primary peer-focus-visible:ring-ring/50 h-7 w-12 rounded-full transition-colors peer-focus-visible:ring-[3px]" />
        <span aria-hidden className="absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export default function PlatformRules() {
  const { can } = useAccess();
  const editable = can('admin.settings', 'edit');
  const client = useQueryClient();
  const q = useQuery({ queryKey: ['admin-settings'], queryFn: () => api<PlatformSettings>('/admin/settings') });
  const [draft, setDraft] = useState<PlatformSettings | null>(null);
  const save = useMutation({
    mutationFn: (s: PlatformSettings) => api<PlatformSettings>('/admin/settings', { method: 'PUT', body: s }),
    onSuccess: (s) => { client.setQueryData(['admin-settings'], s); setDraft(null); toast.success('Regras salvas.'); },
    onError: (e) => toast.error(e.message),
  });

  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const s = draft ?? q.data;
  const set = (patch: Partial<PlatformSettings>) => setDraft({ ...s, ...patch });
  const graceOn = !!s.graceForProfessionalsBefore && !!s.graceUntil;
  const loosening = (q.data.requireVerificationToPropose && !s.requireVerificationToPropose)
    || (q.data.requireTwoFactorForStaff && !s.requireTwoFactorForStaff);

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Regras da plataforma</h1>
        <p className="text-muted-foreground text-sm">Valem para todos os profissionais e na hora. Cada mudança fica na auditoria.</p>
      </div>

      <Toggle
        id="require-verification" checked={s.requireVerificationToPropose} disabled={!editable}
        onChange={(v) => set({ requireVerificationToPropose: v })}
        title="Exigir verificação para enviar propostas"
        description="Sem documento e rosto aprovados pela moderação, o profissional não envia propostas nem aparece na busca."
      />
      <Toggle
        id="require-face" checked={s.requireFaceCheckPerProposal} disabled={!editable}
        onChange={(v) => set({ requireFaceCheckPerProposal: v })}
        title="Confirmar o rosto a cada proposta"
        description="Antes de cada proposta, uma selfie rápida é comparada com o rosto cadastrado. Vale para quem já tem rosto aprovado."
      />

      <Toggle
        id="require-2fa-staff" checked={s.requireTwoFactorForStaff} disabled={!editable}
        onChange={(v) => set({ requireTwoFactorForStaff: v })}
        title="Exigir login em duas etapas da equipe"
        description="Quem tem papel de equipe só acessa a administração com o login em duas etapas ativo. A conta comum da pessoa não é afetada."
      />

      <section className="space-y-3 rounded-lg border p-4">
        <div>
          <h2 className="font-medium">Carência para quem já era profissional</h2>
          <p className="text-muted-foreground text-sm">
            Profissionais cadastrados antes da data de corte podem enviar propostas sem verificação até o fim do prazo. Os novos, não.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="grace-before">Cadastrados antes de</Label>
            <Input id="grace-before" type="date" disabled={!editable} className="h-11 sm:h-9" value={toDate(s.graceForProfessionalsBefore)}
              onChange={(e) => set({ graceForProfessionalsBefore: fromDate(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="grace-until">Podem propor até</Label>
            <Input id="grace-until" type="date" disabled={!editable} className="h-11 sm:h-9" value={toDate(s.graceUntil)}
              onChange={(e) => set({ graceUntil: fromDate(e.target.value, true) })} />
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          {graceOn ? `Carência ativa até ${new Date(s.graceUntil!).toLocaleDateString('pt-BR')}.` : 'Sem carência: preencha as duas datas para ativar.'}
        </p>
        {editable && graceOn && (
          <Button variant="outline" size="sm" onClick={() => set({ graceForProfessionalsBefore: null, graceUntil: null })}>Encerrar carência</Button>
        )}
      </section>

      {editable && draft && (
        <div className="bg-background/95 sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] flex flex-col gap-2 rounded-lg border p-3 shadow-lg sm:flex-row sm:justify-end lg:bottom-4">
          <Button variant="ghost" className="h-11 sm:h-9" onClick={() => setDraft(null)}>Descartar</Button>
          {loosening ? (
            <ConfirmAction
              title="Afrouxar as regras de segurança?"
              description={<ul className="list-disc space-y-1 pl-5">
                {q.data.requireVerificationToPropose && !s.requireVerificationToPropose && <li>Qualquer pessoa com perfil profissional poderá enviar propostas e aparecer na busca, sem documento nem reconhecimento facial.</li>}
                {q.data.requireTwoFactorForStaff && !s.requireTwoFactorForStaff && <li>A equipe poderá acessar a administração só com a senha. Se uma senha vazar, documentos e dados de todos ficam expostos.</li>}
              </ul>}
              confirmLabel="Salvar mesmo assim" destructive onConfirm={() => save.mutateAsync(s)}
            >
              <Button className="h-11 sm:h-9">Salvar regras</Button>
            </ConfirmAction>
          ) : (
            <Button className="h-11 sm:h-9" loading={save.isPending} onClick={() => save.mutate(s)}>Salvar regras</Button>
          )}
        </div>
      )}
    </div>
  );
}
