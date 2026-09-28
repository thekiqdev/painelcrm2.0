/**
 * M5 S4 — resolve Partner + seller a partir de host, slug de path e ?ref=.
 */

import { pool } from '../utils/db.js';
import { normalizeHostname, resolvePartnerBrandByHost } from './partnerBrandResolver.js';
import { randomBytes } from 'node:crypto';

export type PartnerAttribution = {
  partner_id: string | null;
  seller_user_id: string | null;
  seller_referral_code: string | null;
};

export async function findMembershipByReferralCode(
  codeRaw: string
): Promise<{
  partner_tenant_id: string;
  user_id: string;
  referral_code: string;
} | null> {
  const code = codeRaw.trim();
  if (!code) return null;
  const r = await pool.query<{
    partner_tenant_id: string;
    user_id: string;
    referral_code: string;
  }>(
    `SELECT partner_tenant_id, user_id, referral_code
     FROM partner_memberships
     WHERE status = 'active'
       AND role = 'partner_seller'
       AND lower(referral_code) = lower($1)
     LIMIT 1`,
    [code]
  );
  return r.rows[0] ?? null;
}

export async function findPartnerIdBySlug(slugRaw: string): Promise<string | null> {
  const slug = slugRaw.trim().toLowerCase();
  if (!slug) return null;
  const r = await pool.query<{ id: string }>(
    `SELECT id::text AS id FROM tenants
     WHERE account_type = 'partner' AND lower(slug) = $1
     LIMIT 1`,
    [slug]
  );
  return r.rows[0]?.id ?? null;
}

export async function findActiveSellerOnPartner(
  partnerTenantId: string,
  sellerUserId: string
): Promise<{ user_id: string; referral_code: string | null } | null> {
  const r = await pool.query<{ user_id: string; referral_code: string | null }>(
    `SELECT user_id::text AS user_id, referral_code
     FROM partner_memberships
     WHERE partner_tenant_id = $1
       AND user_id = $2
       AND role = 'partner_seller'
       AND status = 'active'
     LIMIT 1`,
    [partnerTenantId, sellerUserId]
  );
  return r.rows[0] ?? null;
}

export async function resolvePartnerAttribution(opts: {
  host?: string | null;
  partnerIdHint?: string | null;
  partnerSlug?: string | null;
  sellerUserId?: string | null;
  referralCode?: string | null;
}): Promise<PartnerAttribution> {
  let partnerId: string | null = null;
  let sellerUserId: string | null = null;
  let sellerReferralCode: string | null = null;

  const host = normalizeHostname(opts.host);
  if (host) {
    const brand = await resolvePartnerBrandByHost(host);
    if (brand) partnerId = brand.partner_tenant_id;
  }

  if (!partnerId && opts.partnerSlug?.trim()) {
    partnerId = await findPartnerIdBySlug(opts.partnerSlug);
  }

  if (!partnerId && opts.partnerIdHint) {
    const check = await pool.query(
      `SELECT id FROM tenants WHERE id = $1 AND account_type = 'partner' LIMIT 1`,
      [opts.partnerIdHint]
    );
    if (check.rows[0]) partnerId = opts.partnerIdHint;
  }

  if (opts.sellerUserId?.trim() && partnerId) {
    const m = await findActiveSellerOnPartner(partnerId, opts.sellerUserId.trim());
    if (m) {
      sellerUserId = m.user_id;
      sellerReferralCode = m.referral_code;
    }
  }

  if (opts.referralCode?.trim()) {
    const m = await findMembershipByReferralCode(opts.referralCode);
    if (m) {
      // ref define o partner se host/slug não resolveu
      if (!partnerId) partnerId = m.partner_tenant_id;
      if (partnerId && m.partner_tenant_id === partnerId) {
        sellerUserId = m.user_id;
        sellerReferralCode = m.referral_code;
      } else if (partnerId && m.partner_tenant_id !== partnerId) {
        // host/slug e ref divergem: prioriza host/slug e ignora seller de outro partner
        if (!opts.sellerUserId) {
          sellerUserId = null;
          sellerReferralCode = null;
        }
      }
    }
  }

  return {
    partner_id: partnerId,
    seller_user_id: sellerUserId,
    seller_referral_code: sellerReferralCode,
  };
}

export async function ensureSellerReferralCode(
  partnerTenantId: string,
  userId: string
): Promise<string> {
  const existing = await pool.query<{ referral_code: string | null }>(
    `SELECT referral_code FROM partner_memberships
     WHERE partner_tenant_id = $1 AND user_id = $2 AND role = 'partner_seller' AND status = 'active'
     LIMIT 1`,
    [partnerTenantId, userId]
  );
  const row = existing.rows[0];
  if (!row) {
    throw new Error('SELLER_MEMBERSHIP_MISSING');
  }
  if (row.referral_code?.trim()) return row.referral_code.trim();

  for (let i = 0; i < 5; i++) {
    const code = randomBytes(5).toString('hex');
    try {
      await pool.query(
        `UPDATE partner_memberships SET referral_code = $1, updated_at = now()
         WHERE partner_tenant_id = $2 AND user_id = $3 AND role = 'partner_seller'`,
        [code, partnerTenantId, userId]
      );
      return code;
    } catch {
      /* unique collision */
    }
  }
  throw new Error('REFERRAL_CODE_GEN_FAILED');
}

/**
 * Link de venda:
 * - Sem domínio WL: /{partnerSlug}/cadastro ou /{partnerSlug}/{sellerUserId}/cadastro
 * - Com domínio WL verificado: /cadastro ou /{sellerUserId}/cadastro (host já identifica o Partner)
 */
export function buildPartnerSaleUrl(opts: {
  origin: string;
  partnerSlug: string;
  sellerUserId?: string | null;
  /** true = domínio customizado verificado (não prefixa o slug do Partner) */
  onCustomDomain?: boolean;
}): string {
  const base = opts.origin.replace(/\/$/, '');
  const slug = opts.partnerSlug.trim();
  const seller = opts.sellerUserId?.trim();

  if (opts.onCustomDomain) {
    if (seller) return `${base}/${encodeURIComponent(seller)}/cadastro`;
    return `${base}/cadastro`;
  }

  if (!slug) {
    return seller ? `${base}/cadastro?seller=${encodeURIComponent(seller)}` : `${base}/cadastro`;
  }
  if (seller) {
    return `${base}/${encodeURIComponent(slug)}/${encodeURIComponent(seller)}/cadastro`;
  }
  return `${base}/${encodeURIComponent(slug)}/cadastro`;
}
