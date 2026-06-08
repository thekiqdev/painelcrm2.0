/** Backoff P0: 30s, 2m, 10m, 30m, 2h, 6h, 12h, 24h */
const BACKOFF_SECONDS = [30, 120, 600, 1800, 7200, 21600, 43200, 86400] as const;

export const OUTBOX_DEFAULT_MAX_ATTEMPTS = 8;

export function computeNextRetryAt(attemptsAfterFailure: number, from: Date = new Date()): Date {
  const idx = Math.min(Math.max(attemptsAfterFailure - 1, 0), BACKOFF_SECONDS.length - 1);
  const delaySec = BACKOFF_SECONDS[idx] ?? BACKOFF_SECONDS[BACKOFF_SECONDS.length - 1];
  return new Date(from.getTime() + delaySec * 1000);
}

export function stalePublishingThresholdMs(): number {
  return parseInt(process.env.OUTBOX_STALE_PUBLISHING_MS || '300000', 10);
}

export function outboxPublisherBatchSize(): number {
  return Math.min(500, Math.max(1, parseInt(process.env.OUTBOX_PUBLISHER_BATCH_SIZE || '100', 10)));
}
