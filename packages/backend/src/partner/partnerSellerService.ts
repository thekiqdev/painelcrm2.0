/**
 * M5 S4 — sellers mínimos (link); CRUD rico + comissões = S5.
 */

import { randomBytes } from 'node:crypto';
import { pool } from '../utils/db.js';
import { hashPassword } from '../utils/bcrypt.js';
import { normalizeEmailForUniqueness } from '../utils/userIdentity.js';
import { resolveSaleLinkOrigin } from '../utils/platformPublicUrls.js';
import { PartnerAdminError } from './partnerAdminService.js';
import {
  buildPartnerSaleUrl,
  ensureSellerReferralCode,
} from './partnerAttribution.js';
import { getPartnerProfile } from './partnerRepository.js';

async function resolveSaleOrigin(
  partnerTenantId: string,
  opts?: { originHint?: string | null }
): Promise<{ origin: string; onCustomDomain: boolean; partnerSlug: string }> {
  const profile = await getPartnerProfile(partnerTenantId);
  const slugRow = await pool.query<{ slug: string }>(
    `SELECT slug FROM tenants WHERE id = $1 LIMIT 1`,
    [partnerTenantId]
  );
  const partnerSlug = slugRow.rows[0]?.slug || '';
  const onCustomDomain = Boolean(
    profile?.custom_domain && (profile.domain_status === 'verified' || profile.domain_status === 'active')
  );
  const origin = onCustomDomain
    ? `https://${profile!.custom_domain}`
    : resolveSaleLinkOrigin({ originHint: opts?.originHint });
  return { origin, onCustomDomain, partnerSlug };
}

export type PartnerSellerListItem = {
  user_id: string;
  email: string;
  name: string | null;
  referral_code: string | null;
  status: string;
  created_at: string;
};

export async function listPartnerSellers(partnerTenantId: string): Promise<PartnerSellerListItem[]> {
  const r = await pool.query<{
    user_id: string;
    email: string;
    name: string | null;
    referral_code: string | null;
    status: string;
    created_at: string;
  }>(
    `SELECT m.user_id::text AS user_id, u.email, p.first_name AS name, m.referral_code, m.status,
            m.created_at::text AS created_at
     FROM partner_memberships m
     JOIN users u ON u.id = m.user_id
     LEFT JOIN profiles p ON p.id = u.id
     WHERE m.partner_tenant_id = $1 AND m.role = 'partner_seller'
     ORDER BY m.created_at DESC`,
    [partnerTenantId]
  );
  return r.rows;
}

export async function createPartnerSeller(
  partnerTenantId: string,
  input: { email: string; name?: string; password?: string },
  opts?: { originHint?: string | null }
): Promise<PartnerSellerListItem & { sale_url: string; temporary_password?: string }> {
  const email = normalizeEmailForUniqueness(input.email);
  const displayName = input.name?.trim() || email.split('@')[0] || 'Vendedor';
  const tempPassword = input.password?.trim() || `${randomBytes(6).toString('base64url')}Aa1!`;
  if (tempPassword.length < 8) {
    throw new PartnerAdminError('Senha mínima 8 caracteres', 'PASSWORD_WEAK', 400);
  }

  const existingUser = await pool.query<{ id: string; tenant_id: string }>(
    `SELECT id, tenant_id FROM users WHERE lower(trim(email)) = $1 LIMIT 1`,
    [email]
  );

  const client = await pool.connect();
  let userId: string;
  try {
    await client.query('BEGIN');

    if (existingUser.rows[0]) {
      const u = existingUser.rows[0];
      if (u.tenant_id !== partnerTenantId) {
        throw new PartnerAdminError(
          'E-mail já pertence a outro tenant',
          'EMAIL_IN_USE',
          409
        );
      }
      userId = u.id;
      const dup = await client.query(
        `SELECT id FROM partner_memberships
         WHERE user_id = $1 AND role = 'partner_seller' AND status = 'active'`,
        [userId]
      );
      if (dup.rows[0]) {
        throw new PartnerAdminError('Usuário já é vendedor de um Partner', 'SELLER_UNIQUE', 409);
      }
    } else {
      const passwordHash = await hashPassword(tempPassword);
      const ins = await client.query<{ id: string }>(
        `INSERT INTO users (tenant_id, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [partnerTenantId, email, passwordHash]
      );
      userId = ins.rows[0]!.id;
      const first = displayName.split(/\s+/)[0] || displayName;
      const last = displayName.split(/\s+/).slice(1).join(' ') || null;
      await client.query(
        `INSERT INTO profiles (id, first_name, last_name, company_name, registration_complete)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (id) DO NOTHING`,
        [userId, first, last, 'Partner']
      );
    }

    let code = randomBytes(5).toString('hex');
    for (let i = 0; i < 5; i++) {
      try {
        await client.query(
          `INSERT INTO partner_memberships (
             partner_tenant_id, user_id, role, status, referral_code
           ) VALUES ($1, $2, 'partner_seller', 'active', $3)`,
          [partnerTenantId, userId, code]
        );
        break;
      } catch (err) {
        const pg = err as { code?: string };
        if (pg.code === '23505') {
          code = randomBytes(5).toString('hex');
          if (i === 4) throw err;
          continue;
        }
        throw err;
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const sellers = await listPartnerSellers(partnerTenantId);
  const row = sellers.find((s) => s.email === email);
  if (!row) throw new PartnerAdminError('Seller não encontrado após create', 'NOT_FOUND', 500);

  const { origin, onCustomDomain, partnerSlug } = await resolveSaleOrigin(partnerTenantId, opts);

  return {
    ...row,
    sale_url: buildPartnerSaleUrl({
      origin,
      partnerSlug,
      sellerUserId: userId,
      onCustomDomain,
    }),
    ...(input.password ? {} : { temporary_password: tempPassword }),
  };
}

export async function getSellerSaleLink(
  partnerTenantId: string,
  userId: string,
  opts?: { originHint?: string | null }
): Promise<{ referral_code: string; sale_url: string; partner_tenant_id: string }> {
  const code = await ensureSellerReferralCode(partnerTenantId, userId);
  const { origin, onCustomDomain, partnerSlug } = await resolveSaleOrigin(partnerTenantId, opts);

  return {
    partner_tenant_id: partnerTenantId,
    referral_code: code,
    sale_url: buildPartnerSaleUrl({
      origin,
      partnerSlug,
      sellerUserId: userId,
      onCustomDomain,
    }),
  };
}

export async function getPartnerHouseSaleLink(
  partnerTenantId: string,
  opts?: { originHint?: string | null }
): Promise<{ sale_url: string; partner_tenant_id: string }> {
  const { origin, onCustomDomain, partnerSlug } = await resolveSaleOrigin(partnerTenantId, opts);
  return {
    partner_tenant_id: partnerTenantId,
    sale_url: buildPartnerSaleUrl({
      origin,
      partnerSlug,
      onCustomDomain,
    }),
  };
}

export async function patchPartnerSeller(
  partnerTenantId: string,
  sellerUserId: string,
  input: { status?: 'active' | 'inactive'; name?: string }
): Promise<PartnerSellerListItem> {
  const m = await pool.query(
    `SELECT id FROM partner_memberships
     WHERE partner_tenant_id = $1 AND user_id = $2 AND role = 'partner_seller'
     LIMIT 1`,
    [partnerTenantId, sellerUserId]
  );
  if (!m.rows[0]) {
    throw new PartnerAdminError('Vendedor não encontrado', 'SELLER_NOT_FOUND', 404);
  }

  if (input.status) {
    if (input.status === 'active') {
      const other = await pool.query(
        `SELECT id FROM partner_memberships
         WHERE user_id = $1 AND role = 'partner_seller' AND status = 'active'
           AND partner_tenant_id <> $2
         LIMIT 1`,
        [sellerUserId, partnerTenantId]
      );
      if (other.rows[0]) {
        throw new PartnerAdminError('Usuário já é vendedor de outro Partner', 'SELLER_UNIQUE', 409);
      }
    }
    await pool.query(
      `UPDATE partner_memberships SET status = $1, updated_at = now()
       WHERE partner_tenant_id = $2 AND user_id = $3 AND role = 'partner_seller'`,
      [input.status, partnerTenantId, sellerUserId]
    );
  }

  if (input.name?.trim()) {
    const first = input.name.trim().split(/\s+/)[0]!;
    const last = input.name.trim().split(/\s+/).slice(1).join(' ') || null;
    await pool.query(
      `UPDATE profiles SET first_name = $1, last_name = $2 WHERE id = $3`,
      [first, last, sellerUserId]
    );
  }

  if (input.status === 'active' || !input.status) {
    await ensureSellerReferralCode(partnerTenantId, sellerUserId).catch(() => undefined);
  }

  const sellers = await listPartnerSellers(partnerTenantId);
  const row = sellers.find((s) => s.user_id === sellerUserId);
  if (!row) throw new PartnerAdminError('Vendedor não encontrado', 'SELLER_NOT_FOUND', 404);
  return row;
}
