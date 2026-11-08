import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { PLATFORM_SETTINGS_FIELD_DEFAULTS, platformSettingsSchema, type PlatformSettings } from '@ergatis/shared';
import { recordAudit } from '../audit/audit';
import { diff } from '../audit/audit-policy';
import { InjectDb } from '../common/db.module';
import type { Db, DbOrTx } from '../db/client';
import { platformSettings } from '../db/schema';

const KEY = 'verification';
/** Se a linha sumir, o padrão é o mais seguro: tudo exigido, sem carência. */
const SAFE_DEFAULT: PlatformSettings = {
  requireVerificationToPropose: true,
  requireFaceCheckPerProposal: true,
  graceForProfessionalsBefore: null,
  graceUntil: null,
  requireTwoFactorForStaff: true,
};
const CACHE_MS = 10_000;

@Injectable()
export class PlatformSettingsService {
  private cache: { at: number; value: PlatformSettings } | null = null;

  constructor(@InjectDb() private readonly db: Db) {}

  async get(executor: DbOrTx = this.db): Promise<PlatformSettings> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS && executor === this.db) return this.cache.value;
    const [row] = await executor.select().from(platformSettings).where(eq(platformSettings.key, KEY));
    // Campos novos ganham o padrão; o resto do que foi salvo (como a carência) é preservado.
    const parsed = platformSettingsSchema.safeParse(row ? { ...PLATFORM_SETTINGS_FIELD_DEFAULTS, ...(row.value as object) } : undefined);
    const value = parsed.success ? parsed.data : SAFE_DEFAULT;
    if (executor === this.db) this.cache = { at: Date.now(), value };
    return value;
  }

  async update(actorId: string, patch: Partial<PlatformSettings>) {
    const before = await this.get();
    const next = platformSettingsSchema.parse({ ...before, ...patch });
    await this.db.transaction(async (tx) => {
      await tx.insert(platformSettings).values({ key: KEY, value: next, updatedBy: actorId })
        .onConflictDoUpdate({ target: platformSettings.key, set: { value: next, updatedBy: actorId } });
      await recordAudit({
        actorId, action: 'settings.updated', targetType: 'settings', targetId: KEY,
        changes: diff(before as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>),
      }, tx);
    });
    this.cache = null;
    return next;
  }
}

/** Profissional antigo, dentro do prazo de carência. */
export function inGrace(settings: PlatformSettings, professionalCreatedAt: Date, now = new Date()) {
  if (!settings.graceForProfessionalsBefore || !settings.graceUntil) return false;
  return professionalCreatedAt < new Date(settings.graceForProfessionalsBefore) && now < new Date(settings.graceUntil);
}
