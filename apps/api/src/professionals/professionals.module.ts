import { Body, Controller, Delete, Get, Module, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import {
  professionalProfileSchema, professionalSetupSchema, searchProfessionalsSchema,
  type ProfessionalProfileInput, type ProfessionalSetupInput, type SearchProfessionalsInput,
} from '@ergatis/shared';
import { Audit } from '../audit/audit.interceptor';
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

  @Put('me') @Audit('professional.profile_updated', 'user', { targetSelf: true })
  setup(@UserId() userId: string, @Body(new ZodPipe(professionalSetupSchema)) body: ProfessionalSetupInput) {
    return this.service.setup(userId, body);
  }

  @Get('me/profiles')
  profiles(@UserId() userId: string) { return this.service.profilesOf(userId); }

  @Post('me/profiles') @Audit('professional.profile_created', 'professional_profile')
  createProfile(@UserId() userId: string, @Body(new ZodPipe(professionalProfileSchema)) body: ProfessionalProfileInput) {
    return this.service.createProfile(userId, body);
  }

  @Put('me/profiles/:id') @Audit('professional.profile_updated', 'professional_profile', { targetParam: 'id' })
  updateProfile(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(professionalProfileSchema)) body: ProfessionalProfileInput) {
    return this.service.updateProfile(userId, id, body);
  }

  @Delete('me/profiles/:id') @Audit('professional.profile_removed', 'professional_profile', { targetParam: 'id' })
  removeProfile(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) { return this.service.removeProfile(userId, id); }

  @Post('me/verification') @Audit('professional.verification_requested', 'user', { targetSelf: true })
  verification(@UserId() userId: string) { return this.service.requestVerification(userId); }

  @AllowAnonymous() @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) { return this.service.getPublic(id); }
}

@Module({ controllers: [ProfessionalsController], providers: [ProfessionalsService] })
export class ProfessionalsModule {}
