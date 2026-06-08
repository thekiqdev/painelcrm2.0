import { isWorkerHealthEnabled } from './workerFlags.js';
import { listWorkerHeartbeats, platformWorkerHeartbeatTableExists } from './workerHeartbeatRepository.js';
import { workerStaleMinutes } from './workerConfig.js';
import { logWorkerHealth } from './workerLogger.js';
import type { WorkerHealthSnapshot } from './workerTypes.js';

export async function getWorkerHealthSnapshot(): Promise<WorkerHealthSnapshot> {
  const enabled = await isWorkerHealthEnabled();
  const tablePresent = await platformWorkerHeartbeatTableExists();

  if (!enabled || !tablePresent) {
    return { enabled: false, workers: [], stale_count: 0, degraded_count: 0 };
  }

  const staleMinutes = workerStaleMinutes();
  const now = Date.now();
  const rows = await listWorkerHeartbeats();

  const workers = rows.map((row) => {
    const lastHb = new Date(row.last_heartbeat_at).getTime();
    const started = new Date(row.started_at).getTime();
    const age_seconds = Math.round((now - lastHb) / 1000);
    const uptime_seconds = Math.round((now - started) / 1000);
    const stale = age_seconds > staleMinutes * 60;
    return {
      ...row,
      age_seconds,
      uptime_seconds,
      stale,
    };
  });

  const snapshot: WorkerHealthSnapshot = {
    enabled: true,
    workers,
    stale_count: workers.filter((w) => w.stale).length,
    degraded_count: workers.filter((w) => w.status === 'degraded' || w.status === 'failed').length,
  };

  logWorkerHealth('snapshot', {
    worker_count: workers.length,
    stale_count: snapshot.stale_count,
    degraded_count: snapshot.degraded_count,
  });

  return snapshot;
}

export async function listStaleWorkers(): Promise<WorkerHealthSnapshot['workers']> {
  const snap = await getWorkerHealthSnapshot();
  return snap.workers.filter((w) => w.stale);
}
