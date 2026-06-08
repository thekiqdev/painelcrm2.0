import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { pool } from '../utils/db.js';
import { featureFlagRegistry } from '../platform/featureFlagRegistry.js';
import { getAcquisitionPublicConfig } from '../acquisition/acquisitionFlags.js';

const keys = [
  'acquisition.master_off',
  'acquisition.signup_flow_v1',
  'acquisition.pre_signup_v1',
];

async function main() {
  const r = await pool.query(
    `SELECT key, default_enabled, kill_switch_key, rollout_type
     FROM platform_feature_flags WHERE key = ANY($1::text[])`,
    [keys],
  );
  console.log('DB rows:', JSON.stringify(r.rows, null, 2));

  featureFlagRegistry.invalidateCache();
  await featureFlagRegistry.refresh();

  for (const k of keys) {
    const res = await featureFlagRegistry.resolve(k, {});
    console.log('resolve', k, res);
  }

  const pub = await getAcquisitionPublicConfig();
  console.log('getAcquisitionPublicConfig:', pub);

  await endDatabasePool();
}

async function endDatabasePool() {
  const { endDatabasePool: end } = await import('../utils/db.js');
  await end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
