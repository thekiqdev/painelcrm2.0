import { pool } from '../utils/db.js';
import {
  API_KEY_PREFIX_LENGTH,
  API_KEY_SCOPE_LEADS_CREATE,
  apiKeyHashMatches,
  apiKeyPrefix,
  generateApiKeySecret,
  hashApiKey,
} from './apiKeyCrypto.js';

export class ApiKeyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiKeyValidationError';
  }
}

export class ApiKeyNotFoundError extends Error {
  constructor() {
    super('Chave não encontrada');
    this.name = 'ApiKeyNotFoundError';
  }
}

export type ApiKeyPublic = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export type ApiKeyCreated = ApiKeyPublic & { key: string };

export type ResolvedApiKey = {
  id: string;
  tenant_id: string;
  owner_user_id: string;
  scopes: string[];
};

type ApiKeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[] | null;
  created_at: Date | string;
  last_used_at: Date | string | null;
  revoked_at: Date | string | null;
};

const NAME_MAX = 80;
const INSERT_ATTEMPTS = 5;

export function normalizeApiKeyName(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new ApiKeyValidationError('Informe um nome para a chave.');
  }
  const name = raw.trim();
  if (name.length < 1 || name.length > NAME_MAX) {
    throw new ApiKeyValidationError('O nome da chave deve ter entre 1 e 80 caracteres.');
  }
  return name;
}

function toIso(value: Date | string | null): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function toPublic(row: ApiKeyRow): ApiKeyPublic {
  return {
    id: row.id,
    name: row.name,
    key_prefix: row.key_prefix,
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    created_at: toIso(row.created_at) ?? new Date(0).toISOString(),
    last_used_at: toIso(row.last_used_at),
    revoked_at: toIso(row.revoked_at),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
}

export async function createApiKey(input: {
  tenantId: string;
  userId: string;
  name: string;
}): Promise<ApiKeyCreated> {
  const name = normalizeApiKeyName(input.name);
  let lastError: unknown;
  for (let attempt = 0; attempt < INSERT_ATTEMPTS; attempt++) {
    const secret = generateApiKeySecret();
    const prefix = apiKeyPrefix(secret);
    const hash = hashApiKey(secret);
    try {
      const result = await pool.query<ApiKeyRow>(
        `INSERT INTO api_keys (
           tenant_id, owner_user_id, created_by, name, key_prefix, key_hash, scopes
         ) VALUES ($1, $2, $2, $3, $4, $5, $6)
         RETURNING id, name, key_prefix, scopes, created_at, last_used_at, revoked_at`,
        [input.tenantId, input.userId, name, prefix, hash, [API_KEY_SCOPE_LEADS_CREATE]]
      );
      const row = result.rows[0];
      if (!row) throw new Error('createApiKey: no row');
      return { ...toPublic(row), key: secret };
    } catch (error) {
      if (isUniqueViolation(error)) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  console.error('createApiKey: esgotou tentativas de prefixo único');
  throw lastError instanceof Error ? lastError : new Error('Não foi possível gerar a chave.');
}

export async function listApiKeys(tenantId: string): Promise<ApiKeyPublic[]> {
  const result = await pool.query<ApiKeyRow>(
    `SELECT id, name, key_prefix, scopes, created_at, last_used_at, revoked_at
     FROM api_keys
     WHERE tenant_id = $1
     ORDER BY created_at DESC`,
    [tenantId]
  );
  return result.rows.map(toPublic);
}

export async function revokeApiKey(tenantId: string, id: string): Promise<ApiKeyPublic> {
  const result = await pool.query<ApiKeyRow>(
    `UPDATE api_keys
     SET revoked_at = COALESCE(revoked_at, now())
     WHERE id = $1 AND tenant_id = $2
     RETURNING id, name, key_prefix, scopes, created_at, last_used_at, revoked_at`,
    [id, tenantId]
  );
  const row = result.rows[0];
  if (!row) throw new ApiKeyNotFoundError();
  return toPublic(row);
}

type AuthRow = {
  id: string;
  tenant_id: string;
  owner_user_id: string;
  key_hash: string;
  scopes: string[] | null;
  revoked_at: Date | string | null;
};

/**
 * Confere o segredo. Chave revogada, prefixo desconhecido ou hash diferente → null.
 * Não grava o segredo em log.
 */
export async function resolveApiKey(secret: string): Promise<ResolvedApiKey | null> {
  if (typeof secret !== 'string') return null;
  const trimmed = secret.trim();
  if (!trimmed.startsWith('pcrm_') || trimmed.length <= API_KEY_PREFIX_LENGTH) return null;
  const prefix = apiKeyPrefix(trimmed);
  const result = await pool.query<AuthRow>(
    `SELECT id, tenant_id, owner_user_id, key_hash, scopes, revoked_at
     FROM api_keys
     WHERE key_prefix = $1`,
    [prefix]
  );
  for (const row of result.rows) {
    if (!apiKeyHashMatches(trimmed, row.key_hash)) continue;
    if (row.revoked_at != null) return null;
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      owner_user_id: row.owner_user_id,
      scopes: Array.isArray(row.scopes) ? row.scopes : [],
    };
  }
  return null;
}
