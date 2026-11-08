import {
  Body, Controller, Delete, Get, Global, Module, Param, ParseUUIDPipe, Post, Put, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import {
  MAX_IMAGE_BYTES, startFaceCheckSchema, updatePlatformSettingsSchema,
  type PlatformSettings, type StartFaceCheckInput,
} from '@ergatis/shared';
import { RequireAccess } from '../access/require-access';
import { SkipAudit } from '../audit/audit.interceptor';
import { UserId } from '../common/user-id.decorator';
import { ZodPipe } from '../common/zod.pipe';
import { createFaceProvider, FACE_PROVIDER } from './face-provider';
import { PlatformSettingsService } from './platform-settings.service';
import { VerificationService } from './verification.service';

@Controller()
class VerificationController {
  constructor(private readonly service: VerificationService, private readonly settings: PlatformSettingsService) {}

  @Get('verification/me')
  status(@UserId() userId: string) { return this.service.status(userId); }

  @Post('verification/consent') @SkipAudit('o serviço registra o consentimento com a versão do texto')
  consent(@UserId() userId: string) { return this.service.giveConsent(userId); }

  @Delete('verification/consent') @SkipAudit('o serviço registra a retirada do consentimento')
  revoke(@UserId() userId: string) { return this.service.revokeConsent(userId); }

  /** Limite apertado: cada sessão custa uma chamada (e, no provedor real, dinheiro). */
  @Post('verification/face-checks') @Throttle({ default: { ttl: 60_000, limit: 6 } })
  @SkipAudit('o resultado é registrado ao concluir a checagem')
  start(@UserId() userId: string, @Body(new ZodPipe(startFaceCheckSchema)) body: StartFaceCheckInput) {
    return this.service.startCheck(userId, body);
  }

  /** `capture`: a foto, no provedor simulado. Provedores com SDK próprio concluem sem arquivo. */
  @Post('verification/face-checks/:id/complete') @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @SkipAudit('o serviço registra aprovação ou recusa com as notas')
  @UseInterceptors(FileInterceptor('capture', { storage: memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  complete(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.service.completeCheck(userId, id, file?.buffer);
  }

  @Get('admin/settings') @RequireAccess('admin.settings')
  getSettings() { return this.settings.get(); }

  @Put('admin/settings') @RequireAccess('admin.settings', 'edit') @SkipAudit('o serviço registra o antes e depois')
  updateSettings(@UserId() userId: string, @Body(new ZodPipe(updatePlatformSettingsSchema)) body: Partial<PlatformSettings>) {
    return this.settings.update(userId, body);
  }
}

@Global()
@Module({
  controllers: [VerificationController],
  providers: [VerificationService, PlatformSettingsService, { provide: FACE_PROVIDER, useFactory: createFaceProvider }],
  exports: [VerificationService, PlatformSettingsService],
})
export class VerificationModule {}
