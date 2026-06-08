/**

 * Outbox publisher worker — shadow/passive dispatch P0.

 * Uso one-shot: npx tsx src/scripts/runOutboxPublisherWorker.ts

 * Loop: OUTBOX_WORKER_LOOP=true npx tsx src/scripts/runOutboxPublisherWorker.ts

 */

import dotenv from 'dotenv';

import path from 'path';

import { fileURLToPath } from 'url';

import {

  runOutboxPublisherBatch,

  requestOutboxPublisherShutdown,

} from '../outbox/outboxPublisherWorker.js';

import { refreshPlatformFeatureFlagRegistry } from '../platform/featureFlagRegistry.js';

import { endDatabasePool } from '../utils/db.js';

import { runWorker } from '../workerRuntime/workerRuntime.js';

import { workerDefaultPollIntervalMs } from '../workerRuntime/workerConfig.js';



const __dirname = path.dirname(fileURLToPath(import.meta.url));

const root = path.resolve(__dirname, '../../../../..');

dotenv.config({ path: path.join(root, '.env') });

dotenv.config();



const workerId = process.env.OUTBOX_WORKER_ID ?? `outbox-${process.pid}`;

const loop = process.env.OUTBOX_WORKER_LOOP === 'true';



async function main() {

  await refreshPlatformFeatureFlagRegistry();

  await runWorker({

    workerType: 'outbox.publisher',

    workerId,

    loop,

    pollIntervalMs: workerDefaultPollIntervalMs(),

    onSignalShutdown: () => requestOutboxPublisherShutdown(),

    onFinalFlush: async () => {

      await endDatabasePool().catch(() => undefined);

    },

    runBatch: async (ctx) => {

      const result = await runOutboxPublisherBatch(workerId);

      await ctx.pulse({ outbox: result });

      if (!loop) {

        console.log('[OUTBOX_WORKER]', JSON.stringify({ workerId, ...result, ts: new Date().toISOString() }));

      }

      return result;

    },

  });

  if (loop) {

    await endDatabasePool().catch(() => undefined);

  }

}



main().catch((e) => {

  console.error(e);

  process.exit(1);

});


