import { pool } from '../utils/db.js';

export type MatchEntityType = 'client' | 'lead' | 'none';
export type MatchConfidence = 'high_confidence' | 'ambiguous' | 'none';

export interface MatchCandidateSummary {
  id: string;
  type: 'client' | 'lead';
}

export interface ConversationMatchResult {
  normalizedPhone: string | null;
  suggestedType: MatchEntityType;
  suggestedId: string | null;
  confidence: MatchConfidence;
  candidates: MatchCandidateSummary[];
}

export interface ResolveConversationMatchInput {
  tenantId: string;
  rawPhone: string | null | undefined;
}

/**
 * Normalização canônica (escopo BR):
 * - mantém apenas dígitos;
 * - formatos locais (10/11) => prefixa DDI 55;
 * - formatos com DDI BR (12/13 iniciando com 55) => mantém;
 * - demais formatos => null (evita heurística arriscada).
 */
export function normalizeConversationPhone(phone: string | null | undefined): string | null {
  if (!phone || typeof phone !== 'string') return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    return digits;
  }
  return null;
}

function toResult(
  normalizedPhone: string | null,
  suggestedType: MatchEntityType,
  suggestedId: string | null,
  confidence: MatchConfidence,
  candidates: MatchCandidateSummary[]
): ConversationMatchResult {
  return { normalizedPhone, suggestedType, suggestedId, confidence, candidates };
}

/**
 * Matching determinístico tenant-scoped.
 * Precedência:
 * - cliente (quando único) > lead (quando único)
 * - qualquer ambiguidade => não vincula automaticamente
 */
export async function resolveConversationMatch(
  input: ResolveConversationMatchInput
): Promise<ConversationMatchResult> {
  const normalizedPhone = normalizeConversationPhone(input.rawPhone);
  if (!normalizedPhone) {
    return toResult(null, 'none', null, 'none', []);
  }

  const clients = await pool.query<{ id: string }>(
    `
    SELECT c.id
    FROM clients c
    INNER JOIN users u ON u.id = c.user_id
    WHERE u.tenant_id = $1
      AND c.phone IS NOT NULL
      AND c.phone <> ''
      AND (
        regexp_replace(c.phone, '\\D', '', 'g') = $2
        OR regexp_replace(c.phone, '\\D', '', 'g') = substring($2 from 3)
      )
    ORDER BY c.created_at DESC
    `,
    [input.tenantId, normalizedPhone]
  );

  if (clients.rows.length > 1) {
    return toResult(
      normalizedPhone,
      'none',
      null,
      'ambiguous',
      clients.rows.map((r) => ({ id: r.id, type: 'client' }))
    );
  }
  if (clients.rows.length === 1) {
    return toResult(
      normalizedPhone,
      'client',
      clients.rows[0].id,
      'high_confidence',
      [{ id: clients.rows[0].id, type: 'client' }]
    );
  }

  const leads = await pool.query<{ id: string }>(
    `
    SELECT l.id
    FROM leads l
    INNER JOIN users u ON u.id = l.user_id
    WHERE u.tenant_id = $1
      AND l.phone IS NOT NULL
      AND l.phone <> ''
      AND (
        regexp_replace(l.phone, '\\D', '', 'g') = $2
        OR regexp_replace(l.phone, '\\D', '', 'g') = substring($2 from 3)
      )
    ORDER BY l.created_at DESC
    `,
    [input.tenantId, normalizedPhone]
  );

  if (leads.rows.length > 1) {
    return toResult(
      normalizedPhone,
      'none',
      null,
      'ambiguous',
      leads.rows.map((r) => ({ id: r.id, type: 'lead' }))
    );
  }
  if (leads.rows.length === 1) {
    return toResult(
      normalizedPhone,
      'lead',
      leads.rows[0].id,
      'high_confidence',
      [{ id: leads.rows[0].id, type: 'lead' }]
    );
  }

  return toResult(normalizedPhone, 'none', null, 'none', []);
}
