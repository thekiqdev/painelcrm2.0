/**
 * M5 S2 — custom domain set + DNS verify (TXT / CNAME).
 */

import { randomBytes } from 'node:crypto';
import dns from 'node:dns/promises';
import { pool } from '../utils/db.js';
import { PartnerAdminError } from './partnerAdminService.js';
import { normalizeHostname } from './partnerBrandResolver.js';
import { isPartnerDomainVerifyBypassEnabled } from './partnerFlags.js';
import { getPartnerProfile } from './partnerRepository.js';

const TXT_LABEL = '_painelcrm-partner';

function generateToken(): string {
  return randomBytes(16).toString('hex');
}

function cnameTarget(): string | null {
  const raw = (process.env.PARTNER_WL_CNAME_TARGET || '').trim().toLowerCase();
  return raw ? normalizeHostname(raw) : null;
}

export type DomainInstructions = {
  custom_domain: string;
  domain_status: string;
  domain_verification_token: string;
  txt_host: string;
  txt_value: string;
  cname_host: string | null;
  cname_target: string | null;
  bypass_enabled: boolean;
};

export async function setPartnerDomain(
  partnerTenantId: string,
  domainRaw: string
): Promise<DomainInstructions> {
  const domain = normalizeHostname(domainRaw);
  if (!domain || !domain.includes('.')) {
    throw new PartnerAdminError('Domínio inválido', 'DOMAIN_INVALID');
  }

  // reserved / platform hosts
  const blocked = (process.env.PARTNER_WL_BLOCKED_HOSTS || 'localhost,127.0.0.1')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (blocked.includes(domain)) {
    throw new PartnerAdminError('Domínio não permitido', 'DOMAIN_BLOCKED');
  }

  const taken = await pool.query(
    `SELECT partner_tenant_id FROM partner_profiles
     WHERE custom_domain IS NOT NULL
       AND lower(custom_domain) = $1
       AND partner_tenant_id <> $2
     LIMIT 1`,
    [domain, partnerTenantId]
  );
  if (taken.rows.length > 0) {
    throw new PartnerAdminError('Domínio já em uso por outro Partner', 'DOMAIN_TAKEN', 409);
  }

  const token = generateToken();
  await pool.query(
    `UPDATE partner_profiles
     SET custom_domain = $1,
         domain_status = 'pending',
         domain_verification_token = $2,
         updated_at = now()
     WHERE partner_tenant_id = $3`,
    [domain, token, partnerTenantId]
  );

  return await buildInstructions(domain, 'pending', token);
}

async function buildInstructions(
  domain: string,
  status: string,
  token: string
): Promise<DomainInstructions> {
  const target = cnameTarget();
  const bypass_enabled = await isPartnerDomainVerifyBypassEnabled();
  return {
    custom_domain: domain,
    domain_status: status,
    domain_verification_token: token,
    txt_host: `${TXT_LABEL}.${domain}`,
    txt_value: token,
    cname_host: domain,
    cname_target: target,
    bypass_enabled,
  };
}

export async function getPartnerDomainInstructions(
  partnerTenantId: string
): Promise<DomainInstructions | null> {
  const profile = await getPartnerProfile(partnerTenantId);
  if (!profile?.custom_domain || !profile.domain_verification_token) {
    if (profile?.custom_domain) {
      // token missing — regenerate pending
      return setPartnerDomain(partnerTenantId, profile.custom_domain);
    }
    return null;
  }
  return await buildInstructions(
    profile.custom_domain,
    profile.domain_status,
    profile.domain_verification_token
  );
}

async function checkTxt(domain: string, token: string): Promise<boolean> {
  const names = [`${TXT_LABEL}.${domain}`, domain];
  for (const name of names) {
    try {
      const records = await dns.resolveTxt(name);
      const flat = records.map((chunks) => chunks.join('')).join(' ');
      if (flat.includes(token)) return true;
      if (flat.includes(`painelcrm-partner-verify=${token}`)) return true;
    } catch {
      /* NXDOMAIN etc. */
    }
  }
  return false;
}

async function checkCname(domain: string): Promise<boolean> {
  const target = cnameTarget();
  if (!target) return false;
  try {
    const records = await dns.resolveCname(domain);
    return records.some((r) => normalizeHostname(r) === target);
  } catch {
    try {
      // some providers use CNAME flattening — check if any address resolves (weak)
      return false;
    } catch {
      return false;
    }
  }
}

export type VerifyDomainResult = {
  verified: boolean;
  domain_status: string;
  method: 'txt' | 'cname' | 'bypass' | 'none';
  instructions: DomainInstructions | null;
};

export async function verifyPartnerDomain(
  partnerTenantId: string
): Promise<VerifyDomainResult> {
  const profile = await getPartnerProfile(partnerTenantId);
  if (!profile?.custom_domain) {
    throw new PartnerAdminError('Nenhum domínio configurado', 'DOMAIN_MISSING');
  }
  let token = profile.domain_verification_token;
  if (!token) {
    const regenerated = await setPartnerDomain(partnerTenantId, profile.custom_domain);
    token = regenerated.domain_verification_token;
  }

  const domain = profile.custom_domain;
  let method: VerifyDomainResult['method'] = 'none';
  let ok = false;

  if (await isPartnerDomainVerifyBypassEnabled({ tenantId: partnerTenantId })) {
    ok = true;
    method = 'bypass';
  } else if (await checkTxt(domain, token)) {
    ok = true;
    method = 'txt';
  } else if (await checkCname(domain)) {
    ok = true;
    method = 'cname';
  }

  if (ok) {
    await pool.query(
      `UPDATE partner_profiles
       SET domain_status = 'active', updated_at = now()
       WHERE partner_tenant_id = $1`,
      [partnerTenantId]
    );
    const instructions = await getPartnerDomainInstructions(partnerTenantId);
    return {
      verified: true,
      domain_status: 'active',
      method,
      instructions,
    };
  }

  // keep pending
  if (profile.domain_status === 'none' || profile.domain_status === 'verified') {
    await pool.query(
      `UPDATE partner_profiles SET domain_status = 'pending', updated_at = now()
       WHERE partner_tenant_id = $1`,
      [partnerTenantId]
    );
  }

  return {
    verified: false,
    domain_status: 'pending',
    method: 'none',
    instructions: await getPartnerDomainInstructions(partnerTenantId),
  };
}

export async function clearPartnerDomain(partnerTenantId: string): Promise<void> {
  await pool.query(
    `UPDATE partner_profiles
     SET custom_domain = NULL,
         domain_status = 'none',
         domain_verification_token = NULL,
         updated_at = now()
     WHERE partner_tenant_id = $1`,
    [partnerTenantId]
  );
}
