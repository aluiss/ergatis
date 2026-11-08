import { Body, Controller, Get, Global, Module, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { z } from 'zod';
import { ACCESS_LEVELS } from '@ergatis/shared';
import { SkipAudit } from '../audit/audit.interceptor';
import { ZodPipe } from '../common/zod.pipe';
import { AccessService } from './access.service';
import { PlatformSettingsService } from '../verification/platform-settings.service';
import { mustEnableTwoFactor, RequireAccess, RequireAccessGuard } from './require-access';
import { SessionUser } from './session-user.decorator';

const levelSchema = z.object({ level: z.enum(ACCESS_LEVELS).nullable() });

@Controller()
class AccessController {
  constructor(private readonly access: AccessService, private readonly settings: PlatformSettingsService) {}

  /** O que a pessoa logada pode fazer. A tela usa para mostrar ou esconder; quem barra é cada rota. */
  @Get('me/access')
  async mine(@SessionUser() actor: { id: string; role?: string | null; twoFactorEnabled?: boolean }) {
    return { ...(await this.access.resolve(actor)), mustEnableTwoFactor: await mustEnableTwoFactor(this.settings, actor) };
  }

  @Get('admin/access') @RequireAccess('admin.access', 'view')
  overview() { return this.access.overview(); }

  @Put('admin/access/roles/:role/:resource') @RequireAccess('admin.access', 'edit')
  @SkipAudit('o serviço registra a concessão na mesma transação')
  roleGrant(
    @SessionUser() actor: { id: string; role?: string | null },
    @Param('role') role: string, @Param('resource') resource: string,
    @Body(new ZodPipe(levelSchema)) body: z.infer<typeof levelSchema>,
  ) { return this.access.setRoleGrant(actor, role, resource, body.level); }

  @Put('admin/access/users/:userId/:resource') @RequireAccess('admin.access', 'edit')
  @SkipAudit('o serviço registra a concessão na mesma transação')
  userGrant(
    @SessionUser() actor: { id: string; role?: string | null },
    @Param('userId', ParseUUIDPipe) userId: string, @Param('resource') resource: string,
    @Body(new ZodPipe(levelSchema)) body: z.infer<typeof levelSchema>,
  ) { return this.access.setUserGrant(actor, userId, resource, body.level); }
}

@Global()
@Module({ controllers: [AccessController], providers: [AccessService, RequireAccessGuard], exports: [AccessService, RequireAccessGuard] })
export class AccessModule {}
