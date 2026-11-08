import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../config/env';

export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

export const STORAGE = Symbol('STORAGE');

export class LocalStorage implements Storage {
  private readonly root = resolve(env.UPLOAD_DIR);

  async put(key: string, body: Buffer) {
    await mkdir(this.root, { recursive: true });
    await writeFile(join(this.root, key), body, { mode: 0o600 });
  }

  get(key: string) { return readFile(join(this.root, key)); }
  delete(key: string) { return rm(join(this.root, key), { force: true }); }
}

export class S3Storage implements Storage {
  private readonly client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: !!env.S3_ENDPOINT,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! },
    // Serviços compatíveis nem sempre aceitam os checksums novos do SDK.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  private readonly bucket = env.S3_BUCKET!;

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async get(key: string) {
    const { Body } = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await Body!.transformToByteArray());
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
