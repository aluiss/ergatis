import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { createProposalSchema, type CreateProposalInput } from '@ergatis/shared';
import { Audit } from '../audit/audit.interceptor';
import { UserId } from '../common/user-id.decorator';
import { ZodPipe } from '../common/zod.pipe';
import { ProposalsService } from './proposals.service';

@Controller()
class ProposalsController {
  constructor(private readonly service: ProposalsService) {}

  @Post('requests/:requestId/proposals') @Audit('proposal.created', 'proposal')
  create(
    @UserId() userId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body(new ZodPipe(createProposalSchema)) body: CreateProposalInput,
  ) { return this.service.create(userId, requestId, body); }

  @Get('proposals/mine') mine(@UserId() userId: string) { return this.service.mine(userId); }

  @Post('proposals/:id/withdraw') @Audit('proposal.withdrawn', 'proposal', { targetParam: 'id' })
  withdraw(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) { return this.service.withdraw(userId, id); }

  @Post('proposals/:id/accept') @Audit('proposal.accepted', 'proposal', { targetParam: 'id' })
  accept(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) { return this.service.accept(userId, id); }

  @Post('proposals/:id/reject') @Audit('proposal.rejected', 'proposal', { targetParam: 'id' })
  reject(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) { return this.service.reject(userId, id); }
}

@Module({ controllers: [ProposalsController], providers: [ProposalsService] })
export class ProposalsModule {}
