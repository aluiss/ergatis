import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

export default async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'ergatis-pg-'));
  chmodSync(dir, 0o777);
  const pg = new EmbeddedPostgres({
    databaseDir: join(dir, 'data'),
    user: 'postgres',
    password: 'postgres',
    port: 54329,
    persistent: false,
    createPostgresUser: true,
    onLog: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('ergatis_test');

  const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: 'postgres://postgres:postgres@localhost:54329/ergatis_test',
    WEB_URL: 'http://localhost:3000', API_URL: 'http://localhost:3333', BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-123' };
  execFileSync('npx', ['tsx', 'src/db/migrate.ts'], { env, stdio: 'inherit' });
  execFileSync('npx', ['tsx', 'src/db/seed.ts'], { env, stdio: 'inherit' });

  return async () => {
    await pg.stop();
    rmSync(dir, { recursive: true, force: true });
  };
}
