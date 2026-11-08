import { LEGAL_VERSION } from '@ergatis/shared';
import { isLegalInfoComplete } from '@/lib/legal-info';

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl space-y-6 px-4 py-10 leading-relaxed">
      <header>
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="text-muted-foreground mt-1 text-sm">Versão {LEGAL_VERSION.split('-').reverse().join('/')}</p>
      </header>
      {!isLegalInfoComplete && (
        <p role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Minuta em revisão: os dados da empresa ainda precisam ser preenchidos.
        </p>
      )}
      {children}
    </article>
  );
}

export function Clause({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}
