type Payload = Record<string, unknown>;

function emit(msg: string, payload: Payload = {}): void {
  console.log(
    JSON.stringify({
      prefix: '[tenant-domain]',
      msg,
      ...payload,
      ts: new Date().toISOString(),
    })
  );
}

/** Log estruturado (sem tokens de verificação). */
export function logTenantDomain(msg: string, payload?: Payload): void {
  const safe = { ...(payload || {}) };
  delete safe.verification_token;
  delete safe.txt_value;
  delete safe.token;
  emit(msg, safe);
}
