import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, isNotNull, ne, or } from 'drizzle-orm';
import {
  ACCESS_RESOURCES, can, DEFAULT_ROLE_GRANTS, isStaffRole, OWNER_ONLY_RESOURCES, ROLE_LABELS, STAFF_ROLES,
  type AccessLevel, type AccessResource, type ResolvedAccess, type StaffRole, type UserRole,
} from '@ergatis/shared';
import { recordAudit } from '../audit/audit';
import { diff } from '../audit/audit-policy';
import { InjectDb } from '../common/db.module';
import type { Db } from '../db/client';
import { accessGrants, session, user } from '../db/schema';

/**
 * Atraso máximo entre mudar uma permissão e ela valer em outra instância da API.
 * Na mesma instância a mudança vale na hora (o cache é limpo).
 */
const CACHE_TTL_MS = 30_000;

type Grants = ResolvedAccess['resources'];
const rank = (l: AccessLevel | undefined) => (l === 'edit' ? 2 : l === 'view' ? 1 : 0);
const merge = (into: Grants, key: AccessResource, level: AccessLevel) => {
  if (rank(level) > rank(into[key])) into[key] = level;
};

export interface Actor { id: string; role?: string | null }

@Injectable()
export class AccessService {
  private readonly cache = new Map<string, { at: number; value: ResolvedAccess }>();

  constructor(@InjectDb() private readonly db: Db) {}

  private invalidate(userId?: string) {
    if (userId) this.cache.delete(userId); else this.cache.clear();
  }

  /** Permissões efetivas: o pacote do papel somado às concessões da pessoa. Vence a mais permissiva. */
  async resolve(actor: Actor): Promise<ResolvedAccess> {
    const cached = this.cache.get(actor.id);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS && cached.value.role === (actor.role ?? 'user')) return cached.value;

    const role = (actor.role ?? 'user') as UserRole;
    const resources: Grants = {};
    if (role === 'owner') {
      for (const key of Object.keys(ACCESS_RESOURCES) as AccessResource[]) resources[key] = 'edit';
    } else if (isStaffRole(role)) {
      const rows = await this.db.select().from(accessGrants)
        .where(or(eq(accessGrants.role, role), eq(accessGrants.userId, actor.id)));
      for (const r of rows) if (r.resourceKey in ACCESS_RESOURCES) merge(resources, r.resourceKey as AccessResource, r.level as AccessLevel);
    }
    // Quem não é da equipe não tem nada, mesmo que reste uma concessão pessoal antiga.
    const value: ResolvedAccess = { role, isOwner: role === 'owner', isStaff: isStaffRole(role), resources };
    this.cache.set(actor.id, { at: Date.now(), value });
    return value;
  }

  async can(actor: Actor | null | undefined, resource: AccessResource, level: AccessLevel = 'view') {
    if (!actor) return false;
    return can(await this.resolve(actor), resource, level);
  }

  /** Visão da tela de controle de acesso. */
  async overview() {
    const grants = await this.db.select().from(accessGrants);
    const staff = await this.db.select({ id: user.id, name: user.name, email: user.email, role: user.role })
      .from(user).where(and(isNotNull(user.role), inArray(user.role, [...STAFF_ROLES])));
    const roles = Object.fromEntries((STAFF_ROLES.filter((r) => r !== 'owner') as Exclude<StaffRole, 'owner'>[])
      .map((r) => [r, Object.fromEntries(grants.filter((g) => g.role === r).map((g) => [g.resourceKey, g.level]))]));
    const people = staff.map((p) => ({
      ...p,
      grants: Object.fromEntries(grants.filter((g) => g.userId === p.id).map((g) => [g.resourceKey, g.level])),
    }));
    return { roles, people, defaults: DEFAULT_ROLE_GRANTS };
  }

  /**
   * Travas de quem concede, nenhuma redundante:
   * 1. precisa poder editar o controle de acesso;
   * 2. o controle de acesso em si só o proprietário concede (delegá-lo é delegar o papel de proprietário);
   * 3. ninguém concede o que não tem, senão a delegação vira escada de privilégio.
   */
  private async assertCanGrant(actor: Actor, resource: AccessResource, level: AccessLevel | null) {
    const mine = await this.resolve(actor);
    if (!can(mine, 'admin.access', 'edit')) throw new ForbiddenException('Você não pode alterar permissões');
    if (mine.isOwner) return;
    if (OWNER_ONLY_RESOURCES.includes(resource)) throw new ForbiddenException('Só o proprietário concede acesso ao controle de acesso');
    if (level && !can(mine, resource, level)) throw new ForbiddenException('Você não pode conceder uma permissão que não possui');
  }

  private assertResource(resource: string): asserts resource is AccessResource {
    if (!(resource in ACCESS_RESOURCES)) throw new BadRequestException('Recurso desconhecido');
  }

  /** Concede (ou, com `level` nulo, revoga) uma permissão a um papel inteiro. */
  async setRoleGrant(actor: Actor, role: string, resource: string, level: AccessLevel | null) {
    this.assertResource(resource);
    if (!isStaffRole(role) || role === 'owner') throw new BadRequestException('Papel inválido');
    // Ações não têm "ver": ou executa ou não.
    if (level === 'view' && ACCESS_RESOURCES[resource].kind === 'action') level = 'edit';
    await this.assertCanGrant(actor, resource, level);
    await this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(accessGrants).where(and(eq(accessGrants.role, role), eq(accessGrants.resourceKey, resource)));
      await tx.delete(accessGrants).where(and(eq(accessGrants.role, role), eq(accessGrants.resourceKey, resource)));
      if (level) await tx.insert(accessGrants).values({ resourceKey: resource, level, role, grantedBy: actor.id });
      if ((before?.level ?? null) === level) return;
      await recordAudit({
        actorId: actor.id, action: level ? 'access.granted' : 'access.revoked', targetType: 'role', targetId: role,
        summary: `${ACCESS_RESOURCES[resource].label}: ${level ?? 'sem acesso'} para ${ROLE_LABELS[role]}`,
        changes: [{ field: resource, from: before?.level ?? null, to: level }],
      }, tx);
    });
    this.invalidate();
    return this.overview();
  }

  /** Concessão individual, somada ao pacote do papel da pessoa. */
  async setUserGrant(actor: Actor, userId: string, resource: string, level: AccessLevel | null) {
    this.assertResource(resource);
    if (userId === actor.id) throw new BadRequestException('Você não pode alterar as próprias permissões');
    if (level === 'view' && ACCESS_RESOURCES[resource].kind === 'action') level = 'edit';
    const [target] = await this.db.select({ id: user.id, role: user.role }).from(user).where(eq(user.id, userId));
    if (!target) throw new NotFoundException('Usuário não encontrado');
    if (!isStaffRole(target.role) || target.role === 'owner') throw new BadRequestException('Dê um papel de equipe à pessoa antes de conceder permissões');
    await this.assertCanGrant(actor, resource, level);
    await this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(accessGrants).where(and(eq(accessGrants.userId, userId), eq(accessGrants.resourceKey, resource)));
      await tx.delete(accessGrants).where(and(eq(accessGrants.userId, userId), eq(accessGrants.resourceKey, resource)));
      if (level) await tx.insert(accessGrants).values({ resourceKey: resource, level, userId, grantedBy: actor.id });
      if ((before?.level ?? null) === level) return;
      await recordAudit({
        actorId: actor.id, action: level ? 'access.granted' : 'access.revoked', targetType: 'user', targetId: userId,
        summary: `${ACCESS_RESOURCES[resource].label}: ${level ?? 'sem acesso'} (individual)`,
        changes: [{ field: resource, from: before?.level ?? null, to: level }],
      }, tx);
    });
    this.invalidate(userId);
    return this.overview();
  }

  /**
   * Troca o papel de alguém. Além das travas de concessão:
   * - ninguém altera a própria conta;
   * - proprietário só mexe com proprietário;
   * - o último proprietário não sai, senão ninguém mais administra o acesso;
   * - não se dá um papel com mais poder do que o de quem concede.
   */
  async setRole(actor: Actor, targetId: string, role: UserRole) {
    if (targetId === actor.id) throw new BadRequestException('Você não pode alterar a própria conta');
    const mine = await this.resolve(actor);
    if (!can(mine, 'admin.access', 'edit')) throw new ForbiddenException('Você não pode alterar papéis');

    return this.db.transaction(async (tx) => {
      const [target] = await tx.select({ role: user.role }).from(user).where(eq(user.id, targetId)).for('update');
      if (!target) throw new NotFoundException('Usuário não encontrado');
      const current = (target.role ?? 'user') as UserRole;
      if (current === role) return { ok: true };
      if ((role === 'owner' || current === 'owner') && !mine.isOwner) throw new ForbiddenException('Só um proprietário altera outro proprietário');
      if (current === 'owner') {
        const owners = await tx.select({ id: user.id }).from(user).where(and(eq(user.role, 'owner'), ne(user.id, targetId)));
        if (owners.length === 0) throw new ForbiddenException('Não é possível remover o último proprietário');
      }
      if (!mine.isOwner && role !== 'user' && role !== 'owner') {
        const pack = await tx.select().from(accessGrants).where(eq(accessGrants.role, role));
        const exceeds = pack.find((g) => !can(mine, g.resourceKey as AccessResource, g.level as AccessLevel));
        if (exceeds) throw new ForbiddenException(`O papel ${ROLE_LABELS[role]} tem permissões que você não possui`);
      }
      await tx.update(user).set({ role }).where(eq(user.id, targetId));
      // Quem perde a equipe perde também as concessões individuais, para não voltarem num papel futuro.
      if (!isStaffRole(role)) await tx.delete(accessGrants).where(eq(accessGrants.userId, targetId));
      // Sessões antigas saem: o novo papel vale a partir do próximo login, sem janela com o poder antigo.
      if (rankRole(role) < rankRole(current)) await tx.delete(session).where(eq(session.userId, targetId));
      await recordAudit({
        actorId: actor.id, action: 'user.role_changed', targetType: 'user', targetId,
        changes: diff({ role: current }, { role }),
        summary: `Papel alterado de ${ROLE_LABELS[current]} para ${ROLE_LABELS[role]}`,
      }, tx);
      this.invalidate(targetId);
      return { ok: true };
    });
  }
}

/** Só para decidir se a troca reduz poder (aí as sessões caem). Qualquer papel de equipe vale mais que usuário. */
const rankRole = (r: UserRole) => (r === 'owner' ? 3 : r === 'user' ? 0 : r === 'admin' ? 2 : 1);
