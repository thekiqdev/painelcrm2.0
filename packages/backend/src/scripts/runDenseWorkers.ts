/**
 * Processo isolado dos workers densos (MB-015).
 * Uso: HTTP_SKIP_DENSE_WORKERS=1 no API + npm run workers:dense
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { pool } from '../utils/db.js';
import { appLogger, refreshLogLevelFromEnv } from '../observability/appLogger.js';
import {
  startDenseBackgroundWorkers,
  stopDenseBackgroundWorkers,
} from '../workers/denseWorkerBootstrap.js';

async function main(): Promise<void> {
  refreshLogLevelFromEnv();
  await pool.query('SELECT 1');
  appLogger.boot('workers:dense', 'connected to PostgreSQL');
  const handles = startDenseBackgroundWorkers(pool);

  const shutdown = (signal: string) => {
    appLogger.boot('workers:dense', `shutdown ${signal}`);
    stopDenseBackgroundWorkers(handles);
    void pool.end().finally(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  appLogger.error('workers:dense', 'fatal', { err: String(err) });
  process.exit(1);
});
