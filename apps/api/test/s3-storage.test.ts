import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import S3rver from 's3rver';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const PORT = 54331;
const dir = mkdtempSync(join(tmpdir(), 'ergatis-s3-'));
const server = new S3rver({ port: PORT, address: 'localhost', silent: true, directory: dir, configureBuckets: [{ name: 'ergatis' }] });

describe('armazenamento S3', () => {
  beforeAll(async () => {
    await server.run();
    vi.stubEnv('S3_ENDPOINT', `http://localhost:${PORT}`);
    vi.stubEnv('S3_REGION', 'us-east-1');
    vi.stubEnv('S3_BUCKET', 'ergatis');
    vi.stubEnv('S3_ACCESS_KEY_ID', 'S3RVER');
    vi.stubEnv('S3_SECRET_ACCESS_KEY', 'S3RVER');
    vi.resetModules();
  });
  afterAll(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('grava, lê e apaga', async () => {
    const { S3Storage } = await import('../src/files/storage');
    const storage = new S3Storage();
    const body = Buffer.from('conteúdo de teste');
    await storage.put('teste.png', body, 'image/png');
    expect((await storage.get('teste.png')).equals(body)).toBe(true);
    await storage.delete('teste.png');
    await expect(storage.get('teste.png')).rejects.toThrow();
  });
});
