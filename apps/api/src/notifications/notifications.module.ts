import { Controller, Get, Global, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { UserId } from '../common/user-id.decorator';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get() list(@UserId() userId: string) { return this.service.list(userId); }

  @Post(':id/read')
  read(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.markRead(userId, id);
  }
}

@Global()
@Module({ controllers: [NotificationsController], providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
