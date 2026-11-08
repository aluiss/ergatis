import { Body, Controller, Get, Headers, HttpCode, Module, Post } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { SkipThrottle } from '@nestjs/throttler';
import { subscribeSchema, type SubscribeInput } from '@ergatis/shared';
import { Audit, SkipAudit } from '../audit/audit.interceptor';
import { UserId } from '../common/user-id.decorator';
import { ZodPipe } from '../common/zod.pipe';
import { env } from '../config/env';
import { BillingService, type AsaasWebhook } from './billing.service';
import { AsaasBillingProvider, BILLING_PROVIDER, FakeBillingProvider } from './provider';

@Controller('billing')
class BillingController {
  constructor(private readonly service: BillingService) {}

  @AllowAnonymous() @Get('plans') plans() { return this.service.plans(); }
  @Get('me') status(@UserId() userId: string) { return this.service.status(userId); }

  @Post('subscribe') @Audit('subscription.requested', 'subscription')
  subscribe(@UserId() userId: string, @Body(new ZodPipe(subscribeSchema)) body: SubscribeInput) {
    return this.service.subscribe(userId, body);
  }

  @Post('cancel') @Audit('subscription.cancelled', 'subscription') cancel(@UserId() userId: string) { return this.service.cancel(userId); }

  @AllowAnonymous() @SkipThrottle() @Post('webhooks/asaas') @HttpCode(200)
  @SkipAudit('o serviço registra cada evento processado, com a assinatura afetada')
  webhook(@Headers('asaas-access-token') token: string | undefined, @Body() body: AsaasWebhook) {
    this.service.assertWebhookToken(token);
    return this.service.handleAsaasEvent(body);
  }
}

@Module({
  controllers: [BillingController],
  providers: [
    BillingService,
    {
      provide: BILLING_PROVIDER,
      useFactory: () => (env.BILLING_PROVIDER === 'asaas' ? new AsaasBillingProvider() : new FakeBillingProvider()),
    },
  ],
})
export class BillingModule {}
