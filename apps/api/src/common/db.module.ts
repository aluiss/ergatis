import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { db, pool } from '../db/client';

export const DB = Symbol('DB');
export const InjectDb = () => Inject(DB);

@Global()
@Module({ providers: [{ provide: DB, useValue: db }], exports: [DB] })
export class DbModule implements OnApplicationShutdown {
  async onApplicationShutdown() {
    await pool.end();
  }
}
