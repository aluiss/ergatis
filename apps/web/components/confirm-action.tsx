'use client';

import { useId, useState } from 'react';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface ReasonField {
  label: string;
  placeholder?: string;
  /** Sem `required`, o campo é opcional e vai vazio como `undefined`. */
  required?: boolean;
  minLength?: number;
  maxLength?: number;
}

interface Props {
  /** O botão que abre a confirmação. */
  children: React.ReactElement;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  reason?: ReasonField;
  /** Exige digitar esta palavra para liberar o botão: para o que não tem volta. */
  typeToConfirm?: string;
  /**
   * A ação. Deve devolver a promessa (use `mutateAsync`): o diálogo fica aberto,
   * com o botão carregando, até ela terminar; se falhar, continua aberto para
   * tentar de novo. O aviso de erro fica com quem chamou.
   */
  onConfirm: (reason?: string) => Promise<unknown>;
}

/** Confirmação para ações destrutivas ou difíceis de desfazer. Substitui `confirm()` e `prompt()`. */
export function ConfirmAction({ children, title, description, confirmLabel, destructive, reason, typeToConfirm, onConfirm }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [typed, setTyped] = useState('');
  const id = useId();

  const trimmed = text.trim();
  const reasonOk = !reason || (!reason.required && trimmed === '') || trimmed.length >= (reason.minLength ?? (reason.required ? 1 : 0));
  const typedOk = !typeToConfirm || typed.trim().toUpperCase() === typeToConfirm.toUpperCase();

  const change = (next: boolean) => {
    if (busy) return; // não fecha no meio da operação
    setOpen(next);
    if (!next) { setText(''); setTyped(''); }
  };

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    if (!reasonOk || !typedOk) return;
    setBusy(true);
    try {
      await onConfirm(trimmed || undefined);
      setBusy(false);
      change(false);
    } catch {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={change}>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <form onSubmit={confirm} className="grid gap-4">
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription asChild><div>{description}</div></AlertDialogDescription>
          </AlertDialogHeader>

          {reason && (
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-reason`}>{reason.label}{reason.required ? '' : ' (opcional)'}</Label>
              <Textarea
                id={`${id}-reason`} value={text} onChange={(e) => setText(e.target.value)}
                placeholder={reason.placeholder} maxLength={reason.maxLength ?? 1000} required={reason.required}
                minLength={reason.minLength} autoFocus disabled={busy}
              />
              {reason.minLength && reason.required && trimmed.length > 0 && trimmed.length < reason.minLength && (
                <p className="text-muted-foreground text-xs">Escreva pelo menos {reason.minLength} caracteres.</p>
              )}
            </div>
          )}

          {typeToConfirm && (
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-type`}>Para confirmar, digite <b>{typeToConfirm}</b></Label>
              <Input
                id={`${id}-type`} value={typed} onChange={(e) => setTyped(e.target.value)}
                autoComplete="off" autoCapitalize="characters" spellCheck={false} disabled={busy}
              />
            </div>
          )}

          <AlertDialogFooter>
            <Button type="submit" variant={destructive ? 'destructive' : 'default'} loading={busy} disabled={!reasonOk || !typedOk} className="h-11 sm:h-9">
              {confirmLabel}
            </Button>
            <AlertDialogCancel asChild>
              <Button type="button" variant="outline" disabled={busy} className="h-11 sm:h-9">Cancelar</Button>
            </AlertDialogCancel>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
