import { defineConfig } from 'drizzle-kit';

try { process.loadEnvFile(); } catch { /* sem .env */ }

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  casing: 'snake_case',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://ergatis:ergatis@localhost:5434/ergatis' },
});
