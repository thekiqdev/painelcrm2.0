/**
 * Job: cancela faturas pendentes com mais de 48h e reverte tenants para trial.
 * Uso: agendar no cron (ex.: 0 * * * * = a cada hora)
 *   cd packages/backend && npx tsx src/scripts/cancelExpiredBillings.ts
 * Ou: npm run cancel-expired-billings
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { cancelExpiredPendingBillings } from '../services/subscriptionService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../..');
const rootEnv = path.resolve(rootDir, '.env');
dotenv.config({ path: rootEnv });
dotenv.config();

const EXPIRE_HOURS = process.env.BILLING_EXPIRE_HOURS ? parseInt(process.env.BILLING_EXPIRE_HOURS, 10) : 48;

async function main() {
  try {
    const result = await cancelExpiredPendingBillings(EXPIRE_HOURS);
    console.log(
      `[cancel-expired-billings] Faturas canceladas: ${result.cancelledBillings}, tenants revertidos: ${result.revertedTenants}`
    );
    process.exit(0);
  } catch (err) {
    console.error('[cancel-expired-billings] Erro:', err);
    process.exit(1);
  }
}

main();
