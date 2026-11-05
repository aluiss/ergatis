import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { createRequestSchema, type CreateRequestInput } from '@ergatis/shared';
import { UserId } from '../common/user-id.decorator';
import { ZodPipe } from '../common/zod.pipe';
import { RequestsService } from './requests.service';

@Controller('requests')
class RequestsController {
  constructor(private readonly service: RequestsService) {}

  @Post()
  create(@UserId() userId: string, @Body(new ZodPipe(createRequestSchema)) body: CreateRequestInput) {
    return this.service.create(userId, body);
  }

  @Get('mine') mine(@UserId() userId: string) { return this.service.mine(userId); }
  @Get('feed') feed(@UserId() userId: string) { return this.service.feed(userId); }

  @Get(':id')
  detail(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(userId, id);
  }

  @Post(':id/cancel')
  cancel(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.cancel(userId, id);
  }
}

@Module({ controllers: [RequestsController], providers: [RequestsService] })
export class RequestsModule {}
