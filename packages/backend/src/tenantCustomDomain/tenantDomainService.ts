/**
 * TD Sprint 1 — set / verify / clear de tenant_hosts (store | support).
 */

import { randomBytes } from 'node:crypto';
import dns from 'node:dns/promises';
import { pool } from '../utils/db.js';
import { normalizeHostname } from '../partner/partnerBrandResolver.js';
import {
  getTenantCustomDomainBlockedHosts,
  getTenantCustomDomainCnameTarget,
  isTenantCustomDomainEnabled,
  isTenantDomainVerifyBypassEnabled,
  isTenantHostRole,
  type TenantHostRole,
} from './tenantDomainFlags.js';
import { TenantDomainError } from './tenantDomainErrors.js';
import { invalidateCorsOriginsCache } from '../config/corsOrigins.js';

const TXT_LABEL = '_painelcrm-tenant';

export type TenantHostRow = {
  id: string;
  tenant_id: string;
  hostname: string;
  role: TenantHostRole;
  status: string;
  verification_token: string | null;
  verified_at: string | null;
  activated_at: string | null;
  last_check_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type TenantDomainInstructions = {
  id: string;
  tenant_id: string;
  hostname: string;
  role: TenantHostRole;
  status: string;
  verification_token: string;
  txt_host: string;
  txt_value: string;
  cname_host: string;
  cname_target: string;
  bypass_enabled: boolean;
  /** TD S4 — URL pública preferida quando status=active */
  canonical_public_url: string | null;
};

export type VerifyTenantDomainResult = {
  verified: boolean;
  status: string;
  method: 'txt' | 'cname' | 'bypass' | 'none';
  instructions: TenantDomainInstructions | null;
};

function generateToken(): string {
  return randomBytes(16).toString('hex');
}

async function assertFeatureEnabled(tenantId: string): Promise<void> {
  const on = await isTenantCustomDomainEnabled({ tenantId });
  if (!on) {
    throw new TenantDomainError(
      'Domínio personalizado do tenant não está habilitado',
      'FEATURE_DISABLED',
      403
    );
  }
}

async function assertPlatformCustomer(tenantId: string): Promise<void> {
  const r = await pool.query<{ account_type: string | null }>(
    `SELECT account_type FROM tenants WHERE id = $1`,
    [tenantId]
  );
  const accountType = r.rows[0]?.account_type;
  if (!accountType) {
    throw new TenantDomainError('Tenant não encontrado', 'TENANT_NOT_FOUND', 404);
  }
  if (accountType !== 'platform_customer') {
    throw new TenantDomainError(
      'Domínio personalizado só para clientes Platform (platform_customer)',
      'TENANT_NOT_ELIGIBLE',
      403
    );
  }
}

async function assertHostnameAvailable(
  hostname: string,
  tenantId: string,
  exceptHostId?: string | null
): Promise<void> {
  const partner = await pool.query(
    `SELECT partner_tenant_id FROM partner_profiles
     WHERE custom_domain IS NOT NULL
       AND lower(custom_domain) = $1
       AND domain_status IN ('verified', 'active', 'pending')
     LIMIT 1`,
    [hostname]
  );
  if (partner.rows.length > 0) {
    throw new TenantDomainError(
      'Domínio já em uso por um Partner',
      'DOMAIN_TAKEN_PARTNER',
      409
    );
  }

  const other = await pool.query(
    `SELECT id, tenant_id FROM tenant_hosts
     WHERE lower(hostname) = $1
       AND ($2::uuid IS NULL OR id <> $2)
     LIMIT 1`,
    [hostname, exceptHostId ?? null]
  );
  if (other.rows.length > 0) {
    const row = other.rows[0] as { tenant_id: string };
    if (row.tenant_id === tenantId) {
      throw new TenantDomainError(
        'Este hostname já está cadastrado em outro papel deste tenant',
        'DOMAIN_TAKEN_ROLE',
        409
      );
    }
    throw new TenantDomainError('Domínio já em uso por outro tenant', 'DOMAIN_TAKEN', 409);
  }
}

function mapInstructions(
  row: TenantHostRow,
  bypass_enabled: boolean
): TenantDomainInstructions {
  const token = row.verification_token || '';
  const canonical_public_url =
    row.status === 'active' && row.hostname
      ? `https://${row.hostname.trim().toLowerCase()}`
      : null;
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    hostname: row.hostname,
    role: row.role,
    status: row.status,
    verification_token: token,
    txt_host: `${TXT_LABEL}.${row.hostname}`,
    txt_value: token,
    cname_host: row.hostname,
    cname_target: getTenantCustomDomainCnameTarget(),
    bypass_enabled,
    canonical_public_url,
  };
}

async function getHostById(id: string): Promise<TenantHostRow | null> {
  const r = await pool.query<TenantHostRow>(
    `SELECT id, tenant_id, hostname, role, status, verification_token,
            verified_at::text, activated_at::text, last_check_at::text, last_error,
            created_at::text, updated_at::text
     FROM tenant_hosts WHERE id = $1`,
    [id]
  );
  return r.rows[0] ?? null;
}

export async function listTenantHosts(tenantId: string): Promise<TenantHostRow[]> {
  const r = await pool.query<TenantHostRow>(
    `SELECT id, tenant_id, hostname, role, status, verification_token,
            verified_at::text, activated_at::text, last_check_at::text, last_error,
            created_at::text, updated_at::text
     FROM tenant_hosts
     WHERE tenant_id = $1
     ORDER BY role ASC, created_at ASC`,
    [tenantId]
  );
  return r.rows;
}

export async function getTenantHostByRole(
  tenantId: string,
  role: TenantHostRole
): Promise<TenantHostRow | null> {
  const r = await pool.query<TenantHostRow>(
    `SELECT id, tenant_id, hostname, role, status, verification_token,
            verified_at::text, activated_at::text, last_check_at::text, last_error,
            created_at::text, updated_at::text
     FROM tenant_hosts
     WHERE tenant_id = $1 AND role = $2
       AND status IN ('pending', 'verified', 'active')
     LIMIT 1`,
    [tenantId, role]
  );
  return r.rows[0] ?? null;
}

export async function getTenantDomainInstructions(
  tenantId: string,
  role?: TenantHostRole | null
): Promise<TenantDomainInstructions | TenantDomainInstructions[] | null> {
  await assertFeatureEnabled(tenantId);
  const bypass = await isTenantDomainVerifyBypassEnabled({ tenantId });
  if (role) {
    const row = await getTenantHostByRole(tenantId, role);
    if (!row?.verification_token) return null;
    return mapInstructions(row, bypass);
  }
  const rows = await listTenantHosts(tenantId);
  const usable = rows.filter((r) => r.status !== 'none' && r.verification_token);
  if (usable.length === 0) return [];
  return usable.map((r) => mapInstructions(r, bypass));
}

/**
 * Cadastra ou atualiza hostname para um papel (store|support).
 * Status volta para pending com novo token.
 */
export async function setTenantDomain(input: {
  tenantId: string;
  hostnameRaw: string;
  role: string;
}): Promise<TenantDomainInstructions> {
  if (!isTenantHostRole(input.role)) {
    throw new TenantDomainError(
      'role inválido — use store (loja) ou support (abertura de chamados)',
      'ROLE_INVALID'
    );
  }
  const role = input.role;

  await assertFeatureEnabled(input.tenantId);
  await assertPlatformCustomer(input.tenantId);

  const hostname = normalizeHostname(input.hostnameRaw);
  if (!hostname || !hostname.includes('.')) {
    throw new TenantDomainError('Domínio inválido', 'DOMAIN_INVALID');
  }

  const blocked = getTenantCustomDomainBlockedHosts();
  if (blocked.includes(hostname)) {
    throw new TenantDomainError('Domínio não permitido', 'DOMAIN_BLOCKED');
  }

  const existing = await getTenantHostByRole(input.tenantId, role);
  await assertHostnameAvailable(hostname, input.tenantId, existing?.id ?? null);

  const token = generateToken();
  let row: TenantHostRow;

  if (existing) {
    const upd = await pool.query<TenantHostRow>(
      `UPDATE tenant_hosts
       SET hostname = $1,
           status = 'pending',
           verification_token = $2,
           verified_at = NULL,
           activated_at = NULL,
           last_check_at = NULL,
           last_error = NULL,
           updated_at = now()
       WHERE id = $3
       RETURNING id, tenant_id, hostname, role, status, verification_token,
                 verified_at::text, activated_at::text, last_check_at::text, last_error,
                 created_at::text, updated_at::text`,
      [hostname, token, existing.id]
    );
    row = upd.rows[0];
  } else {
    const ins = await pool.query<TenantHostRow>(
      `INSERT INTO tenant_hosts (tenant_id, hostname, role, status, verification_token)
       VALUES ($1, $2, $3, 'pending', $4)
       RETURNING id, tenant_id, hostname, role, status, verification_token,
                 verified_at::text, activated_at::text, last_check_at::text, last_error,
                 created_at::text, updated_at::text`,
      [input.tenantId, hostname, role, token]
    );
    row = ins.rows[0];
  }

  const bypass = await isTenantDomainVerifyBypassEnabled({ tenantId: input.tenantId });
  invalidateCorsOriginsCache();
  return mapInstructions(row, bypass);
}

async function checkTxt(hostname: string, token: string): Promise<boolean> {
  const names = [`${TXT_LABEL}.${hostname}`, hostname];
  for (const name of names) {
    try {
      const records = await dns.resolveTxt(name);
      const flat = records.map((chunks) => chunks.join('')).join(' ');
      if (flat.includes(token)) return true;
      if (flat.includes(`painelcrm-tenant-verify=${token}`)) return true;
    } catch {
      /* NXDOMAIN */
    }
  }
  return false;
}

async function checkCname(hostname: string): Promise<boolean> {
  const target = getTenantCustomDomainCnameTarget();
  try {
    const records = await dns.resolveCname(hostname);
    return records.some((r) => normalizeHostname(r) === target);
  } catch {
    return false;
  }
}

export async function verifyTenantDomain(input: {
  tenantId: string;
  role: string;
}): Promise<VerifyTenantDomainResult> {
  await assertFeatureEnabled(input.tenantId);
  if (!isTenantHostRole(input.role)) {
    throw new TenantDomainError(
      'role inválido — use store ou support',
      'ROLE_INVALID'
    );
  }

  let row = await getTenantHostByRole(input.tenantId, input.role);
  if (!row) {
    throw new TenantDomainError('Nenhum domínio configurado para este uso', 'DOMAIN_MISSING');
  }
  if (!row.verification_token) {
    const regenerated = await setTenantDomain({
      tenantId: input.tenantId,
      hostnameRaw: row.hostname,
      role: input.role,
    });
    row = (await getHostById(regenerated.id))!;
  }

  const token = row.verification_token!;
  let method: VerifyTenantDomainResult['method'] = 'none';
  let ok = false;

  if (await isTenantDomainVerifyBypassEnabled({ tenantId: input.tenantId })) {
    ok = true;
    method = 'bypass';
  } else if (await checkTxt(row.hostname, token)) {
    ok = true;
    method = 'txt';
  } else if (await checkCname(row.hostname)) {
    ok = true;
    method = 'cname';
  }

  await pool.query(
    `UPDATE tenant_hosts SET last_check_at = now(), updated_at = now() WHERE id = $1`,
    [row.id]
  );

  if (ok) {
    await pool.query(
      `UPDATE tenant_hosts
       SET status = 'active',
           verified_at = COALESCE(verified_at, now()),
           activated_at = now(),
           last_error = NULL,
           updated_at = now()
       WHERE id = $1`,
      [row.id]
    );
    const fresh = await getHostById(row.id);
    const bypass = await isTenantDomainVerifyBypassEnabled({ tenantId: input.tenantId });
    invalidateCorsOriginsCache();
    return {
      verified: true,
      status: 'active',
      method,
      instructions: fresh ? mapInstructions(fresh, bypass) : null,
    };
  }

  await pool.query(
    `UPDATE tenant_hosts
     SET status = CASE WHEN status = 'active' THEN 'pending' ELSE status END,
         last_error = 'DNS ainda não propagou (TXT/CNAME)',
         updated_at = now()
     WHERE id = $1`,
    [row.id]
  );

  const bypass = await isTenantDomainVerifyBypassEnabled({ tenantId: input.tenantId });
  const pending = await getHostById(row.id);
  return {
    verified: false,
    status: pending?.status ?? 'pending',
    method: 'none',
    instructions: pending ? mapInstructions(pending, bypass) : null,
  };
}

export async function clearTenantDomain(input: {
  tenantId: string;
  role?: string | null;
  hostId?: string | null;
}): Promise<void> {
  await assertFeatureEnabled(input.tenantId);

  if (input.hostId) {
    const del = await pool.query(
      `DELETE FROM tenant_hosts WHERE id = $1 AND tenant_id = $2`,
      [input.hostId, input.tenantId]
    );
    if ((del.rowCount ?? 0) === 0) {
      throw new TenantDomainError('Domínio não encontrado', 'DOMAIN_MISSING', 404);
    }
    invalidateCorsOriginsCache();
    return;
  }

  if (!input.role || !isTenantHostRole(input.role)) {
    throw new TenantDomainError('Informe role (store|support) ou id', 'ROLE_REQUIRED');
  }

  await pool.query(
    `DELETE FROM tenant_hosts WHERE tenant_id = $1 AND role = $2`,
    [input.tenantId, input.role]
  );
  invalidateCorsOriginsCache();
}

/**
 * TD12 — troca o papel do host (DNS/hostname permanecem; muda o roteamento).
 * Só se o slot de destino estiver livre.
 */
export async function changeTenantHostRole(input: {
  tenantId: string;
  fromRole: string;
  toRole: string;
}): Promise<TenantDomainInstructions> {
  await assertFeatureEnabled(input.tenantId);
  await assertPlatformCustomer(input.tenantId);

  if (!isTenantHostRole(input.fromRole) || !isTenantHostRole(input.toRole)) {
    throw new TenantDomainError(
      'role inválido — use store ou support',
      'ROLE_INVALID'
    );
  }
  if (input.fromRole === input.toRole) {
    throw new TenantDomainError('O uso do domínio já é este', 'ROLE_UNCHANGED', 400);
  }

  const row = await getTenantHostByRole(input.tenantId, input.fromRole);
  if (!row) {
    throw new TenantDomainError('Nenhum domínio configurado para este uso', 'DOMAIN_MISSING', 404);
  }

  const dest = await getTenantHostByRole(input.tenantId, input.toRole);
  if (dest) {
    throw new TenantDomainError(
      'Já existe um domínio para o uso de destino. Remova-o antes de trocar.',
      'DOMAIN_TAKEN_ROLE',
      409
    );
  }

  const upd = await pool.query<TenantHostRow>(
    `UPDATE tenant_hosts
     SET role = $1, updated_at = now()
     WHERE id = $2 AND tenant_id = $3
     RETURNING id, tenant_id, hostname, role, status, verification_token,
               verified_at::text, activated_at::text, last_check_at::text, last_error,
               created_at::text, updated_at::text`,
    [input.toRole, row.id, input.tenantId]
  );
  const fresh = upd.rows[0];
  if (!fresh) {
    throw new TenantDomainError('Domínio não encontrado', 'DOMAIN_MISSING', 404);
  }

  const bypass = await isTenantDomainVerifyBypassEnabled({ tenantId: input.tenantId });
  invalidateCorsOriginsCache();
  return mapInstructions(fresh, bypass);
}

/** Super Admin: lista hosts sem gate de flag (suporte). */
export async function listTenantHostsForAdmin(tenantId: string): Promise<TenantHostRow[]> {
  return listTenantHosts(tenantId);
}

export async function clearTenantDomainAsAdmin(input: {
  tenantId: string;
  role?: string | null;
  hostId?: string | null;
}): Promise<void> {
  if (input.hostId) {
    await pool.query(`DELETE FROM tenant_hosts WHERE id = $1 AND tenant_id = $2`, [
      input.hostId,
      input.tenantId,
    ]);
    invalidateCorsOriginsCache();
    return;
  }
  if (input.role && isTenantHostRole(input.role)) {
    await pool.query(`DELETE FROM tenant_hosts WHERE tenant_id = $1 AND role = $2`, [
      input.tenantId,
      input.role,
    ]);
    invalidateCorsOriginsCache();
    return;
  }
  throw new TenantDomainError('Informe role ou id', 'ROLE_REQUIRED');
}

export type TenantHostDnsRecheckResult = {
  checked: number;
  demoted: number;
  ok: number;
  errors: number;
};

/**
 * TD S5 — recheck DNS de hosts `active` (job opcional).
 * Sem gate de feature flag (ops); demove active→pending se TXT/CNAME falharem (exceto bypass global).
 */
export async function recheckActiveTenantHosts(opts?: {
  limit?: number;
}): Promise<TenantHostDnsRecheckResult> {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
  const r = await pool.query<TenantHostRow>(
    `SELECT id, tenant_id, hostname, role, status, verification_token,
            verified_at::text, activated_at::text, last_check_at::text, last_error,
            created_at::text, updated_at::text
     FROM tenant_hosts
     WHERE status = 'active'
       AND verification_token IS NOT NULL
     ORDER BY last_check_at ASC NULLS FIRST
     LIMIT $1`,
    [limit]
  );

  let demoted = 0;
  let okCount = 0;
  let errors = 0;

  for (const row of r.rows) {
    try {
      const token = row.verification_token || '';
      let ok = false;
      if (await isTenantDomainVerifyBypassEnabled({ tenantId: row.tenant_id })) {
        ok = true;
      } else if (token && (await checkTxt(row.hostname, token))) {
        ok = true;
      } else if (await checkCname(row.hostname)) {
        ok = true;
      }

      if (ok) {
        await pool.query(
          `UPDATE tenant_hosts
           SET last_check_at = now(), last_error = NULL, updated_at = now()
           WHERE id = $1`,
          [row.id]
        );
        okCount += 1;
      } else {
        await pool.query(
          `UPDATE tenant_hosts
           SET status = 'pending',
               last_check_at = now(),
               last_error = 'DNS recheck falhou (TXT/CNAME)',
               updated_at = now()
           WHERE id = $1`,
          [row.id]
        );
        demoted += 1;
      }
    } catch {
      errors += 1;
    }
  }

  if (demoted > 0) {
    invalidateCorsOriginsCache();
  }

  return { checked: r.rows.length, demoted, ok: okCount, errors };
}
