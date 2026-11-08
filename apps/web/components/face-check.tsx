'use client';

import { Camera, CheckCircle2, RotateCcw, ScanFace, XCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FaceCheckPurpose, FaceCheckSession } from '@ergatis/shared';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DESKTOP, useMediaQuery } from '@/hooks/use-media-query';
import { api, ApiError } from '@/lib/api';

type Phase = 'starting' | 'capture' | 'review' | 'sending' | 'passed' | 'failed' | 'error';

async function complete(checkId: string, capture?: Blob) {
  const form = new FormData();
  if (capture) form.set('capture', capture, 'camera.jpg');
  const res = await fetch(`/api/verification/face-checks/${checkId}/complete`, { method: 'POST', body: form, credentials: 'include' });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.message ?? 'Não foi possível concluir a checagem.', res.status, data?.code);
  return data as { status: 'passed' | 'failed'; reason: string | null };
}

/**
 * Câmera frontal com moldura de guia. Serve ao provedor simulado. Um provedor real
 * traz o próprio componente de prova de vida (ver `ProviderCapture` abaixo).
 * Sem câmera ao vivo (HTTP fora de localhost, permissão negada), cai para a câmera
 * nativa do celular, que funciona em qualquer caso.
 */
function CameraCapture({ onCapture }: { onCapture: (photo: Blob) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const fallback = useRef<HTMLInputElement>(null);
  const [live, setLive] = useState<boolean | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    if (!navigator.mediaDevices?.getUserMedia) { setLive(false); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } }, audio: false })
      .then((s) => { stream = s; if (video.current) { video.current.srcObject = s; setLive(true); } })
      .catch(() => setLive(false));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  function shoot() {
    const v = video.current;
    if (!v?.videoWidth) return;
    const size = Math.min(v.videoWidth, v.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    // Espelhado na tela, como um espelho; a foto sai sem espelhar.
    ctx.drawImage(v, (v.videoWidth - size) / 2, (v.videoHeight - size) / 2, size, size, 0, 0, size, size);
    canvas.toBlob((b) => b && onCapture(b), 'image/jpeg', 0.9);
  }

  return (
    <div className="space-y-4">
      <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-3xl bg-black">
        {live !== false && <video ref={video} autoPlay playsInline muted className="size-full -scale-x-100 object-cover" />}
        {live === false && (
          <div className="flex size-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-white/80">
            <Camera className="size-10" aria-hidden />
            Use a câmera do celular para tirar a selfie.
          </div>
        )}
        {/* Moldura oval: onde o rosto deve ficar. */}
        <div aria-hidden className="pointer-events-none absolute inset-[12%_18%] rounded-[50%] border-4 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,0.45)]" />
      </div>
      <ul className="text-muted-foreground mx-auto max-w-sm list-disc space-y-0.5 pl-5 text-sm">
        <li>Rosto inteiro dentro da moldura, olhando para a câmera.</li>
        <li>Boa luz de frente, sem boné nem óculos escuros.</li>
      </ul>
      <input ref={fallback} type="file" accept="image/*" capture="user" className="sr-only" tabIndex={-1} aria-hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onCapture(f); e.target.value = ''; }} />
      <Button size="lg" className="h-12 w-full text-base" disabled={live === null}
        onClick={() => (live ? shoot() : fallback.current?.click())}>
        <Camera /> Tirar selfie
      </Button>
    </div>
  );
}

/**
 * Ponto único de troca do provedor. Ao plugar um provedor real, renderize aqui o
 * componente de prova de vida dele (ex.: FaceLivenessDetector da AWS, SDK da unico),
 * passando `session.clientConfig`. Quando ele terminar, conclua a checagem sem foto: a API
 * aceita `complete` sem arquivo e busca o resultado direto no provedor.
 */
function ProviderCapture({ session, onPhoto }: { session: FaceCheckSession; onPhoto: (photo: Blob) => void }) {
  if (session.provider === 'fake') return <CameraCapture onCapture={onPhoto} />;
  return <p role="alert" className="text-destructive text-sm">Provedor de reconhecimento facial “{session.provider}” ainda não integrado nesta tela.</p>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purpose: FaceCheckPurpose;
  requestId?: string;
  title: string;
  description: string;
  /** Chamado com o id da checagem aprovada. */
  onPassed: (checkId: string) => void;
}

/** Checagem facial com prova de vida, do início ao resultado. Tela cheia no celular. */
export function FaceCheckDialog({ open, onOpenChange, purpose, requestId, title, description, onPassed }: Props) {
  const desktop = useMediaQuery(DESKTOP);
  const [phase, setPhase] = useState<Phase>('starting');
  const [session, setSession] = useState<FaceCheckSession | null>(null);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const start = useCallback(async () => {
    setPhase('starting'); setMessage(null); setPhoto(null);
    try {
      setSession(await api<FaceCheckSession>('/verification/face-checks', { body: { purpose, requestId } }));
      setPhase('capture');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível iniciar.'); setPhase('error');
    }
  }, [purpose, requestId]);

  useEffect(() => { if (open) void start(); }, [open, start]);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);

  async function send() {
    if (!session) return;
    setPhase('sending');
    try {
      const result = await complete(session.checkId, photo?.blob);
      if (result.status === 'passed') { setPhase('passed'); setTimeout(() => { onPassed(session.checkId); onOpenChange(false); }, 900); }
      else { setMessage(result.reason); setPhase('failed'); }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível concluir.'); setPhase('error');
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => phase !== 'sending' && onOpenChange(o)}>
      <SheetContent side={desktop ? 'right' : 'bottom'} className="max-h-[100dvh] sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><ScanFace className="text-primary size-5" aria-hidden /> {title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        {phase === 'starting' && <p className="text-muted-foreground py-10 text-center text-sm" aria-live="polite">Preparando a câmera…</p>}

        {phase === 'capture' && session && (
          <ProviderCapture session={session} onPhoto={(blob) => { setPhoto({ blob, url: URL.createObjectURL(blob) }); setPhase('review'); }} />
        )}

        {(phase === 'review' || phase === 'sending') && photo && (
          <div className="space-y-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="Sua selfie" className="mx-auto aspect-square w-full max-w-sm rounded-3xl object-cover" />
            <div className="grid gap-2 sm:grid-cols-2">
              <Button size="lg" className="h-12 text-base" loading={phase === 'sending'} onClick={() => void send()}>Usar esta foto</Button>
              <Button size="lg" variant="outline" className="h-12 text-base" disabled={phase === 'sending'} onClick={() => setPhase('capture')}>
                <RotateCcw /> Tirar outra
              </Button>
            </div>
          </div>
        )}

        {phase === 'passed' && (
          <p className="flex flex-col items-center gap-2 py-10 text-center font-medium text-emerald-700 dark:text-emerald-400" aria-live="polite">
            <CheckCircle2 className="size-12" aria-hidden /> Identidade confirmada
          </p>
        )}

        {(phase === 'failed' || phase === 'error') && (
          <div className="space-y-4 py-4 text-center" aria-live="polite">
            <XCircle className="text-destructive mx-auto size-12" aria-hidden />
            <p className="font-medium">{phase === 'failed' ? 'Não conseguimos confirmar' : 'Algo deu errado'}</p>
            {message && <p className="text-muted-foreground text-sm">{message}</p>}
            {/* Cada tentativa é uma sessão nova no provedor: a anterior já foi concluída. */}
            <Button size="lg" className="h-12 w-full text-base" onClick={() => void start()}><RotateCcw /> Tentar de novo</Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
