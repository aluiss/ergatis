import { recordAudit } from '../audit/audit';
import {
  BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, asc, count, eq } from 'drizzle-orm';
import {
  MAX_DOCUMENT_BYTES, MAX_IMAGE_BYTES, MAX_PORTFOLIO_ITEMS, MAX_VERIFICATION_DOCUMENTS,
  type FileKind, type UploadFileInput,
} from '@ergatis/shared';
import { InjectDb } from '../common/db.module';
import type { Db } from '../db/client';
import { files, professionals, profiles } from '../db/schema';
import { processPublicImage } from './image';
import { STORAGE, type Storage } from './storage';

const IMAGES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED: Record<FileKind, string[]> = {
  avatar: IMAGES,
  portfolio: IMAGES,
  verification_document: [...IMAGES, 'application/pdf'],
};
const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf',
};

/** Identifica o tipo pelo conteúdo. Nome e tipo enviados pelo cliente não são confiáveis. */
export function detectMime(b: Buffer): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (b.length >= 5 && b.toString('latin1', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

export interface Viewer { id: string; role?: string | null }

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  private async countOf(ownerId: string, kind: FileKind) {
    const [{ total }] = await this.db.select({ total: count() }).from(files)
      .where(and(eq(files.ownerId, ownerId), eq(files.kind, kind)));
    return total;
  }

  async upload(ownerId: string, input: UploadFileInput, file: { buffer: Buffer } | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException('Selecione um arquivo');
    const { kind, caption } = input;

    const mimeType = detectMime(file.buffer);
    if (!mimeType || !ALLOWED[kind].includes(mimeType)) {
      throw new BadRequestException(kind === 'verification_document'
        ? 'Envie uma imagem JPG, PNG, WebP ou um PDF'
        : 'Envie uma imagem JPG, PNG ou WebP');
    }
    const limit = mimeType === 'application/pdf' ? MAX_DOCUMENT_BYTES : MAX_IMAGE_BYTES;
    if (file.buffer.length > limit) {
      throw new BadRequestException(`O arquivo excede o limite de ${limit / 1024 / 1024} MB`);
    }

    if (kind !== 'avatar') {
      const [pro] = await this.db.select({ id: professionals.userId }).from(professionals)
        .where(eq(professionals.userId, ownerId));
      if (!pro) throw new ForbiddenException('Crie seu perfil profissional primeiro');
    }
    if (kind === 'portfolio' && (await this.countOf(ownerId, kind)) >= MAX_PORTFOLIO_ITEMS) {
      throw new ConflictException(`O portfólio aceita até ${MAX_PORTFOLIO_ITEMS} imagens`);
    }
    if (kind === 'verification_document' && (await this.countOf(ownerId, kind)) >= MAX_VERIFICATION_DOCUMENTS) {
      throw new ConflictException(`Envie no máximo ${MAX_VERIFICATION_DOCUMENTS} documentos`);
    }

    // Imagens públicas são recodificadas. Documentos ficam como enviados e são apagados após a análise.
    const body = kind === 'verification_document' ? file.buffer : await processPublicImage(file.buffer, kind);
    const storedMime = kind === 'verification_document' ? mimeType : 'image/webp';
    const storageKey = `${randomUUID()}.${EXTENSION[storedMime]}`;
    await this.storage.put(storageKey, body, storedMime);

    try {
      const [previous] = kind === 'avatar'
        ? await this.db.select().from(files).where(and(eq(files.ownerId, ownerId), eq(files.kind, 'avatar')))
        : [];
      const created = await this.db.transaction(async (tx) => {
        const [row] = await tx.insert(files)
          .values({ ownerId, kind, storageKey, mimeType: storedMime, sizeBytes: body.length, caption }).returning();
        if (kind === 'avatar') {
          await tx.update(profiles).set({ avatarFileId: row.id }).where(eq(profiles.userId, ownerId));
          if (previous) await tx.delete(files).where(eq(files.id, previous.id));
        }
        return row;
      });
      if (previous) await this.removeStored([previous.storageKey]);
      return this.summary(created);
    } catch (error) {
      await this.removeStored([storageKey]);
      throw error;
    }
  }

  private summary(f: typeof files.$inferSelect) {
    return { id: f.id, kind: f.kind, mimeType: f.mimeType, sizeBytes: f.sizeBytes, caption: f.caption, createdAt: f.createdAt };
  }

  /** Remove do armazenamento sem derrubar a operação: o registro já saiu do banco. */
  async removeStored(keys: string[]) {
    for (const key of keys) {
      await this.storage.delete(key).catch((error: unknown) => {
        this.logger.error(`Arquivo órfão ${key}: ${String(error)}`);
      });
    }
  }

  async mine(ownerId: string) {
    const rows = await this.db.select().from(files).where(eq(files.ownerId, ownerId)).orderBy(asc(files.createdAt));
    return rows.map((f) => this.summary(f));
  }

  /** Foto e portfólio são públicos; documentos só para o dono e administradores. */
  async read(id: string, viewer: Viewer | null) {
    const [file] = await this.db.select().from(files).where(eq(files.id, id));
    if (!file) throw new NotFoundException('Arquivo não encontrado');

    const isPrivate = file.kind === 'verification_document';
    if (isPrivate) {
      const isOwner = viewer?.id === file.ownerId;
      const isAdmin = viewer?.role === 'admin';
      if (!isOwner && !isAdmin) throw new NotFoundException('Arquivo não encontrado');
      if (!isOwner) {
        await recordAudit({
          actorId: viewer!.id, action: 'document.viewed', targetType: 'user', targetId: file.ownerId, metadata: { fileId: id },
        });
      }
    }
    return { body: await this.storage.get(file.storageKey), mimeType: file.mimeType, isPrivate, kind: file.kind };
  }

  async remove(ownerId: string, id: string) {
    const [deleted] = await this.db.delete(files)
      .where(and(eq(files.id, id), eq(files.ownerId, ownerId))).returning();
    if (!deleted) throw new NotFoundException('Arquivo não encontrado');
    await this.removeStored([deleted.storageKey]);
    return { ok: true };
  }

  async removeAll(ownerId: string, kind?: FileKind) {
    const deleted = await this.db.delete(files)
      .where(kind ? and(eq(files.ownerId, ownerId), eq(files.kind, kind)) : eq(files.ownerId, ownerId))
      .returning({ storageKey: files.storageKey });
    await this.removeStored(deleted.map((f) => f.storageKey));
  }
}
