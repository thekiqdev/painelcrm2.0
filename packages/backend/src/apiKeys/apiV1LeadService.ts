import { createHash } from 'crypto';
import { pool } from '../utils/db.js';
import { isApiKeysEnabled } from './apiKeyFlags.js';
import { API_KEY_SCOPE_LEADS_CREATE } from './apiKeyCrypto.js';
import { withApiKeyTransaction } from './apiKeyRequestContext.js';
import type { ResolvedApiKey } from './apiKeyService.js';
import {
  LeadValidationError,
  resolveTenantLeadStatus,
  insertLead,
  prepareLeadFields,
  type LeadWriteInput,
} from '../services/leadCreateService.js';
import { ensureDefaultLeadStatuses } from '../services/leadStatusDefaults.js';
import { commercialAccessBlock, planPeriodBlock } from '../services/tenantAccessGate.js';
import { logApiV1Request } from './apiV1UsageLog.js';
import { emitToTenant } from '../services/realtimeService.js';

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const PUBLIC_LEAD_FIELDS = new Set([
  'name',
  'email',
  'phone',
  'company',
  'source',
  'status',
  'observacao',
  'cpf_cnpj',
]);

export type PublicLead = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string;
  status: string | null;
  observacao: string | null;
  cpf_cnpj: string | null;
  created_at: string;
};

export type PublicLeadResult = { status: number; body: Record<string, unknown> };

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

export function hashIdempotencyBody(body: unknown): string {
  return createHash('sha256').update(stableStringify(body), 'utf8').digest('hex');
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return new Date(0).toISOString();
}

export function toPublicLead(row: Record<string, unknown>): PublicLead {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    email: row.email == null ? null : String(row.email),
    phone: row.phone == null ? null : String(row.phone),
    company: row.company == null ? null : String(row.company),
    source: String(row.source ?? ''),
    status: row.status == null ? null : String(row.status),
    observacao: row.observacao == null ? null : String(row.observacao),
    cpf_cnpj: row.cpf_cnpj == null ? null : String(row.cpf_cnpj),
    created_at: toIso(row.created_at),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
}

type IdemRow = {
  id: string;
  request_hash: string;
  status_code: number;
  response_body: Record<string, unknown>;
  created_at: Date | string;
};

async function findIdempotency(apiKeyId: string, tenantId: string, idemKey: string): Promise<IdemRow | null> {
  const result = await pool.query<IdemRow>(
    `SELECT id, request_hash, status_code, response_body, created_at
     FROM api_idempotency_keys
     WHERE api_key_id = $1 AND tenant_id = $2 AND idem_key = $3`,
    [apiKeyId, tenantId, idemKey]
  );
  return result.rows[0] ?? null;
}

function replayOrConflict(row: IdemRow, requestHash: string): PublicLeadResult | null {
  const age = Date.now() - new Date(row.created_at).getTime();
  if (age >= IDEMPOTENCY_TTL_MS) return null;
  if (row.request_hash === requestHash) {
    return { status: row.status_code, body: row.response_body };
  }
  return {
    status: 409,
    body: {
      error: 'Idempotency-Key já usada com outro corpo.',
      code: 'IDEMPOTENCY_CONFLICT',
    },
  };
}

async function storeIdempotency(
  key: ResolvedApiKey,
  idemKey: string,
  requestHash: string,
  status: number,
  body: Record<string, unknown>
): Promise<PublicLeadResult | null> {
  try {
    await pool.query('SAVEPOINT api_v1_idem');
    await pool.query(
      `INSERT INTO api_idempotency_keys (
         api_key_id, tenant_id, idem_key, request_hash, status_code, response_body
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [key.id, key.tenant_id, idemKey, requestHash, status, JSON.stringify(body)]
    );
    await pool.query('RELEASE SAVEPOINT api_v1_idem');
    return null;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    await pool.query('ROLLBACK TO SAVEPOINT api_v1_idem');
    const again = await findIdempotency(key.id, key.tenant_id, idemKey);
    if (!again) throw error;
    return (
      replayOrConflict(again, requestHash) ?? {
        status: 409,
        body: { error: 'Idempotency-Key já usada com outro corpo.', code: 'IDEMPOTENCY_CONFLICT' },
      }
    );
  }
}

async function touchLastUsed(key: ResolvedApiKey): Promise<void> {
  await pool.query(
    `UPDATE api_keys
     SET last_used_at = now()
     WHERE id = $1 AND tenant_id = $2 AND revoked_at IS NULL`,
    [key.id, key.tenant_id]
  );
}

async function createForKey(
  key: ResolvedApiKey,
  body: unknown,
  idempotencyKey: string | null
): Promise<PublicLeadResult> {
  const enabled = await isApiKeysEnabled({ tenantId: key.tenant_id, userId: key.owner_user_id });
  if (!enabled) {
    return { status: 404, body: { error: 'Not found', code: 'API_KEYS_DISABLED' } };
  }
  if (!key.scopes.includes(API_KEY_SCOPE_LEADS_CREATE)) {
    return { status: 403, body: { error: 'Escopo insuficiente.', code: 'API_KEY_SCOPE' } };
  }

  const commercial = await commercialAccessBlock(key.tenant_id);
  if (commercial) return { status: commercial.status, body: commercial.body };
  const period = await planPeriodBlock(key.tenant_id);
  if (period) return { status: period.status, body: period.body };

  await touchLastUsed(key);

  const requestHash = hashIdempotencyBody(body);
  if (idempotencyKey) {
    const existing = await findIdempotency(key.id, key.tenant_id, idempotencyKey);
    if (existing) {
      const age = Date.now() - new Date(existing.created_at).getTime();
      if (age >= IDEMPOTENCY_TTL_MS) {
        await pool.query(`DELETE FROM api_idempotency_keys WHERE id = $1 AND tenant_id = $2`, [
          existing.id,
          key.tenant_id,
        ]);
      } else {
        const replay = replayOrConflict(existing, requestHash);
        if (replay) return replay;
      }
    }
  }

  let result: PublicLeadResult;
  try {
    result = await writeLead(key, body, idempotencyKey, requestHash);
  } catch (error) {
    if (!(error instanceof LeadValidationError)) throw error;
    result = { status: 400, body: { error: error.message } };
    if (idempotencyKey) {
      const raced = await storeIdempotency(key, idempotencyKey, requestHash, result.status, result.body);
      if (raced) return raced;
    }
  }
  return result;
}

async function writeLead(
  key: ResolvedApiKey,
  body: unknown,
  idempotencyKey: string | null,
  requestHash: string
): Promise<PublicLeadResult> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new LeadValidationError('Corpo inválido.');
  }
  const record = body as Record<string, unknown>;
  const rejected = Object.keys(record).filter((field) => !PUBLIC_LEAD_FIELDS.has(field));
  if (rejected.length > 0) {
    throw new LeadValidationError('Campo não permitido.');
  }

  const prepared = prepareLeadFields(
    {
      name: typeof record.name === 'string' ? record.name : '',
      email: record.email as LeadWriteInput['email'],
      phone: record.phone as LeadWriteInput['phone'],
      company: record.company as LeadWriteInput['company'],
      source: record.source as LeadWriteInput['source'],
      status: record.status as LeadWriteInput['status'],
      observacao: record.observacao as LeadWriteInput['observacao'],
      cpf_cnpj: record.cpf_cnpj as LeadWriteInput['cpf_cnpj'],
    },
    'API'
  );
  await ensureDefaultLeadStatuses(key.tenant_id, key.owner_user_id);
  if (prepared.status) {
    prepared.status = await resolveTenantLeadStatus(key.tenant_id, prepared.status);
  }

  await pool.query('SAVEPOINT api_v1_lead');
  try {
    const row = await insertLead(key.owner_user_id, { ...prepared, profile_id: null });
    const publicLead = toPublicLead(row);
    const response: PublicLeadResult = { status: 201, body: { ...publicLead } };
    if (idempotencyKey) {
      await pool.query(
        `INSERT INTO api_idempotency_keys (
           api_key_id, tenant_id, idem_key, request_hash, status_code, response_body
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [key.id, key.tenant_id, idempotencyKey, requestHash, 201, JSON.stringify(response.body)]
      );
    }
    await pool.query('RELEASE SAVEPOINT api_v1_lead');
    return response;
  } catch (error) {
    if (!(idempotencyKey && isUniqueViolation(error))) throw error;
    await pool.query('ROLLBACK TO SAVEPOINT api_v1_lead');
    const again = await findIdempotency(key.id, key.tenant_id, idempotencyKey);
    if (!again) throw error;
    return (
      replayOrConflict(again, requestHash) ?? {
        status: 409,
        body: { error: 'Idempotency-Key já usada com outro corpo.', code: 'IDEMPOTENCY_CONFLICT' },
      }
    );
  }
}

export async function createPublicLead(input: {
  secret: string;
  body: unknown;
  idempotencyKey: string | null;
}): Promise<PublicLeadResult> {
  let keyId: string | null = null;
  let tenantId: string | null = null;
  const tx = await withApiKeyTransaction(input.secret, (key) => {
    keyId = key.id;
    tenantId = key.tenant_id;
    return createForKey(key, input.body, input.idempotencyKey);
  });
  const result: PublicLeadResult = tx.ok
    ? tx.value
    : { status: 401, body: { error: 'API key inválida.' } };
  logApiV1Request({ keyId, route: 'POST /api/v1/leads', status: result.status });
  if (result.status === 201 && tenantId) {
    try {
      emitToTenant(tenantId, 'lead.created', {});
    } catch {
      /* o menu também atualiza na consulta seguinte */
    }
  }
  return result;
}
