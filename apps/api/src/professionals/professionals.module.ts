import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import {
  professionalSetupSchema, searchProfessionalsSchema,
  type ProfessionalSetupInput, type SearchProfessionalsInput,
} from '@ergatis/shared';
import { UserId } from '../common/user-id.decorator';
import { ZodPipe } from '../common/zod.pipe';
import { ProfessionalsService } from './professionals.service';

@Controller('professionals')
class ProfessionalsController {
  constructor(private readonly service: ProfessionalsService) {}

  @AllowAnonymous() @Get()
  search(@Query(new ZodPipe(searchProfessionalsSchema)) query: SearchProfessionalsInput) {
    return this.service.search(query);
  }

  @Put('me')
  setup(@UserId() userId: string, @Body(new ZodPipe(professionalSetupSchema)) body: ProfessionalSetupInput) {
    return this.service.setup(userId, body);
  }

  @Post('me/verification')
  verification(@UserId() userId: string) { return this.service.requestVerification(userId); }

  @AllowAnonymous() @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) { return this.service.getPublic(id); }
}

@Module({ controllers: [ProfessionalsController], providers: [ProfessionalsService] })
export class ProfessionalsModule {}
