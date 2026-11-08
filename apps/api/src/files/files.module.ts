import {
  Body, Controller, Delete, Get, Global, Header, Module, Param, ParseUUIDPipe, Post, Req, Res,
  StreamableFile, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { OptionalAuth } from '@thallesp/nestjs-better-auth';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { MAX_DOCUMENT_BYTES, uploadFileSchema, type UploadFileInput } from '@ergatis/shared';
import { Audit } from '../audit/audit.interceptor';
import { UserId } from '../common/user-id.decorator';
import { ZodPipe } from '../common/zod.pipe';
import { env } from '../config/env';
import { FilesService, type Viewer } from './files.service';
import { LocalStorage, S3Storage, STORAGE } from './storage';

@Controller('files')
class FilesController {
  constructor(private readonly service: FilesService) {}

  @Post() @Audit('file.uploaded', 'file')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1, fields: 4 },
  }))
  upload(
    @UserId() userId: string,
    @Body(new ZodPipe(uploadFileSchema)) body: UploadFileInput,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) { return this.service.upload(userId, body, file); }

  @Get('mine') mine(@UserId() userId: string) { return this.service.mine(userId); }

  @OptionalAuth() @Get(':id')
  @Header('X-Content-Type-Options', 'nosniff')
  async read(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request & { session?: { user?: Viewer } },
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.service.read(id, req.session?.user ?? null);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', file.body.length);
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', file.isPrivate ? 'private, no-store' : 'public, max-age=3600');
    res.setHeader('Content-Disposition', file.isPrivate ? 'attachment' : 'inline');
    return new StreamableFile(file.body);
  }

  @Delete(':id') @Audit('file.removed', 'file', { targetParam: 'id' })
  remove(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(userId, id);
  }
}

@Global()
@Module({
  controllers: [FilesController],
  providers: [
    FilesService,
    { provide: STORAGE, useFactory: () => (env.STORAGE_DRIVER === 's3' ? new S3Storage() : new LocalStorage()) },
  ],
  exports: [FilesService],
})
export class FilesModule {}
