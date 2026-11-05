import { join } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './client';

async function main() {
  await migrate(db, { migrationsFolder: join(__dirname, 'migrations') });
  await pool.end();
  console.log('Migrations aplicadas.');
}

void main();
