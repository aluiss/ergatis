import { ChevronRight, FileText, Shield, ShieldCheck, Smartphone, SunMoon, User } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { InstallGuide } from '@/components/install-guide';
import { ThemePicker } from '@/components/theme-picker';

export const metadata: Metadata = { title: 'Configurações' };

function Section({ id, icon: Icon, title, description, children }: {
  id: string; icon: typeof User; title: string; description?: string; children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="bg-card scroll-mt-20 space-y-4 rounded-xl border p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <Icon className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
        <div>
          <h2 id={`${id}-title`} className="font-semibold">{title}</h2>
          {description && <p className="text-muted-foreground text-sm">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

const LINKS = [
  { href: '/perfil', icon: User, label: 'Perfil e dados pessoais', hint: 'Nome, telefone, foto e avisos por e-mail' },
  { href: '/perfil#seguranca', icon: ShieldCheck, label: 'Login em duas etapas', hint: 'Código do celular além da senha' },
  { href: '/perfil#privacidade', icon: Shield, label: 'Privacidade', hint: 'Baixar seus dados ou excluir a conta' },
  { href: '/termos', icon: FileText, label: 'Termos de Uso', hint: undefined },
  { href: '/privacidade', icon: FileText, label: 'Política de Privacidade', hint: undefined },
];

export default function Settings() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Configurações</h1>

      <Section id="aparencia" icon={SunMoon} title="Aparência" description="Vale para este aparelho.">
        <ThemePicker />
      </Section>

      <Section id="instalar" icon={Smartphone} title="Instalar no celular" description="Use o Ergatis como um aplicativo, direto da tela inicial.">
        <InstallGuide />
      </Section>

      <nav aria-label="Conta" className="bg-card divide-y rounded-xl border">
        {LINKS.map(({ href, icon: Icon, label, hint }) => (
          <Link key={href} href={href} className="hover:bg-muted/50 flex min-h-14 items-center gap-3 px-4 py-3 first:rounded-t-xl last:rounded-b-xl">
            <Icon className="text-muted-foreground size-5 shrink-0" aria-hidden />
            <span className="flex-1">
              <span className="block text-sm font-medium">{label}</span>
              {hint && <span className="text-muted-foreground block text-xs">{hint}</span>}
            </span>
            <ChevronRight className="text-muted-foreground size-4" aria-hidden />
          </Link>
        ))}
      </nav>
    </div>
  );
}
