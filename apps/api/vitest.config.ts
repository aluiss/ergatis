import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://postgres:postgres@localhost:54329/ergatis_test',
      WEB_URL: 'http://localhost:3000',
      API_URL: 'http://localhost:3333',
      BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-123',
      BILLING_PROVIDER: 'fake',
      STORAGE_DRIVER: 'local',
      UPLOAD_DIR: '/tmp/ergatis-test-uploads',
      ASAAS_WEBHOOK_TOKEN: 'webhook-token',
    },
  },
});
