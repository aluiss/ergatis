import { Controller, Get, Global, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { SkipAudit } from '../audit/audit.interceptor';
import { UserId } from '../common/user-id.decorator';
import { NotificationMailer } from './notification-mailer';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get() list(@UserId() userId: string) { return this.service.list(userId); }
  @Get('unread-count') unread(@UserId() userId: string) { return this.service.unreadCounts(userId); }

  @Post('read-all') @SkipAudit('marcar notificações como lidas não tem valor de auditoria')
  readAll(@UserId() userId: string) { return this.service.markAllRead(userId); }

  @Post(':id/read') @SkipAudit('marcar notificação como lida não tem valor de auditoria')
  read(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.markRead(userId, id);
  }
}

@Global()
@Module({ controllers: [NotificationsController], providers: [NotificationsService, NotificationMailer], exports: [NotificationsService] })
export class NotificationsModule {}
