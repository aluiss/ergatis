import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { AccountModule } from './account/account.module';
import { AdminModule } from './admin/admin.module';
import { auth } from './auth/auth';
import { BillingModule } from './billing/billing.module';
import { CategoriesModule } from './categories/categories.module';
import { DbModule } from './common/db.module';
import { env } from './config/env';
import { EngagementsModule } from './engagements/engagements.module';
import { EntitlementsModule } from './entitlements/entitlements.module';
import { HealthModule } from './health/health.module';
import { MessagingModule } from './messaging/messaging.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProfessionalsModule } from './professionals/professionals.module';
import { ProposalsModule } from './proposals/proposals.module';
import { ReportsModule } from './reports/reports.module';
import { RequestsModule } from './requests/requests.module';

@Module({
  imports: [
    AuthModule.forRoot({ auth }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120, skipIf: () => env.NODE_ENV === 'test' }]),
    DbModule,
    EntitlementsModule,
    NotificationsModule,
    HealthModule,
    CategoriesModule,
    AccountModule,
    ProfessionalsModule,
    RequestsModule,
    ProposalsModule,
    EngagementsModule,
    MessagingModule,
    ReportsModule,
    BillingModule,
    AdminModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
