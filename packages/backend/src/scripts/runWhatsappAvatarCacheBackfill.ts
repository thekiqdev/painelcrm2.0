/**
 * Backfill: tenta cache local para conversas e CRM ainda com URL CDN WhatsApp.
 * Uso: cd packages/backend && npx tsx src/scripts/runWhatsappAvatarCacheBackfill.ts [limitePorTipo]
 * Variável opcional: AVATAR_BACKFILL_BATCH (default 30)
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { endDatabasePool } from '../utils/db.js';
import { runWhatsappAvatarCacheBackfillBatch } from '../services/whatsappAvatarBackfillService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config();

async function main(): Promise<void> {
  const perType = Math.max(1, parseInt(process.argv[2] || process.env.AVATAR_BACKFILL_BATCH || '30', 10));
  const result = await runWhatsappAvatarCacheBackfillBatch(perType);
  console.log('[avatar-cache-backfill]', result);
  await endDatabasePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
