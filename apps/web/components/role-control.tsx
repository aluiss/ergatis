'use client';

import { ROLE_DESCRIPTIONS, ROLE_LABELS, USER_ROLES, isStaffRole, type UserRole } from '@ergatis/shared';
import { useState } from 'react';
import { useAccess } from '@/components/access-provider';
import { ConfirmAction } from '@/components/confirm-action';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

/** Troca de papel com explicação do que o novo papel permite. Só aparece para quem administra o acesso. */
export function RoleControl({ name, current, onChange }: { name: string; current: UserRole; onChange: (role: UserRole) => Promise<unknown> }) {
  const { access, can } = useAccess();
  const [next, setNext] = useState<UserRole>(current);
  if (!can('admin.access', 'edit')) return null;
  // Proprietário só é dado e tirado por outro proprietário.
  const options = USER_ROLES.filter((r) => access?.isOwner || (r !== 'owner' && current !== 'owner'));
  if (options.length === 0 || (current === 'owner' && !access?.isOwner)) return null;
  const losing = isStaffRole(current) && !isStaffRole(next);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="space-y-1 sm:w-56">
        <Label htmlFor="role">Papel</Label>
        <Select id="role" value={next} onChange={(e) => setNext(e.target.value as UserRole)} className="h-11 sm:h-9">
          {options.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </Select>
      </div>
      <ConfirmAction
        title={`Mudar ${name} para ${ROLE_LABELS[next]}?`}
        description={<>
          <p>{isStaffRole(next) ? ROLE_DESCRIPTIONS[next] : 'Volta a ser um usuário comum, sem acesso à administração.'}</p>
          {losing && <p className="mt-2">As permissões individuais que a pessoa tinha também são removidas, e ela sai de todos os aparelhos.</p>}
        </>}
        confirmLabel="Mudar papel" destructive={next === 'owner' || next === 'admin'}
        onConfirm={async () => { await onChange(next); }}
      >
        <Button variant="outline" disabled={next === current} className="h-11 sm:h-9">Mudar papel</Button>
      </ConfirmAction>
    </div>
  );
}
