/**
 * Suspender tenants com trial vencido (cron diário ou horário).
 * Ex.: npx tsx src/scripts/runTrialExpiration.ts
 * Requer TRIAL_EXPIRATION_JOB=true no ambiente.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { expireTrialsPastDue } from '../services/subscriptionService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config();

async function main() {
  const r = await expireTrialsPastDue();
  console.log('[trial-expiration]', r);
  process.exit(0);
}

main().catch((e) => {
  console.error('[trial-expiration] fatal', e);
  process.exit(1);
});
