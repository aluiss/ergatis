import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { asc, eq } from 'drizzle-orm';
import { InjectDb } from '../common/db.module';
import type { Db } from '../db/client';
import { categories } from '../db/schema';

@Injectable()
class CategoriesService {
  constructor(@InjectDb() private readonly db: Db) {}

  list() {
    return this.db.select().from(categories).where(eq(categories.active, true)).orderBy(asc(categories.name));
  }
}

@Controller('categories')
class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @AllowAnonymous() @Get() list() { return this.service.list(); }
}

@Module({ controllers: [CategoriesController], providers: [CategoriesService] })
export class CategoriesModule {}
