'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/** QR code gerado no navegador: o link não passa por nenhum serviço externo. Sempre escuro sobre branco, para a câmera ler. */
export function QrCode({ value, size = 176, label }: { value: string; size?: number; label: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#09090b', light: '#ffffff' } })
      .then((s) => { if (active) setSvg(s); })
      .catch(() => { if (active) setSvg(null); });
    return () => { active = false; };
  }, [value]);
  return (
    <div role="img" aria-label={label} className="rounded-lg bg-white p-2" style={{ width: size, height: size }}>
      {svg && <div className="size-full [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />}
    </div>
  );
}
