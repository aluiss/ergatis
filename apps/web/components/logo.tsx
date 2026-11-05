import Image from 'next/image';
import { BRAND } from '@/lib/brand';

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2">
      <Image src="/logo_reduzido.png" alt="" width={size} height={size} priority />
      <span className="text-xl font-bold tracking-tight">{BRAND}</span>
    </span>
  );
}
