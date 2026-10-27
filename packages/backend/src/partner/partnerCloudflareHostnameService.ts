/**
 * PE Etapa 3 — provisiona/desprovisiona Custom Hostname Partner na Cloudflare.
 * Falhas CF não revertem domain_status=active (posse TXT já ok).
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
} from './cloudflareCustomHostnameClient.js';
import { isPartnerEdgeCloudflareSaasEnabled } from './partnerFlags.js';

export type PartnerCfSyncSnapshot = {
  cf_custom_hostname_id: string | null;
  cf_ssl_status: string | null;
  cf_ownership_status: string | null;
  cf_last_sync_at: string | null;
  cf_last_error: string | null;
};

function mapFromCf(row: CloudflareCustomHostname): Omit<PartnerCfSyncSnapshot, 'cf_last_error' | 'cf_last_sync_at'> {
  return {
    cf_custom_hostname_id: row.id,
    cf_ssl_status: row.ssl?.status ?? null,
    cf_ownership_status: row.status ?? null,
  };
}

async function persistCfState(
  partnerTenantId: string,
  state: {
    cf_custom_hostname_id?: string | null;
    cf_ssl_status?: string | null;
    cf_ownership_status?: string | null;
    cf_last_error?: string | null;
    clearAll?: boolean;
    /** Se true, grava ids/status mesmo quando null (sucesso provision). */
    replaceIdentity?: boolean;
  }
): Promise<void> {
  if (state.clearAll) {
    await pool.query(
      `UPDATE partner_profiles
       SET cf_custom_hostname_id = NULL,
           cf_ssl_status = NULL,
           cf_ownership_status = NULL,
           cf_last_sync_at = now(),
           cf_last_error = NULL,
           updated_at = now()
       WHERE partner_tenant_id = $1`,
      [partnerTenantId]
    );
    return;
  }
  if (state.replaceIdentity) {
    await pool.query(
      `UPDATE partner_profiles
       SET cf_custom_hostname_id = $2,
           cf_ssl_status = $3,
           cf_ownership_status = $4,
           cf_last_sync_at = now(),
           cf_last_error = $5,
           updated_at = now()
       WHERE partner_tenant_id = $1`,
      [
        partnerTenantId,
        state.cf_custom_hostname_id ?? null,
        state.cf_ssl_status ?? null,
        state.cf_ownership_status ?? null,
        state.cf_last_error ?? null,
      ]
    );
    return;
  }
  await pool.query(
    `UPDATE partner_profiles
     SET cf_last_sync_at = now(),
         cf_last_error = $2,
         updated_at = now()
     WHERE partner_tenant_id = $1`,
    [partnerTenantId, state.cf_last_error ?? null]
  );
}

export async function loadPartnerCfSnapshot(
  partnerTenantId: string
): Promise<PartnerCfSyncSnapshot | null> {
  const res = await pool.query<PartnerCfSyncSnapshot>(
    `SELECT cf_custom_hostname_id, cf_ssl_status, cf_ownership_status,
            cf_last_sync_at::text, cf_last_error
     FROM partner_profiles
     WHERE partner_tenant_id = $1`,
    [partnerTenantId]
  );
  return res.rows[0] ?? null;
}

/**
 * Após domain_status=active: cria (ou reusa) Custom Hostname.
 * No-op se flag OFF ou API não configurada.
 */
export async function provisionPartnerCloudflareHostname(input: {
  partnerTenantId: string;
  hostname: string;
}): Promise<void> {
  const enabled = await isPartnerEdgeCloudflareSaasEnabled({
    tenantId: input.partnerTenantId,
  });
  if (!enabled) return;
  if (!isCloudflareSaasApiConfigured()) {
    console.warn('[partner-cf] edge flag ON mas CF_SAAS_* ausente', {
      partnerTenantId: input.partnerTenantId,
    });
    await persistCfState(input.partnerTenantId, {
      cf_last_error: 'CF_SAAS_ZONE_ID / CF_SAAS_API_TOKEN não configurados',
    });
    return;
  }

  const hostname = input.hostname.trim().toLowerCase();
  try {
    const existing = await loadPartnerCfSnapshot(input.partnerTenantId);
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
    await persistCfState(input.partnerTenantId, {
      ...mapped,
      cf_last_error: null,
      replaceIdentity: true,
    });
    console.info('[partner-cf] provisioned', {
      partnerTenantId: input.partnerTenantId,
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
    console.warn('[partner-cf] provision_failed', {
      partnerTenantId: input.partnerTenantId,
      hostname,
      error: message,
    });
    await persistCfState(input.partnerTenantId, {
      cf_last_error: message.slice(0, 500),
    });
  }
}

/**
 * No clear: remove Custom Hostname se houver id (mesmo com flag OFF — limpeza).
 */
export async function deprovisionPartnerCloudflareHostname(input: {
  partnerTenantId: string;
}): Promise<void> {
  const snap = await loadPartnerCfSnapshot(input.partnerTenantId);
  const id = snap?.cf_custom_hostname_id;
  const hostnameRes = await pool.query<{ custom_domain: string | null }>(
    `SELECT custom_domain FROM partner_profiles WHERE partner_tenant_id = $1`,
    [input.partnerTenantId]
  );
  const hostname = hostnameRes.rows[0]?.custom_domain ?? null;

  if (!id && !hostname) {
    await persistCfState(input.partnerTenantId, { clearAll: true });
    return;
  }

  if (!isCloudflareSaasApiConfigured()) {
    console.warn('[partner-cf] deprovision sem CF_SAAS_*; limpando espelho local', {
      partnerTenantId: input.partnerTenantId,
    });
    await persistCfState(input.partnerTenantId, { clearAll: true });
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
    await persistCfState(input.partnerTenantId, { clearAll: true });
    console.info('[partner-cf] deprovisioned', {
      partnerTenantId: input.partnerTenantId,
      cfId: deleteId,
    });
  } catch (err) {
    const message =
      err instanceof CloudflareApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'erro desconhecido';
    console.warn('[partner-cf] deprovision_failed', {
      partnerTenantId: input.partnerTenantId,
      error: message,
    });
    await persistCfState(input.partnerTenantId, {
      cf_last_error: `clear: ${message}`.slice(0, 500),
    });
  }
}

/** Atualiza espelho ssl/status a partir da CF (idempotente). */
export async function syncPartnerCloudflareHostnameStatus(input: {
  partnerTenantId: string;
}): Promise<PartnerCfSyncSnapshot | null> {
  const enabled = await isPartnerEdgeCloudflareSaasEnabled({
    tenantId: input.partnerTenantId,
  });
  if (!enabled || !isCloudflareSaasApiConfigured()) {
    return loadPartnerCfSnapshot(input.partnerTenantId);
  }
  const snap = await loadPartnerCfSnapshot(input.partnerTenantId);
  if (!snap?.cf_custom_hostname_id) return snap;
  try {
    const row = await getCustomHostname(snap.cf_custom_hostname_id);
    const mapped = mapFromCf(row);
    await persistCfState(input.partnerTenantId, {
      ...mapped,
      cf_last_error: null,
      replaceIdentity: true,
    });
    return loadPartnerCfSnapshot(input.partnerTenantId);
  } catch (err) {
    const message =
      err instanceof CloudflareApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'erro desconhecido';
    await persistCfState(input.partnerTenantId, {
      cf_last_error: message.slice(0, 500),
    });
    return loadPartnerCfSnapshot(input.partnerTenantId);
  }
}
