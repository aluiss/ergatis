import {
  Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post,
} from '@nestjs/common';
import { and, asc, desc, eq, isNull, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { sendMessageSchema, type SendMessageInput } from '@ergatis/shared';
import { InjectDb } from '../common/db.module';
import { Audit } from '../audit/audit.interceptor';
import { UserId } from '../common/user-id.decorator';
import { ZodPipe } from '../common/zod.pipe';
import type { Db } from '../db/client';
import { conversations, messages, profiles, proposals, serviceRequests } from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
class MessagingService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly notifications: NotificationsService,
  ) {}

  private async participantConversation(userId: string, id: string) {
    const [c] = await this.db.select().from(conversations).where(and(
      eq(conversations.id, id),
      or(eq(conversations.clientId, userId), eq(conversations.professionalId, userId)),
    ));
    if (!c) throw new NotFoundException('Conversa não encontrada');
    return c;
  }

  list(userId: string) {
    const client = alias(profiles, 'client_profile');
    const pro = alias(profiles, 'pro_profile');
    return this.db
      .select({
        id: conversations.id,
        requestTitle: serviceRequests.title,
        otherName: sql<string>`case when ${conversations.clientId} = ${userId} then ${pro.displayName} else ${client.displayName} end`,
        unread: sql<number>`(select count(*)::int from messages m
          where m.conversation_id = ${conversations.id} and m.sender_id <> ${userId} and m.read_at is null)`,
      })
      .from(conversations)
      .innerJoin(proposals, eq(proposals.id, conversations.proposalId))
      .innerJoin(serviceRequests, eq(serviceRequests.id, proposals.requestId))
      .innerJoin(client, eq(client.userId, conversations.clientId))
      .innerJoin(pro, eq(pro.userId, conversations.professionalId))
      .where(or(eq(conversations.clientId, userId), eq(conversations.professionalId, userId)))
      .orderBy(desc(conversations.createdAt)).limit(100);
  }

  async messages(userId: string, id: string) {
    await this.participantConversation(userId, id);
    await this.db.update(messages).set({ readAt: new Date() })
      .where(and(eq(messages.conversationId, id), ne(messages.senderId, userId), isNull(messages.readAt)));
    return this.db.select().from(messages).where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt)).limit(500);
  }

  async send(userId: string, id: string, input: SendMessageInput) {
    const c = await this.participantConversation(userId, id);
    const [created] = await this.db.insert(messages)
      .values({ conversationId: id, senderId: userId, body: input.body }).returning();
    const other = userId === c.clientId ? c.professionalId : c.clientId;
    await this.notifications.notify(this.db, other, 'message_received', 'Você recebeu uma mensagem.', `/mensagens/${id}`);
    return created;
  }
}

@Controller('conversations')
class MessagingController {
  constructor(private readonly service: MessagingService) {}

  @Get() list(@UserId() userId: string) { return this.service.list(userId); }

  @Get(':id/messages')
  messages(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) { return this.service.messages(userId, id); }

  @Post(':id/messages') @Audit('message.sent', 'conversation', { targetParam: 'id' })
  send(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(sendMessageSchema)) body: SendMessageInput,
  ) { return this.service.send(userId, id, body); }
}

@Module({ controllers: [MessagingController], providers: [MessagingService] })
export class MessagingModule {}
