/**
 * TE Sprint 2 — provisiona/desprovisiona Custom Hostname de tenant_hosts na Cloudflare.
 * Reusa client PE (`partner/cloudflareCustomHostnameClient`).
 */

import { pool } from '../utils/db.js';
import { isCloudflareSaasApiConfigured } from '../config/partnerCloudflareSaasEnv.js';
import {
  CloudflareApiError,
  createCustomHostname,
  deleteCustomHostname,
  findCustomHostnameByHostname,
  getCustomHostname,
  type CloudflareCustomHostname,
} from '../partner/cloudflareCustomHostnameClient.js';
import { isTenantEdgeCloudflareSaasEnabled } from './tenantDomainFlags.js';

export type TenantHostCfSnapshot = {
  id: string;
  hostname: string;
  tenant_id: string;
  cf_custom_hostname_id: string | null;
  cf_ssl_status: string | null;
  cf_ownership_status: string | null;
  cf_last_sync_at: string | null;
  cf_last_error: string | null;
};

function mapFromCf(row: CloudflareCustomHostname): {
  cf_custom_hostname_id: string;
  cf_ssl_status: string | null;
  cf_ownership_status: string | null;
} {
  return {
    cf_custom_hostname_id: row.id,
    cf_ssl_status: row.ssl?.status ?? null,
    cf_ownership_status: row.status ?? null,
  };
}

async function persistCfState(
  hostId: string,
  state: {
    cf_custom_hostname_id?: string | null;
    cf_ssl_status?: string | null;
    cf_ownership_status?: string | null;
    cf_last_error?: string | null;
    clearAll?: boolean;
    replaceIdentity?: boolean;
  }
): Promise<void> {
  if (state.clearAll) {
    await pool.query(
      `UPDATE tenant_hosts
       SET cf_custom_hostname_id = NULL,
           cf_ssl_status = NULL,
           cf_ownership_status = NULL,
           cf_last_sync_at = now(),
           cf_last_error = NULL,
           updated_at = now()
       WHERE id = $1`,
      [hostId]
    );
    return;
  }
  if (state.replaceIdentity) {
    await pool.query(
      `UPDATE tenant_hosts
       SET cf_custom_hostname_id = $2,
           cf_ssl_status = $3,
           cf_ownership_status = $4,
           cf_last_sync_at = now(),
           cf_last_error = $5,
           updated_at = now()
       WHERE id = $1`,
      [
        hostId,
        state.cf_custom_hostname_id ?? null,
        state.cf_ssl_status ?? null,
        state.cf_ownership_status ?? null,
        state.cf_last_error ?? null,
      ]
    );
    return;
  }
  await pool.query(
    `UPDATE tenant_hosts
     SET cf_last_sync_at = now(),
         cf_last_error = $2,
         updated_at = now()
     WHERE id = $1`,
    [hostId, state.cf_last_error ?? null]
  );
}

export async function loadTenantHostCfSnapshot(
  hostId: string
): Promise<TenantHostCfSnapshot | null> {
  const res = await pool.query<TenantHostCfSnapshot>(
    `SELECT id, hostname, tenant_id,
            cf_custom_hostname_id, cf_ssl_status, cf_ownership_status,
            cf_last_sync_at::text, cf_last_error
     FROM tenant_hosts
     WHERE id = $1`,
    [hostId]
  );
  return res.rows[0] ?? null;
}

export async function provisionTenantCloudflareHostname(input: {
  hostId: string;
  tenantId: string;
  hostname: string;
}): Promise<void> {
  const enabled = await isTenantEdgeCloudflareSaasEnabled({
    tenantId: input.tenantId,
  });
  if (!enabled) return;
  if (!isCloudflareSaasApiConfigured()) {
    console.warn('[tenant-cf] edge flag ON mas CF_SAAS_* ausente', {
      hostId: input.hostId,
      tenantId: input.tenantId,
    });
    await persistCfState(input.hostId, {
      cf_last_error: 'CF_SAAS_ZONE_ID / CF_SAAS_API_TOKEN não configurados',
    });
    return;
  }

  const hostname = input.hostname.trim().toLowerCase();
  try {
    const existing = await loadTenantHostCfSnapshot(input.hostId);
    let row: CloudflareCustomHostname | null = null;

    if (existing?.cf_custom_hostname_id) {
      try {
        row = await getCustomHostname(existing.cf_custom_hostname_id);
        if (row.hostname?.toLowerCase() !== hostname) {
          await deleteCustomHostname(existing.cf_custom_hostname_id);
          row = null;
        }
      } catch (err) {
        if (err instanceof CloudflareApiError && err.status === 404) {
          row = null;
        } else {
          throw err;
        }
      }
    }

    if (!row) {
      row = await findCustomHostnameByHostname(hostname);
    }
    if (!row) {
      row = await createCustomHostname(hostname);
    }

    const mapped = mapFromCf(row);
    await persistCfState(input.hostId, {
      ...mapped,
      cf_last_error: null,
      replaceIdentity: true,
    });
    console.info('[tenant-cf] provisioned', {
      hostId: input.hostId,
      tenantId: input.tenantId,
      hostname,
      cfId: row.id,
      ssl: row.ssl?.status,
      status: row.status,
    });
  } catch (err) {
    const message =
      err instanceof CloudflareApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'erro desconhecido';
    console.warn('[tenant-cf] provision_failed', {
      hostId: input.hostId,
      hostname,
      error: message,
    });
    await persistCfState(input.hostId, {
      cf_last_error: message.slice(0, 500),
    });
  }
}

/** Antes do DELETE do host — remove Custom Hostname se houver. */
export async function deprovisionTenantCloudflareHostname(input: {
  hostId: string;
  hostname?: string | null;
  cfCustomHostnameId?: string | null;
}): Promise<void> {
  const snap = await loadTenantHostCfSnapshot(input.hostId);
  const id = input.cfCustomHostnameId ?? snap?.cf_custom_hostname_id ?? null;
  const hostname = input.hostname ?? snap?.hostname ?? null;

  if (!id && !hostname) {
    await persistCfState(input.hostId, { clearAll: true }).catch(() => undefined);
    return;
  }

  if (!isCloudflareSaasApiConfigured()) {
    console.warn('[tenant-cf] deprovision sem CF_SAAS_*; limpando espelho local', {
      hostId: input.hostId,
    });
    await persistCfState(input.hostId, { clearAll: true }).catch(() => undefined);
    return;
  }

  try {
    let deleteId = id;
    if (!deleteId && hostname) {
      const found = await findCustomHostnameByHostname(hostname);
      deleteId = found?.id ?? null;
    }
    if (deleteId) {
      try {
        await deleteCustomHostname(deleteId);
      } catch (err) {
        if (!(err instanceof CloudflareApiError && err.status === 404)) {
          throw err;
        }
      }
    }
    await persistCfState(input.hostId, { clearAll: true }).catch(() => undefined);
    console.info('[tenant-cf] deprovisioned', {
      hostId: input.hostId,
      cfId: deleteId,
    });
  } catch (err) {
    const message =
      err instanceof CloudflareApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'erro desconhecido';
    console.warn('[tenant-cf] deprovision_failed', {
      hostId: input.hostId,
      error: message,
    });
  }
}

/** Atualiza espelho ssl/status a partir da CF (idempotente). */
export async function syncTenantCloudflareHostnameStatus(input: {
  hostId: string;
  tenantId: string;
}): Promise<TenantHostCfSnapshot | null> {
  const enabled = await isTenantEdgeCloudflareSaasEnabled({
    tenantId: input.tenantId,
  });
  if (!enabled || !isCloudflareSaasApiConfigured()) {
    return loadTenantHostCfSnapshot(input.hostId);
  }
  const snap = await loadTenantHostCfSnapshot(input.hostId);
  if (!snap?.cf_custom_hostname_id) return snap;
  try {
    const row = await getCustomHostname(snap.cf_custom_hostname_id);
    const mapped = mapFromCf(row);
    await persistCfState(input.hostId, {
      ...mapped,
      cf_last_error: null,
      replaceIdentity: true,
    });
    return loadTenantHostCfSnapshot(input.hostId);
  } catch (err) {
    const message =
      err instanceof CloudflareApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'erro desconhecido';
    await persistCfState(input.hostId, {
      cf_last_error: message.slice(0, 500),
    });
    return loadTenantHostCfSnapshot(input.hostId);
  }
}
