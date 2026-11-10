import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { createRequestSchema, type CreateRequestInput } from '@ergatis/shared';
import { Audit } from '../audit/audit.interceptor';
import { UserId } from '../common/user-id.decorator';
import { ZodPipe } from '../common/zod.pipe';
import { RequestsService } from './requests.service';

@Controller('requests')
class RequestsController {
  constructor(private readonly service: RequestsService) {}

  @Post() @Audit('service_request.created', 'service_request')
  create(@UserId() userId: string, @Body(new ZodPipe(createRequestSchema)) body: CreateRequestInput) {
    return this.service.create(userId, body);
  }

  @Get('mine') mine(@UserId() userId: string) { return this.service.mine(userId); }
  @Get('feed') feed(@UserId() userId: string, @Query('profileId', new ParseUUIDPipe({ optional: true })) profileId?: string) {
    return this.service.feed(userId, profileId);
  }

  @Get(':id')
  detail(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(userId, id);
  }

  @Post(':id/cancel') @Audit('service_request.cancelled', 'service_request', { targetParam: 'id' })
  cancel(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.cancel(userId, id);
  }
}

@Module({ controllers: [RequestsController], providers: [RequestsService] })
export class RequestsModule {}
