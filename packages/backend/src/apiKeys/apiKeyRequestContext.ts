import { dbRequestStorage, escapeSetLocalAppValue, pool } from '../utils/db.js';
import { resolveApiKey, type ResolvedApiKey } from './apiKeyService.js';

const TENANT_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ApiKeyTransactionResult<T> = { ok: false } | { ok: true; value: T };

/**
 * Lê a chave com bypass de RLS (o tenant ainda é desconhecido) e executa `work`
 * na mesma transação, já com `app.current_tenant_id` do dono.
 * Não registra o segredo.
 */
export async function withApiKeyTransaction<T>(
  secret: string,
  work: (key: ResolvedApiKey) => Promise<T>
): Promise<ApiKeyTransactionResult<T>> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.bypass_rls', '1', true)`);
    const key = await dbRequestStorage.run({ client }, () => resolveApiKey(secret));
    await client.query(`SELECT set_config('app.bypass_rls', '', true)`);
    if (!key || !TENANT_UUID.test(key.tenant_id)) {
      await client.query('COMMIT');
      return { ok: false };
    }
    const safeTenant = escapeSetLocalAppValue(key.tenant_id);
    await client.query(`SELECT set_config('app.current_tenant_id', '${safeTenant}', true)`);
    const value = await dbRequestStorage.run({ client }, () => work(key));
    await client.query('COMMIT');
    return { ok: true, value };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* transação já encerrada */
    }
    throw error;
  } finally {
    client.release();
  }
}
