import { randomUUID } from 'crypto';
import { runWithRequestContext } from '../context/requestContext.js';
import {
  workerDefaultPollIntervalMs,
  workerHeartbeatIntervalSeconds,
  workerShutdownTimeoutSeconds,
} from './workerConfig.js';
import { isWorkerHeartbeatEnabled, isWorkerReclaimEnabled, isWorkerRuntimeEnabled } from './workerFlags.js';
import { upsertWorkerHeartbeat } from './workerHeartbeatRepository.js';
import { reclaimStaleWorkerHeartbeats } from './workerReclaimService.js';
import { logWorker, logWorkerHeartbeat, logWorkerShutdown } from './workerLogger.js';
import type { RunWorkerOptions, WorkerBatchContext } from './workerTypes.js';

let globalShutdownRequested = false;
let signalsRegistered = false;

export function isWorkerShutdownRequested(): boolean {
  return globalShutdownRequested;
}

export function requestWorkerShutdown(): void {
  globalShutdownRequested = true;
}

function registerSignalHandlers(onSignalShutdown?: () => void): void {
  if (signalsRegistered) return;
  signalsRegistered = true;

  const handler = (signal: string) => {
    logWorkerShutdown('signal_received', { signal });
    globalShutdownRequested = true;
    onSignalShutdown?.();
  };

  process.on('SIGINT', () => handler('SIGINT'));
  process.on('SIGTERM', () => handler('SIGTERM'));
}

async function touchHeartbeat(
  input: {
    workerId: string;
    workerType: string;
    status: 'starting' | 'healthy' | 'degraded' | 'shutting_down' | 'stopped' | 'failed';
    correlationId: string;
    metadata?: Record<string, unknown>;
    lastSuccess?: boolean;
    lastError?: boolean;
    lockToken?: string | null;
    clearLock?: boolean;
  },
  heartbeatOn: boolean,
): Promise<void> {
  if (!heartbeatOn) return;
  await upsertWorkerHeartbeat({
    workerId: input.workerId,
    workerType: input.workerType,
    status: input.status,
    correlationId: input.correlationId,
    metadata: input.metadata,
    lastSuccess: input.lastSuccess,
    lastError: input.lastError,
    lockToken: input.lockToken,
    clearLock: input.clearLock,
  });
  logWorkerHeartbeat('tick', {
    worker_id: input.workerId,
    worker_type: input.workerType,
    status: input.status,
  });
}

/**
 * Enterprise worker lifecycle: startup → batch(es) → graceful shutdown.
 * When flags OFF, still handles signals and structured logs without DB heartbeat.
 */
export async function runWorker<T>(options: RunWorkerOptions<T>): Promise<T | undefined> {
  const runtimeOn = await isWorkerRuntimeEnabled();
  const heartbeatOn = await isWorkerHeartbeatEnabled();
  const workerId = options.workerId ?? `${options.workerType}-${process.pid}`;
  const correlationId = options.correlationId ?? randomUUID();
  const loop = options.loop === true;
  const pollMs = options.pollIntervalMs ?? workerDefaultPollIntervalMs();

  globalShutdownRequested = false;
  registerSignalHandlers(options.onSignalShutdown);

  logWorker('startup', {
    worker_id: workerId,
    worker_type: options.workerType,
    correlation_id: correlationId,
    loop,
    runtime_on: runtimeOn,
    heartbeat_on: heartbeatOn,
  });

  let lastResult: T | undefined;
  let batchNumber = 0;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  if (loop && heartbeatOn) {
    const intervalMs = workerHeartbeatIntervalSeconds() * 1000;
    heartbeatTimer = setInterval(() => {
      void touchHeartbeat(
        {
          workerId,
          workerType: options.workerType,
          status: 'healthy',
          correlationId,
          metadata: { phase: 'interval_heartbeat', batch_number: batchNumber },
        },
        true,
      );
    }, intervalMs);
    heartbeatTimer.unref?.();
  }

  await runWithRequestContext(
    {
      correlationId,
      workerName: options.workerType,
    },
    async () => {
      await touchHeartbeat(
        { workerId, workerType: options.workerType, status: 'starting', correlationId },
        heartbeatOn,
      );

      do {
        if (globalShutdownRequested) break;

        batchNumber += 1;

        if (await isWorkerReclaimEnabled()) {
          await reclaimStaleWorkerHeartbeats();
        }

        const ctx: WorkerBatchContext = {
          workerId,
          workerType: options.workerType,
          correlationId,
          batchNumber,
          isShutdownRequested: () => globalShutdownRequested,
          pulse: async (metadata) => {
            await touchHeartbeat(
              {
                workerId,
                workerType: options.workerType,
                status: 'healthy',
                correlationId,
                metadata: { batch_number: batchNumber, ...metadata },
              },
              heartbeatOn,
            );
          },
          acquireLock: async (token) => {
            await touchHeartbeat(
              {
                workerId,
                workerType: options.workerType,
                status: 'healthy',
                correlationId,
                lockToken: token,
                metadata: { batch_number: batchNumber, lock_acquired: true },
              },
              heartbeatOn,
            );
          },
          releaseLock: async () => {
            await touchHeartbeat(
              {
                workerId,
                workerType: options.workerType,
                status: 'healthy',
                correlationId,
                clearLock: true,
                metadata: { batch_number: batchNumber, lock_released: true },
              },
              heartbeatOn,
            );
          },
        };

        const batchStarted = Date.now();
        await touchHeartbeat(
          {
            workerId,
            workerType: options.workerType,
            status: 'healthy',
            correlationId,
            metadata: { batch_number: batchNumber, phase: 'batch_start' },
          },
          heartbeatOn,
        );

        try {
          lastResult = await options.runBatch(ctx);
          const durationMs = Date.now() - batchStarted;
          await touchHeartbeat(
            {
              workerId,
              workerType: options.workerType,
              status: 'healthy',
              correlationId,
              lastSuccess: true,
              clearLock: true,
              metadata: {
                batch_number: batchNumber,
                phase: 'batch_success',
                duration_ms: durationMs,
              },
            },
            heartbeatOn,
          );
          logWorker('batch_complete', {
            worker_id: workerId,
            batch_number: batchNumber,
            duration_ms: durationMs,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await touchHeartbeat(
            {
              workerId,
              workerType: options.workerType,
              status: 'degraded',
              correlationId,
              lastError: true,
              clearLock: true,
              metadata: { batch_number: batchNumber, error: message },
            },
            heartbeatOn,
          );
          logWorker('batch_error', { worker_id: workerId, batch_number: batchNumber, error: message });
          throw err;
        }

        if (!loop || globalShutdownRequested) break;
        await new Promise((r) => setTimeout(r, pollMs));
      } while (loop && !globalShutdownRequested);
    },
  );

  if (heartbeatTimer) clearInterval(heartbeatTimer);

  await touchHeartbeat(
    {
      workerId,
      workerType: options.workerType,
      status: globalShutdownRequested ? 'shutting_down' : 'stopped',
      correlationId,
      metadata: { batches: batchNumber },
    },
    heartbeatOn,
  );

  if (options.onFinalFlush) {
    const flushTimeout = workerShutdownTimeoutSeconds() * 1000;
    await Promise.race([
      options.onFinalFlush(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('onFinalFlush timeout')), flushTimeout),
      ),
    ]).catch((err) => {
      logWorkerShutdown('final_flush_error', {
        worker_id: workerId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  await touchHeartbeat(
    {
      workerId,
      workerType: options.workerType,
      status: 'stopped',
      correlationId,
      metadata: { batches: batchNumber, shutdown: globalShutdownRequested },
    },
    heartbeatOn,
  );

  logWorkerShutdown('complete', {
    worker_id: workerId,
    worker_type: options.workerType,
    correlation_id: correlationId,
    batches: batchNumber,
    graceful: globalShutdownRequested,
  });

  return lastResult;
}
