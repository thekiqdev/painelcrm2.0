import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import { logCorrelation, logRequestContext } from '../platform/platformFeatureFlagLogger.js';

export const CORRELATION_HEADER = 'x-correlation-id';

export type RequestContextStore = {
  correlationId: string;
  method?: string;
  path?: string;
  userId?: string;
  tenantId?: string;
  workerName?: string;
};

export const requestContextStorage = new AsyncLocalStorage<RequestContextStore>();

export function getRequestContext(): RequestContextStore | undefined {
  return requestContextStorage.getStore();
}

export function getCorrelationId(): string | undefined {
  return requestContextStorage.getStore()?.correlationId;
}

export function requireCorrelationId(): string {
  return getCorrelationId() ?? randomUUID();
}

export function mergeRequestContext(patch: Partial<RequestContextStore>): void {
  const store = requestContextStorage.getStore();
  if (!store) return;
  Object.assign(store, patch);
  if (patch.userId || patch.tenantId) {
    logRequestContext('context_enriched', {
      correlation_id: store.correlationId,
      user_id: store.userId,
      tenant_id: store.tenantId,
      worker: store.workerName,
    });
  }
}

/**
 * Executa trabalho (worker, job) com correlation explícita — compatível com outbox futuro.
 */
export async function runWithRequestContext<T>(
  seed: Partial<RequestContextStore> & { correlationId?: string },
  fn: () => Promise<T>,
): Promise<T> {
  const correlationId = seed.correlationId ?? randomUUID();
  const ctx: RequestContextStore = {
    correlationId,
    method: seed.method,
    path: seed.path,
    userId: seed.userId,
    tenantId: seed.tenantId,
    workerName: seed.workerName,
  };
  logCorrelation('worker_context_start', {
    correlation_id: correlationId,
    worker: seed.workerName,
  });
  return requestContextStorage.run(ctx, fn);
}

export function parseCorrelationHeader(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length < 8 || trimmed.length > 128) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}
