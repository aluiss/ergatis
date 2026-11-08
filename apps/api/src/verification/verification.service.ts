import {
  BadRequestException, ConflictException, ForbiddenException, GoneException, Inject, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { and, count, eq, gt, inArray, isNull } from 'drizzle-orm';
import {
  BIOMETRIC_CONSENT_VERSION, FACE_CHECK_TTL_MINUTES,
  type EnrollmentStatus, type FaceCheckSession, type StartFaceCheckInput, type VerificationStatusView,
} from '@ergatis/shared';
import { recordAudit } from '../audit/audit';
import { InjectDb } from '../common/db.module';
import { env } from '../config/env';
import type { Db, DbOrTx, Tx } from '../db/client';
import { faceChecks, faceEnrollments, files, professionals, serviceRequests } from '../db/schema';
import { FilesService } from '../files/files.service';
import { FACE_PROVIDER, type FaceProvider } from './face-provider';
import { inGrace, PlatformSettingsService } from './platform-settings.service';

const TTL_MS = FACE_CHECK_TTL_MINUTES * 60_000;

export interface ProposalGate {
  allowed: boolean;
  reason: string | null;
  faceCheckRequired: boolean;
  inGrace: boolean;
}

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(FACE_PROVIDER) private readonly provider: FaceProvider,
    private readonly settings: PlatformSettingsService,
    private readonly files: FilesService,
  ) {}

  private async enrollmentOf(userId: string, executor: DbOrTx = this.db) {
    const [row] = await executor.select().from(faceEnrollments).where(eq(faceEnrollments.userId, userId));
    return row ?? null;
  }

  /**
   * Pode enviar proposta? Verificado = pedido aprovado pela moderação E rosto aprovado.
   * A checagem por proposta só é exigida de quem tem rosto cadastrado (é com ele que se compara).
   */
  async proposalGate(userId: string, executor: DbOrTx = this.db): Promise<ProposalGate> {
    const settings = await this.settings.get();
    const [pro] = await executor.select().from(professionals).where(eq(professionals.userId, userId));
    if (!pro) return { allowed: false, reason: 'Crie seu perfil profissional primeiro', faceCheckRequired: false, inGrace: false };
    const enrollment = await this.enrollmentOf(userId, executor);
    const verified = pro.verification === 'approved' && enrollment?.status === 'approved';
    const grace = !verified && inGrace(settings, pro.createdAt);
    if (settings.requireVerificationToPropose && !verified && !grace) {
      return {
        allowed: false, inGrace: false, faceCheckRequired: false,
        reason: pro.verification === 'pending'
          ? 'Sua verificação está em análise. Assim que for aprovada, você poderá enviar propostas.'
          : 'Verifique sua identidade (documento e reconhecimento facial) para enviar propostas.',
      };
    }
    return { allowed: true, reason: null, inGrace: grace, faceCheckRequired: settings.requireFaceCheckPerProposal && verified };
  }

  async status(userId: string): Promise<VerificationStatusView> {
    const [pro] = await this.db.select().from(professionals).where(eq(professionals.userId, userId));
    const enrollment = await this.enrollmentOf(userId);
    const [{ documents }] = await this.db.select({ documents: count() }).from(files)
      .where(and(eq(files.ownerId, userId), eq(files.kind, 'verification_document')));
    const gate = await this.proposalGate(userId);
    const settings = await this.settings.get();
    return {
      consent: enrollment ? { version: enrollment.consentVersion, givenAt: enrollment.consentAt.toISOString() } : null,
      consentOutdated: !!enrollment && enrollment.consentVersion !== BIOMETRIC_CONSENT_VERSION,
      documents,
      face: enrollment?.status && enrollment.capturedAt
        ? { status: enrollment.status as EnrollmentStatus, capturedAt: enrollment.capturedAt.toISOString() } : null,
      verification: pro?.verification ?? 'none',
      canPropose: gate.allowed,
      blockedReason: gate.reason,
      faceCheckRequired: gate.faceCheckRequired,
      inGrace: gate.inGrace,
      graceUntil: gate.inGrace ? settings.graceUntil : null,
      provider: this.provider.name,
    };
  }

  /** Consentimento específico para biometria (LGPD art. 11, I). Renovado quando o texto muda de versão. */
  async giveConsent(userId: string) {
    const now = new Date();
    await this.db.insert(faceEnrollments).values({ userId, consentVersion: BIOMETRIC_CONSENT_VERSION, consentAt: now })
      .onConflictDoUpdate({ target: faceEnrollments.userId, set: { consentVersion: BIOMETRIC_CONSENT_VERSION, consentAt: now } });
    await recordAudit({ actorId: userId, action: 'biometric.consent_given', targetType: 'user', targetId: userId, metadata: { version: BIOMETRIC_CONSENT_VERSION } });
    return this.status(userId);
  }

  /** Retirada do consentimento: o rosto sai do provedor e daqui, e a verificação volta ao início. */
  async revokeConsent(userId: string) {
    await this.forget(userId);
    await this.db.update(professionals).set({ verification: 'none' }).where(eq(professionals.userId, userId));
    await recordAudit({ actorId: userId, action: 'biometric.consent_revoked', targetType: 'user', targetId: userId });
    return this.status(userId);
  }

  /** Apaga tudo de biometria da pessoa (retirada de consentimento, exclusão de conta). */
  async forget(userId: string) {
    const enrollment = await this.enrollmentOf(userId);
    if (enrollment?.subjectRef) {
      await this.provider.deleteSubject(enrollment.subjectRef).catch((e: unknown) => {
        // Não trava a pessoa: fica no log para apagar à mão no provedor.
        this.logger.error(`Falha ao apagar rosto ${enrollment.subjectRef} no provedor: ${String(e)}`);
      });
    }
    await this.db.delete(faceChecks).where(eq(faceChecks.userId, userId));
    await this.db.delete(faceEnrollments).where(eq(faceEnrollments.userId, userId));
    await this.files.removeAll(userId, 'verification_selfie');
  }

  async startCheck(userId: string, input: StartFaceCheckInput): Promise<FaceCheckSession> {
    const enrollment = await this.enrollmentOf(userId);
    if (!enrollment || enrollment.consentVersion !== BIOMETRIC_CONSENT_VERSION) {
      throw new ForbiddenException({ code: 'BIOMETRIC_CONSENT_REQUIRED', message: 'Aceite o uso da biometria antes de continuar.' });
    }
    if (input.purpose === 'enrollment') {
      const [pro] = await this.db.select().from(professionals).where(eq(professionals.userId, userId));
      if (!pro) throw new ForbiddenException('Crie seu perfil profissional primeiro');
      if (pro.verification === 'pending') throw new ConflictException('Sua verificação está em análise');
    } else {
      if (enrollment.status !== 'approved' || !enrollment.subjectRef) throw new ForbiddenException('Seu rosto ainda não foi verificado');
      if (!input.requestId) throw new BadRequestException('Informe o pedido');
      const [request] = await this.db.select({ status: serviceRequests.status }).from(serviceRequests).where(eq(serviceRequests.id, input.requestId));
      if (!request) throw new NotFoundException('Pedido não encontrado');
      if (request.status !== 'open') throw new ConflictException('Este pedido não aceita mais propostas');
    }
    const session = await this.provider.startSession({ userId, purpose: input.purpose });
    const expiresAt = new Date(Date.now() + TTL_MS);
    const [check] = await this.db.insert(faceChecks).values({
      userId, purpose: input.purpose, provider: this.provider.name, sessionRef: session.sessionRef,
      requestId: input.purpose === 'proposal' ? input.requestId : null, expiresAt,
    }).returning();
    return { checkId: check.id, provider: this.provider.name, clientConfig: session.clientConfig, expiresAt: expiresAt.toISOString() };
  }

  /** Conclui a checagem com o resultado do provedor. `evidence`: a foto, no provedor simulado. */
  async completeCheck(userId: string, checkId: string, evidence?: Buffer) {
    const [check] = await this.db.select().from(faceChecks).where(and(eq(faceChecks.id, checkId), eq(faceChecks.userId, userId)));
    if (!check) throw new NotFoundException('Checagem não encontrada');
    if (check.status !== 'pending') throw new ConflictException('Esta checagem já foi concluída');
    if (check.expiresAt < new Date()) {
      await this.db.update(faceChecks).set({ status: 'expired' }).where(eq(faceChecks.id, checkId));
      throw new GoneException('O tempo para a checagem acabou. Comece de novo.');
    }

    const fail = async (reason: string, scores: { liveness?: number; match?: number } = {}) => {
      await this.db.update(faceChecks).set({
        status: 'failed', failureReason: reason, livenessScore: scores.liveness, matchScore: scores.match, completedAt: new Date(),
      }).where(eq(faceChecks.id, checkId));
      await recordAudit({
        actorId: userId, action: 'face.check_failed', targetType: 'face_check', targetId: checkId,
        summary: reason, metadata: { purpose: check.purpose, provider: check.provider, ...scores },
      });
      return { status: 'failed' as const, reason };
    };

    const liveness = await this.provider.getLiveness(check.sessionRef, evidence);
    if (!liveness.live || liveness.score < env.FACE_MIN_LIVENESS) {
      return fail(liveness.reason ?? 'Não foi possível confirmar que é uma pessoa ao vivo. Tente com boa luz, sem óculos escuros.', { liveness: liveness.score });
    }

    if (check.purpose === 'enrollment') {
      const previous = await this.enrollmentOf(userId);
      const { subjectRef } = await this.provider.enroll({ userId, sessionRef: check.sessionRef, image: liveness.image });
      if (previous?.subjectRef && previous.subjectRef !== subjectRef) await this.provider.deleteSubject(previous.subjectRef).catch(() => undefined);
      // A selfie fica só até a moderação decidir, para comparar com o documento.
      if (liveness.image) await this.files.storeSelfie(userId, liveness.image);
      let documentMatch: number | null = null;
      const document = liveness.image && this.provider.compareWithDocument ? await this.files.firstDocumentImage(userId) : null;
      if (document && liveness.image) documentMatch = (await this.provider.compareWithDocument!({ image: liveness.image, document })).score;
      const now = new Date();
      await this.db.update(faceEnrollments).set({
        provider: this.provider.name, subjectRef, status: 'captured', livenessScore: liveness.score,
        documentMatchScore: documentMatch, capturedAt: now, decidedAt: null,
      }).where(eq(faceEnrollments.userId, userId));
      await this.db.update(faceChecks).set({ status: 'passed', livenessScore: liveness.score, completedAt: now }).where(eq(faceChecks.id, checkId));
      await recordAudit({
        actorId: userId, action: 'face.enrolled', targetType: 'user', targetId: userId,
        metadata: { provider: this.provider.name, liveness: liveness.score, documentMatch },
      });
      return { status: 'passed' as const, reason: null };
    }

    const enrollment = await this.enrollmentOf(userId);
    if (!enrollment?.subjectRef || enrollment.status !== 'approved') return fail('Seu rosto ainda não foi verificado');
    const { score } = await this.provider.verify({ subjectRef: enrollment.subjectRef, sessionRef: check.sessionRef, image: liveness.image });
    if (score < env.FACE_MIN_MATCH) return fail('O rosto não confere com o cadastrado.', { liveness: liveness.score, match: score });
    await this.db.update(faceChecks).set({ status: 'passed', livenessScore: liveness.score, matchScore: score, completedAt: new Date() })
      .where(eq(faceChecks.id, checkId));
    await recordAudit({
      actorId: userId, action: 'face.check_passed', targetType: 'face_check', targetId: checkId,
      metadata: { purpose: 'proposal', requestId: check.requestId, liveness: liveness.score, match: score },
    });
    return { status: 'passed' as const, reason: null };
  }

  /**
   * Usa a checagem numa proposta, dentro da transação dela: aprovada, recente, da
   * mesma pessoa, para o mesmo pedido e ainda não usada. Trava a linha para duas
   * propostas simultâneas não usarem a mesma checagem.
   */
  async consumeForProposal(tx: Tx, userId: string, checkId: string | undefined, requestId: string) {
    if (!checkId) {
      throw new ForbiddenException({ code: 'FACE_CHECK_REQUIRED', message: 'Confirme sua identidade com o reconhecimento facial para enviar a proposta.' });
    }
    const [check] = await tx.select().from(faceChecks).where(and(
      eq(faceChecks.id, checkId), eq(faceChecks.userId, userId), eq(faceChecks.purpose, 'proposal'),
      eq(faceChecks.status, 'passed'), isNull(faceChecks.usedAt), eq(faceChecks.requestId, requestId),
      gt(faceChecks.completedAt, new Date(Date.now() - TTL_MS)),
    )).for('update');
    if (!check) {
      throw new ForbiddenException({ code: 'FACE_CHECK_REQUIRED', message: 'A confirmação facial expirou ou não vale para este pedido. Faça de novo.' });
    }
    await tx.update(faceChecks).set({ usedAt: new Date() }).where(eq(faceChecks.id, checkId));
    return check.id;
  }

  async linkProposal(tx: Tx, checkId: string, proposalId: string) {
    await tx.update(faceChecks).set({ proposalId }).where(eq(faceChecks.id, checkId));
    await recordAudit({ action: 'face.check_used', targetType: 'face_check', targetId: checkId, metadata: { proposalId } }, tx);
  }

  /** Decisão da moderação: aprova o rosto junto com o documento, ou apaga tudo. */
  async onDecision(tx: Tx, userId: string, approved: boolean) {
    const enrollment = await this.enrollmentOf(userId, tx);
    if (approved) {
      if (enrollment?.status !== 'captured') throw new BadRequestException('Esta pessoa ainda não cadastrou o rosto');
      await tx.update(faceEnrollments).set({ status: 'approved', decidedAt: new Date() }).where(eq(faceEnrollments.userId, userId));
      return;
    }
    if (enrollment?.subjectRef) await this.provider.deleteSubject(enrollment.subjectRef).catch(() => undefined);
    if (enrollment) {
      await tx.update(faceEnrollments).set({ status: 'rejected', subjectRef: null, decidedAt: new Date() })
        .where(eq(faceEnrollments.userId, userId));
    }
  }

  /** Para a fila da moderação. */
  async reviewData(userIds: string[]) {
    if (userIds.length === 0) return new Map<string, { livenessScore: number | null; documentMatchScore: number | null; capturedAt: Date | null; selfieFileId: string | null }>();
    const rows = await this.db.select().from(faceEnrollments).where(inArray(faceEnrollments.userId, userIds));
    const selfies = await this.db.select({ id: files.id, ownerId: files.ownerId }).from(files)
      .where(and(eq(files.kind, 'verification_selfie'), inArray(files.ownerId, userIds)));
    return new Map(rows.map((r) => [r.userId, {
      livenessScore: r.livenessScore, documentMatchScore: r.documentMatchScore, capturedAt: r.capturedAt,
      selfieFileId: selfies.find((s) => s.ownerId === r.userId)?.id ?? null,
    }]));
  }
}
