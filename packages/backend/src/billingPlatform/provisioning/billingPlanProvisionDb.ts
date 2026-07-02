/**
 * Sprint 4.0A.1 — DB session for provision/repair (RLS-safe).
 */
import type { PoolClient } from 'pg';
import { dbRequestStorage, withTenantRlsContext } from '../../utils/db.js';

export async function runProvisionTransaction<T>(
  tenantId: string,
  work: (client: PoolClient) => Promise<T>
): Promise<T> {
  const store = dbRequestStorage.getStore();
  if (store?.client) {
    await store.client.query('BEGIN');
    try {
      const result = await work(store.client);
      await store.client.query('COMMIT');
      return result;
    } catch (error) {
      await store.client.query('ROLLBACK');
      throw error;
    }
  }

  return withTenantRlsContext(tenantId, async () => {
    const ctx = dbRequestStorage.getStore();
    const client = ctx?.client;
    if (!client) {
      throw new Error('billing_provision_rls_context_missing');
    }
    await client.query('BEGIN');
    try {
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}
