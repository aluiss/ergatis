'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Filtros e página na URL: o link da lista filtrada pode ser enviado a outra pessoa,
 * e o botão Voltar do celular desfaz o último filtro. Exige <Suspense> na página.
 */
export function useListParams<K extends string>(keys: readonly K[], defaults: Partial<Record<K, string>> = {}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const values = Object.fromEntries(keys.map((k) => [k, params.get(k) ?? defaults[k] ?? ''])) as Record<K, string>;
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);

  const set = (next: Partial<Record<K | 'page', string>>) => {
    const merged = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next) as [string, string | undefined][]) {
      // Valor igual ao padrão não precisa ir para a URL.
      if (v && v !== defaults[k as K]) merged.set(k, v); else if (v === '' && defaults[k as K]) merged.set(k, ''); else merged.delete(k);
    }
    if (!('page' in next)) merged.delete('page');
    router.replace(`${pathname}${merged.size ? `?${merged}` : ''}`, { scroll: false });
  };

  /** Query string para a API: valores vazios saem. */
  const query = (extra: Record<string, string> = {}) =>
    new URLSearchParams(Object.entries({ ...values, page: String(page), ...extra }).filter(([, v]) => v)).toString();

  return { values, page, set, query };
}
