import type { AuditChange } from '@ergatis/shared';

/**
 * O que nunca entra na trilha, nem como valor antigo nem como novo.
 * Na dúvida, não gravar: um campo omitido custa uma investigação; um token gravado,
 * um incidente.
 */
const REDACTED_FIELDS = new Set(['password', 'senha', 'token', 'secret', 'accessToken', 'refreshToken', 'idToken', 'url']);
const REDACTED_SUFFIXES = ['Password', 'Token', 'Secret', 'Hash', 'Key'];
/** Dados que identificam a pessoa: entram mascarados, não em claro. */
const MASKED_FIELDS = new Set(['phone', 'latitude', 'longitude']);

const REDACTED = '[omitido]';

export const isRedactedField = (field: string) =>
  REDACTED_FIELDS.has(field) || REDACTED_SUFFIXES.some((s) => field.endsWith(s));

const mask = (value: unknown) => {
  if (value === null || value === undefined || value === '') return value;
  const text = String(value);
  return text.length <= 4 ? '***' : `***${text.slice(-2)}`;
};

/** Aplica a política a um objeto solto (metadata), em profundidade. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [
    k,
    isRedactedField(k) ? REDACTED : MASKED_FIELDS.has(k) ? mask(v) : redact(v, depth + 1),
  ]));
}

const CONTROL_FIELDS = new Set(['id', 'createdAt', 'updatedAt']);

const normalize = (v: unknown) => (v instanceof Date ? v.toISOString() : v === undefined ? null : v);
const same = (a: unknown, b: unknown) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));

/**
 * Campos que mudaram entre `before` e `after`. Só compara as chaves de `fields`
 * quando informado; caso contrário, as de `after` (o que a operação tocou).
 * Campos sensíveis aparecem como alterados, mas sem os valores.
 */
export function diff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  fields?: readonly string[],
): AuditChange[] {
  const keys = fields ?? Object.keys(after ?? {});
  const changes: AuditChange[] = [];
  for (const field of keys) {
    if (CONTROL_FIELDS.has(field)) continue;
    const from = before?.[field];
    const to = after?.[field];
    if (same(from, to)) continue;
    if (isRedactedField(field)) changes.push({ field, from: REDACTED, to: REDACTED });
    else if (MASKED_FIELDS.has(field)) changes.push({ field, from: mask(from), to: mask(to) });
    else changes.push({ field, from: normalize(from), to: normalize(to) });
  }
  return changes;
}
