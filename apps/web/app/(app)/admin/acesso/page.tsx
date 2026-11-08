'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  ACCESS_GROUP_LABELS, ACCESS_RESOURCE_KEYS, ACCESS_RESOURCES, OWNER_ONLY_RESOURCES, ROLE_DESCRIPTIONS, ROLE_LABELS, STAFF_ROLES,
  type AccessLevel, type AccessResource, type StaffRole,
} from '@ergatis/shared';
import { useAccess } from '@/components/access-provider';
import { ErrorState, Loading } from '@/components/app-ui';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type Grants = Partial<Record<AccessResource, AccessLevel>>;
type EditableRole = Exclude<StaffRole, 'owner'>;
interface Person { id: string; name: string; email: string; role: StaffRole; grants: Grants }
interface Overview { roles: Record<EditableRole, Grants>; people: Person[]; defaults: Record<EditableRole, Grants> }

const ROLES = STAFF_ROLES.filter((r) => r !== 'owner') as EditableRole[];
const GROUPS = Object.entries(ACCESS_GROUP_LABELS).map(([id, label]) => ({
  id, label, keys: ACCESS_RESOURCE_KEYS.filter((k) => ACCESS_RESOURCES[k].group === id),
})).filter((g) => g.keys.length > 0);
const LEVEL_LABEL = { none: 'Sem acesso', view: 'Ver', edit: 'Editar' } as const;
const rank = (l?: AccessLevel | null) => (l === 'edit' ? 2 : l === 'view' ? 1 : 0);

/** Sem acesso / Ver / Editar. Ação é sim ou não. Botões grandes o bastante para o polegar. */
function LevelControl({ resource, value, inherited, disabled, onChange }: {
  resource: AccessResource; value: AccessLevel | null; inherited?: AccessLevel | null; disabled: boolean;
  onChange: (level: AccessLevel | null) => void;
}) {
  const action = ACCESS_RESOURCES[resource].kind === 'action';
  const options: { level: AccessLevel | null; label: string }[] = action
    ? [{ level: null, label: 'Não' }, { level: 'edit', label: 'Sim' }]
    : [{ level: null, label: LEVEL_LABEL.none }, { level: 'view', label: LEVEL_LABEL.view }, { level: 'edit', label: LEVEL_LABEL.edit }];
  return (
    <div role="radiogroup" aria-label={ACCESS_RESOURCES[resource].label} className="bg-muted inline-flex w-full rounded-lg p-1 sm:w-auto">
      {options.map((o) => {
        const active = value === o.level;
        // O que já vem do papel não pode ser "menos" na concessão individual: ela só soma.
        const covered = inherited !== undefined && rank(o.level) < rank(inherited) && o.level !== value;
        return (
          <button
            key={o.label} type="button" role="radio" aria-checked={active} disabled={disabled || covered}
            onClick={() => !active && onChange(o.level)}
            className={cn('h-10 flex-1 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors disabled:opacity-40 sm:h-8 sm:flex-none',
              active ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ResourceList({ grants, defaults, inherited, editable, isOwner, onChange }: {
  grants: Grants; defaults?: Grants; inherited?: Grants; editable: boolean; isOwner: boolean;
  onChange: (resource: AccessResource, level: AccessLevel | null) => void;
}) {
  return (
    <div className="space-y-5">
      {GROUPS.map((g) => (
        <section key={g.id}>
          <h3 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">{g.label}</h3>
          <ul className="divide-y rounded-lg border">
            {g.keys.map((key) => {
              const info = ACCESS_RESOURCES[key];
              const value = grants[key] ?? null;
              const fromRole = inherited?.[key] ?? null;
              const changed = defaults && (defaults[key] ?? null) !== value;
              const ownerOnly = OWNER_ONLY_RESOURCES.includes(key) && !isOwner;
              return (
                <li key={key} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {info.label}
                      {changed && <Badge variant="outline">alterado do padrão</Badge>}
                      {fromRole && <Badge variant="secondary">pelo papel: {info.kind === 'action' ? 'sim' : LEVEL_LABEL[fromRole]}</Badge>}
                    </p>
                    <p className="text-muted-foreground text-xs">{info.description}{ownerOnly ? ' Só o proprietário concede.' : ''}</p>
                  </div>
                  <LevelControl
                    resource={key} value={value} inherited={inherited ? fromRole : undefined}
                    disabled={!editable || ownerOnly} onChange={(level) => onChange(key, level)}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default function AccessControl() {
  const { access, can } = useAccess();
  const client = useQueryClient();
  const [tab, setTab] = useState<'roles' | 'people'>('roles');
  const [role, setRole] = useState<EditableRole>('moderacao');
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['admin-access'], queryFn: () => api<Overview>('/admin/access') });
  const editable = can('admin.access', 'edit');
  const isOwner = !!access?.isOwner;

  const save = useMutation({
    mutationFn: ({ path, level }: { path: string; level: AccessLevel | null }) => api<Overview>(path, { method: 'PUT', body: { level } }),
    onSuccess: (data) => { client.setQueryData(['admin-access'], data); toast.success('Permissão atualizada.'); },
    onError: (e) => toast.error(e.message),
  });

  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const data = q.data;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Controle de acesso</h1>
        <p className="text-muted-foreground text-sm">
          Cada papel tem um pacote de permissões; pessoas podem receber permissões a mais. Não existe permissão negativa: vale a maior.
          {!editable && ' Você pode consultar, mas não alterar.'}
        </p>
      </div>

      <div role="tablist" className="bg-muted inline-flex w-full rounded-lg p-1 sm:w-auto">
        {([['roles', 'Por papel'], ['people', `Pessoas da equipe (${data.people.length})`]] as const).map(([id, label]) => (
          <button
            key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)}
            className={cn('h-10 flex-1 rounded-md px-4 text-sm font-medium sm:flex-none', tab === id ? 'bg-background shadow-sm' : 'text-muted-foreground')}
          >{label}</button>
        ))}
      </div>

      {tab === 'roles' ? (
        <div className="space-y-4">
          <nav aria-label="Papéis" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
            <ul className="flex w-max gap-2">
              {ROLES.map((r) => (
                <li key={r}>
                  <button
                    type="button" onClick={() => setRole(r)} aria-pressed={role === r}
                    className={cn('h-10 rounded-full border px-4 text-sm whitespace-nowrap', role === r ? 'bg-primary text-primary-foreground border-primary' : 'bg-background')}
                  >{ROLE_LABELS[r]}</button>
                </li>
              ))}
            </ul>
          </nav>
          <p className="text-muted-foreground text-sm">{ROLE_DESCRIPTIONS[role]}</p>
          <ResourceList
            grants={data.roles[role] ?? {}} defaults={data.defaults[role]} editable={editable && !save.isPending} isOwner={isOwner}
            onChange={(resource, level) => save.mutate({ path: `/admin/access/roles/${role}/${resource}`, level })}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            Para colocar alguém na equipe, abra a pessoa em <Link className="text-primary underline-offset-2 hover:underline" href="/admin/usuarios">Usuários</Link> e escolha o papel.
          </p>
          <ul className="space-y-2">
            {data.people.map((p) => (
              <li key={p.id} className="rounded-lg border">
                <button type="button" onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id}
                  className="flex min-h-14 w-full items-center gap-3 p-3 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="text-muted-foreground block truncate text-xs">{p.email}</span>
                  </span>
                  <Badge variant={p.role === 'owner' ? 'default' : 'secondary'}>{ROLE_LABELS[p.role]}</Badge>
                  {Object.keys(p.grants).length > 0 && <Badge variant="outline">+{Object.keys(p.grants).length}</Badge>}
                  <ChevronDown className={cn('text-muted-foreground size-4 transition-transform', open === p.id && 'rotate-180')} aria-hidden />
                </button>
                {open === p.id && (
                  <div className="space-y-3 border-t p-3">
                    <Link href={`/admin/usuarios/${p.id}`} className="text-primary text-sm hover:underline">Abrir usuário e trocar papel</Link>
                    {p.role === 'owner' ? (
                      <p className="text-muted-foreground text-sm">Proprietário tem acesso total; não há o que conceder.</p>
                    ) : (
                      <ResourceList
                        grants={p.grants} inherited={data.roles[p.role as EditableRole] ?? {}} isOwner={isOwner}
                        // As próprias permissões a API recusa, com mensagem.
                        editable={editable && !save.isPending}
                        onChange={(resource, level) => save.mutate({ path: `/admin/access/users/${p.id}/${resource}`, level })}
                      />
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
