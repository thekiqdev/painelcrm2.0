export function workerHeartbeatIntervalSeconds(): number {
  return Math.max(5, parseInt(process.env.WORKER_HEARTBEAT_INTERVAL_SECONDS || '30', 10));
}

export function workerStaleMinutes(): number {
  return Math.max(1, parseInt(process.env.WORKER_STALE_MINUTES || '15', 10));
}

export function workerShutdownTimeoutSeconds(): number {
  return Math.max(5, parseInt(process.env.WORKER_SHUTDOWN_TIMEOUT_SECONDS || '120', 10));
}

export function workerReclaimBatchSize(): number {
  return Math.min(500, Math.max(1, parseInt(process.env.WORKER_RECLAIM_BATCH_SIZE || '50', 10)));
}

export function workerDefaultPollIntervalMs(): number {
  return Math.max(500, parseInt(process.env.WORKER_POLL_INTERVAL_MS || '2000', 10));
}
