import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { sql } from 'drizzle-orm';
import { InjectDb } from '../common/db.module';
import type { Db } from '../db/client';

@Controller('health')
class HealthController {
  constructor(@InjectDb() private readonly db: Db) {}

  @AllowAnonymous() @Get()
  async check() {
    try {
      await this.db.execute(sql`select 1`);
      return { ok: true };
    } catch {
      throw new ServiceUnavailableException({ ok: false });
    }
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
