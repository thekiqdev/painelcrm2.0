import { pool } from '../utils/db.js';
import { appLogger } from '../observability/appLogger.js';

/** Apaga respostas de Idempotency-Key com mais de 24 h, em todos os tenants. */
export async function purgeExpiredApiIdempotencyKeys(): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.bypass_rls', '1', false)`);
    const result = await client.query(
      `DELETE FROM api_idempotency_keys WHERE created_at < now() - interval '24 hours'`
    );
    return result.rowCount ?? 0;
  } finally {
    try {
      await client.query(`SELECT set_config('app.bypass_rls', '', false)`);
    } catch {
      /* não impedir o release */
    }
    client.release();
  }
}

export function startApiIdempotencyPurge(intervalMs = 60 * 60 * 1000): void {
  const run = () => {
    void purgeExpiredApiIdempotencyKeys()
      .then((deleted) => {
        if (deleted > 0) {
          appLogger.info('api-keys', 'idempotency purge', { deleted });
        }
      })
      .catch((error: unknown) => {
        appLogger.error('api-keys', 'idempotency purge failed', {
          error: error instanceof Error ? error.name : 'error',
        });
      });
  };
  run();
  setInterval(run, intervalMs);
}
