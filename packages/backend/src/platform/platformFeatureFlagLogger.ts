/**
 * Logs estruturados P0 — prefixos oficiais Sprint 1.
 */

export type PlatformLogPayload = Record<string, unknown>;

function emit(prefix: string, msg: string, payload?: PlatformLogPayload): void {
  const base = { prefix, msg, ...payload };
  if (process.env.NODE_ENV === 'production' && prefix === '[FEATURE_FLAG]' && !payload?.important) {
    return;
  }
  console.info(JSON.stringify(base));
}

export function logFeatureFlag(msg: string, payload?: PlatformLogPayload): void {
  emit('[FEATURE_FLAG]', msg, payload);
}

export function logCorrelation(msg: string, payload?: PlatformLogPayload): void {
  emit('[CORRELATION]', msg, payload);
}

export function logRequestContext(msg: string, payload?: PlatformLogPayload): void {
  emit('[REQUEST_CONTEXT]', msg, payload);
}
