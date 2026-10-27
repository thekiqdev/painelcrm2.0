/**
 * PE Etapa 3 — cliente HTTP Cloudflare Custom Hostnames (Zone API).
 * @see https://developers.cloudflare.com/api/resources/custom_hostnames/
 */

import {
  getCloudflareSaasApiToken,
  getCloudflareSaasZoneId,
} from '../config/partnerCloudflareSaasEnv.js';

export type CloudflareCustomHostname = {
  id: string;
  hostname: string;
  status: string;
  ssl?: { status?: string; method?: string } | null;
};

export class CloudflareApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public cfErrors?: unknown
  ) {
    super(message);
    this.name = 'CloudflareApiError';
  }
}

type CfEnvelope<T> = {
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result?: T;
  result_info?: unknown;
};

function authHeaders(): { zoneId: string; token: string } {
  const zoneId = getCloudflareSaasZoneId();
  const token = getCloudflareSaasApiToken();
  if (!zoneId || !token) {
    throw new CloudflareApiError('Cloudflare SaaS não configurado (CF_SAAS_ZONE_ID / CF_SAAS_API_TOKEN)', 0);
  }
  return { zoneId, token };
}

async function cfFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const { zoneId, token } = authHeaders();
  const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  let body: CfEnvelope<T> | null = null;
  try {
    body = (await res.json()) as CfEnvelope<T>;
  } catch {
    throw new CloudflareApiError(`Cloudflare resposta inválida (HTTP ${res.status})`, res.status);
  }
  if (!res.ok || !body?.success) {
    const msg =
      body?.errors?.map((e) => e.message).filter(Boolean).join('; ') ||
      `Cloudflare HTTP ${res.status}`;
    throw new CloudflareApiError(msg, res.status, body?.errors);
  }
  return body.result as T;
}

/** Cria Custom Hostname. SSL HTTP DCV (tráfego já via CNAME do canal). */
export async function createCustomHostname(hostname: string): Promise<CloudflareCustomHostname> {
  return cfFetch<CloudflareCustomHostname>('/custom_hostnames', {
    method: 'POST',
    body: JSON.stringify({
      hostname,
      ssl: {
        method: 'http',
        type: 'dv',
        settings: { min_tls_version: '1.2' },
      },
    }),
  });
}

export async function getCustomHostname(id: string): Promise<CloudflareCustomHostname> {
  return cfFetch<CloudflareCustomHostname>(`/custom_hostnames/${encodeURIComponent(id)}`);
}

/** Busca por hostname exato (lista filtrada). */
export async function findCustomHostnameByHostname(
  hostname: string
): Promise<CloudflareCustomHostname | null> {
  const host = hostname.trim().toLowerCase();
  const result = await cfFetch<CloudflareCustomHostname[]>(
    `/custom_hostnames?hostname=${encodeURIComponent(host)}`
  );
  if (!Array.isArray(result) || result.length === 0) return null;
  const exact = result.find((r) => r.hostname?.toLowerCase() === host);
  return exact ?? result[0] ?? null;
}

export async function deleteCustomHostname(id: string): Promise<void> {
  await cfFetch<unknown>(`/custom_hostnames/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
