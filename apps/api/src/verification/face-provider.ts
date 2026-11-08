import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { env } from '../config/env';

/**
 * Contrato com o provedor de reconhecimento facial com prova de vida.
 *
 * Para plugar um provedor real (unico IDCloud, AWS Rekognition, Serpro Datavalid...):
 *  1. implemente esta interface num arquivo `<provedor>-face-provider.ts`;
 *  2. acrescente o nome em FACE_PROVIDER (config/env.ts), com as variáveis de credencial;
 *  3. registre a classe em `createFaceProvider` abaixo;
 *  4. no web, troque a captura em `components/face-capture.tsx` pelo SDK do provedor,
 *     usando o `clientConfig` devolvido por `startSession`.
 * O resto (consentimento, regras, propostas, moderação, auditoria) não muda.
 */
export interface FaceSessionStart {
  /** Identificador da sessão no provedor (ex.: SessionId da AWS, token da unico). */
  sessionRef: string;
  /** Vai para o componente de captura no navegador (chaves públicas, região, URL do SDK...). Nada secreto. */
  clientConfig: Record<string, unknown>;
}

export interface LivenessResult {
  live: boolean;
  /** 0 a 1. */
  score: number;
  /** Imagem de referência que o provedor devolve (ou a que o navegador enviou, no simulado). */
  image?: Buffer;
  reason?: string;
}

export interface FaceProvider {
  readonly name: string;
  startSession(args: { userId: string; purpose: string }): Promise<FaceSessionStart>;
  /**
   * Resultado da prova de vida. `evidence` é o que o navegador enviou: no simulado, a
   * foto da câmera; em provedores com SDK próprio, normalmente nada (o resultado está no provedor).
   */
  getLiveness(sessionRef: string, evidence?: Buffer): Promise<LivenessResult>;
  /** Cadastra o rosto e devolve a referência guardada pelo provedor. */
  enroll(args: { userId: string; sessionRef: string; image?: Buffer }): Promise<{ subjectRef: string }>;
  /** Compara o rosto da sessão com o cadastrado. Score de 0 a 1. */
  verify(args: { subjectRef: string; sessionRef: string; image?: Buffer }): Promise<{ score: number }>;
  /** Semelhança entre a selfie e a foto do documento, se o provedor oferecer. Apoio à moderação. */
  compareWithDocument?(args: { image: Buffer; document: Buffer }): Promise<{ score: number }>;
  /** Apaga o rosto no provedor (retirada de consentimento, recusa, exclusão de conta). */
  deleteSubject(subjectRef: string): Promise<void>;
}

export const FACE_PROVIDER = Symbol('FACE_PROVIDER');

/**
 * Provedor simulado, para desenvolvimento e testes. Aceita qualquer imagem válida
 * como "viva" e como "o mesmo rosto". NÃO verifica nada de verdade: em produção,
 * só sobe com FACE_FAKE_ALLOWED_IN_PRODUCTION=true, de propósito.
 * FACE_FAKE_RESULT=fail faz tudo reprovar, para testar os caminhos de erro.
 */
export class FakeFaceProvider implements FaceProvider {
  readonly name = 'fake';
  private readonly fail = env.FACE_FAKE_RESULT === 'fail';

  async startSession() {
    return { sessionRef: `fake_session_${randomUUID()}`, clientConfig: { mode: 'camera' } };
  }

  async getLiveness(_sessionRef: string, evidence?: Buffer): Promise<LivenessResult> {
    if (!evidence) return { live: false, score: 0, reason: 'Nenhuma imagem recebida' };
    const meta = await sharp(evidence).metadata().catch(() => null);
    if (!meta?.width || !meta.height) return { live: false, score: 0, reason: 'Imagem inválida' };
    if (meta.width < 64 || meta.height < 64) return { live: false, score: 0.1, reason: 'Imagem pequena demais' };
    return this.fail ? { live: false, score: 0.2, reason: 'Simulado: prova de vida reprovada' } : { live: true, score: 0.98, image: evidence };
  }

  async enroll() { return { subjectRef: `fake_subject_${randomUUID()}` }; }

  async verify() { return { score: this.fail ? 0.3 : 0.97 }; }

  async compareWithDocument() { return { score: this.fail ? 0.3 : 0.95 }; }

  async deleteSubject() { /* nada guardado no simulado */ }
}

export function createFaceProvider(): FaceProvider {
  switch (env.FACE_PROVIDER) {
    case 'fake': return new FakeFaceProvider();
  }
}
