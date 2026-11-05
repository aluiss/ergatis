import { Body, Controller, Injectable, Module, Post } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { createReportSchema, type CreateReportInput } from '@ergatis/shared';
import { InjectDb } from '../common/db.module';
import { UserId } from '../common/user-id.decorator';
import { ZodPipe } from '../common/zod.pipe';
import type { Db } from '../db/client';
import { reports } from '../db/schema';

@Injectable()
class ReportsService {
  constructor(@InjectDb() private readonly db: Db) {}

  async create(reporterId: string, input: CreateReportInput) {
    if (input.targetUserId === reporterId) throw new BadRequestException('Você não pode denunciar a si mesmo');
    const [created] = await this.db.insert(reports).values({ reporterId, ...input }).returning();
    return created;
  }
}

@Controller('reports')
class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Post()
  create(@UserId() userId: string, @Body(new ZodPipe(createReportSchema)) body: CreateReportInput) {
    return this.service.create(userId, body);
  }
}

@Module({ controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
