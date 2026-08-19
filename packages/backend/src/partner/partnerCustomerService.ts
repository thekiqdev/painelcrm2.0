/**
 * M5 S4 — carteira de customer_tenants do Partner.
 */

import type { PoolClient } from 'pg';
import { pool } from '../utils/db.js';
import { createTenantAdminUser } from '../services/tenantAdminService.js';
import { hashPassword } from '../utils/bcrypt.js';
import { normalizeEmailForUniqueness } from '../utils/userIdentity.js';
import { slugifyOperationalName } from '../acquisition/tenantOperationalSlug.js';
import { PartnerAdminError } from './partnerAdminService.js';
import {
  assertPartnerPoolAllowsNewUser,
  getPartnerLicenseSummary,
  refreshPartnerUsedSeatsCache,
} from './partnerLicenseService.js';
import { getPartnerSellPlan } from './partnerSellPlanService.js';
import { resolveDefaultPlanId } from './partnerRepository.js';
import { normalizeOptionalBillingDocument } from './partnerChannelBillingDocument.js';

export type PartnerCustomerRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan_id: string | null;
  partner_sell_plan_id: string | null;
  sell_plan_name: string | null;
  sell_plan_price_cents: number | null;
  admin_email: string | null;
  admin_name: string | null;
  cpf_cnpj: string | null;
  seller_user_id: string | null;
  seller_name: string | null;
  seller_email: string | null;
  seller_referral_code: string | null;
  created_at: string;
  users_count: number;
  seats_allocated: number | null;
};

export type CreatePartnerCustomerInput = {
  company_name: string;
  admin_email: string;
  admin_name?: string;
  /** Login do admin: senha obrigatória na criação manual. */
  admin_password: string;
  /** Licenças (usuários) liberadas para este cliente. */
  seats: number;
  /** Plano de venda do Partner (obrigatório — sem catálogo da plataforma). */
  sell_plan_id: string;
  seller_user_id?: string | null;
  /** CPF/CNPJ para cobrança Asaas (opcional na criação manual). */
  cpf_cnpj?: string | null;
};

export type CreatePartnerCustomerResult = PartnerCustomerRow & {
  admin_email: string;
};

export type UpdatePartnerCustomerInput = {
  company_name?: string;
  admin_name?: string;
  admin_email?: string;
  admin_password?: string;
  seats?: number;
  /** Troca de plano: apenas sell plans do Partner (obrigatório se enviado). */
  sell_plan_id?: string;
  seller_user_id?: string | null;
  cpf_cnpj?: string | null;
};

export async function listPartnerCustomers(
  partnerTenantId: string
): Promise<PartnerCustomerRow[]> {
  const r = await pool.query<{
    id: string;
    name: string;
    slug: string;
    status: string;
    plan_id: string | null;
    partner_sell_plan_id: string | null;
    sell_plan_name: string | null;
    sell_plan_price_cents: string | null;
    admin_email: string | null;
    admin_name: string | null;
    cpf_cnpj: string | null;
    seller_user_id: string | null;
    seller_name: string | null;
    seller_email: string | null;
    seller_referral_code: string | null;
    created_at: string;
    users_count: string;
    seats_allocated: string | null;
  }>(
    `SELECT t.id, t.name, t.slug, t.status, t.plan_id::text AS plan_id,
            t.partner_sell_plan_id::text AS partner_sell_plan_id,
            sp.name AS sell_plan_name,
            sp.price_cents::text AS sell_plan_price_cents,
            COALESCE(au.email, t.billing_email) AS admin_email,
            COALESCE(t.responsible_name, ap.first_name) AS admin_name,
            t.cpf_cnpj,
            t.seller_user_id::text AS seller_user_id,
            COALESCE(p.first_name, u.email) AS seller_name,
            u.email AS seller_email,
            m.referral_code AS seller_referral_code,
            t.created_at::text AS created_at,
            (SELECT COUNT(*)::text FROM users uu WHERE uu.tenant_id = t.id) AS users_count,
            t.max_users_override::text AS seats_allocated
     FROM tenants t
     LEFT JOIN partner_sell_plans sp ON sp.id = t.partner_sell_plan_id
     LEFT JOIN LATERAL (
       SELECT id, email FROM users
       WHERE tenant_id = t.id
       ORDER BY created_at ASC
       LIMIT 1
     ) au ON true
     LEFT JOIN profiles ap ON ap.id = au.id
     LEFT JOIN users u ON u.id = t.seller_user_id
     LEFT JOIN profiles p ON p.id = u.id
     LEFT JOIN partner_memberships m
       ON m.partner_tenant_id = t.partner_id
      AND m.user_id = t.seller_user_id
      AND m.role = 'partner_seller'
      AND m.status = 'active'
     WHERE t.account_type = 'customer_tenant'
       AND t.partner_id = $1
     ORDER BY t.created_at DESC`,
    [partnerTenantId]
  );

  return r.rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    plan_id: row.plan_id,
    partner_sell_plan_id: row.partner_sell_plan_id,
    sell_plan_name: row.sell_plan_name,
    sell_plan_price_cents:
      row.sell_plan_price_cents != null ? parseInt(row.sell_plan_price_cents, 10) || null : null,
    admin_email: row.admin_email,
    admin_name: row.admin_name,
    cpf_cnpj: row.cpf_cnpj,
    seller_user_id: row.seller_user_id,
    seller_name: row.seller_name,
    seller_email: row.seller_email,
    seller_referral_code: row.seller_referral_code,
    created_at: row.created_at,
    users_count: parseInt(row.users_count || '0', 10) || 0,
    seats_allocated:
      row.seats_allocated != null ? parseInt(row.seats_allocated, 10) || null : null,
  }));
}

async function uniqueCustomerSlug(client: PoolClient, companyName: string): Promise<string> {
  const baseSlug = slugifyOperationalName(companyName) || 'cliente';
  let slug = baseSlug;
  let suffix = 0;
  for (;;) {
    const exists = await client.query('SELECT id FROM tenants WHERE slug = $1', [slug]);
    if (exists.rows.length === 0) return slug;
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
}

async function assertSellerBelongsToPartner(
  partnerTenantId: string,
  sellerUserId: string
): Promise<void> {
  const m = await pool.query(
    `SELECT id FROM partner_memberships
     WHERE partner_tenant_id = $1 AND user_id = $2
       AND role = 'partner_seller' AND status = 'active'
     LIMIT 1`,
    [partnerTenantId, sellerUserId]
  );
  if (!m.rows[0]) {
    throw new PartnerAdminError('Vendedor inválido para este Partner', 'SELLER_INVALID', 400);
  }
}

async function resolveSellPlanBinding(
  partnerTenantId: string,
  sellPlanId: string | null,
  currentPlatformPlanId: string | null
): Promise<{ partnerSellPlanId: string | null; platformPlanId: string | null }> {
  if (sellPlanId === null) {
    return { partnerSellPlanId: null, platformPlanId: currentPlatformPlanId };
  }
  const sell = await getPartnerSellPlan(partnerTenantId, sellPlanId);
  if (!sell || sell.status !== 'active') {
    throw new PartnerAdminError('Plano de venda inválido ou inativo', 'SELL_PLAN_INVALID', 400);
  }
  return {
    partnerSellPlanId: sell.id,
    platformPlanId: sell.source_platform_plan_id || currentPlatformPlanId,
  };
}

async function applyPlatformPlan(
  client: PoolClient,
  tenantId: string,
  planId: string
): Promise<void> {
  await client.query(`UPDATE tenants SET plan_id = $1, updated_at = now() WHERE id = $2`, [
    planId,
    tenantId,
  ]);
  const existing = await client.query(`SELECT tenant_id FROM tenant_plan WHERE tenant_id = $1`, [
    tenantId,
  ]);
  if (existing.rows[0]) {
    await client.query(
      `UPDATE tenant_plan SET plan_id = $1, starts_at = now() WHERE tenant_id = $2`,
      [planId, tenantId]
    );
  } else {
    await client.query(
      `INSERT INTO tenant_plan (tenant_id, plan_id, starts_at) VALUES ($1, $2, now())`,
      [tenantId, planId]
    );
  }
}

/**
 * Cria customer_tenant na carteira do Partner com admin e N licenças (max_users_override).
 * Consome 1 seat do pool imediatamente (usuário admin); demais seats ficam no limite do cliente.
 */
export async function createPartnerCustomer(
  partnerTenantId: string,
  input: CreatePartnerCustomerInput
): Promise<CreatePartnerCustomerResult> {
  const companyName = input.company_name.trim();
  if (companyName.length < 2) {
    throw new PartnerAdminError('Informe o nome da empresa', 'COMPANY_REQUIRED', 400);
  }

  const seats = Math.floor(Number(input.seats));
  if (!Number.isFinite(seats) || seats < 1) {
    throw new PartnerAdminError('Informe ao menos 1 licença', 'SEATS_REQUIRED', 400);
  }
  if (seats > 10000) {
    throw new PartnerAdminError('Quantidade de licenças inválida', 'SEATS_INVALID', 400);
  }

  const email = normalizeEmailForUniqueness(input.admin_email);
  const adminName = input.admin_name?.trim() || email.split('@')[0] || 'Admin';
  const password = input.admin_password?.trim() || '';
  if (password.length < 8) {
    throw new PartnerAdminError('Informe a senha do admin (mín. 8 caracteres)', 'PASSWORD_REQUIRED', 400);
  }

  const summary = await getPartnerLicenseSummary(partnerTenantId);
  if (summary.available_seats < seats) {
    throw new PartnerAdminError(
      `Licenças insuficientes no pool (${summary.available_seats} disponíveis, ${seats} solicitadas)`,
      'LICENSE_POOL_EXHAUSTED',
      409
    );
  }
  await assertPartnerPoolAllowsNewUser(partnerTenantId, 1);

  let partnerSellPlanId: string | null = null;
  let planId: string | null = null;
  let trialDays = 0;
  const sellPlanId = input.sell_plan_id?.trim();
  if (!sellPlanId) {
    throw new PartnerAdminError(
      'Selecione um plano de venda do Partner',
      'SELL_PLAN_REQUIRED',
      400
    );
  }
  const sell = await getPartnerSellPlan(partnerTenantId, sellPlanId);
  if (!sell || sell.status !== 'active') {
    throw new PartnerAdminError('Plano de venda inválido ou inativo', 'SELL_PLAN_INVALID', 400);
  }
  partnerSellPlanId = sell.id;
  planId = sell.source_platform_plan_id;
  trialDays = Math.max(0, sell.trial_days || 0);
  if (!planId) {
    planId = await resolveDefaultPlanId();
  }
  if (!planId) {
    throw new PartnerAdminError('Nenhum plano de plataforma disponível (envelope)', 'PLAN_REQUIRED', 500);
  }

  if (input.seller_user_id) {
    await assertSellerBelongsToPartner(partnerTenantId, input.seller_user_id);
  }

  const cpfDigits = normalizeOptionalBillingDocument(input.cpf_cnpj);

  const tenantStatus = trialDays > 0 ? 'trial' : 'active';

  const client = await pool.connect();
  let tenantId: string;
  try {
    await client.query('BEGIN');

    const slug = await uniqueCustomerSlug(client, companyName);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO tenants (
         name, slug, plan_id, status, created_via,
         billing_email, responsible_name, cpf_cnpj,
         onboarding_completed, account_type, partner_id, seller_user_id,
         max_users_override, partner_sell_plan_id,
         trial_ends_at, has_used_trial, trial_consumed_at
       ) VALUES (
         $1, $2, $3, $10::text, 'partner',
         $4, $5, $12,
         true, 'customer_tenant', $6, $7,
         $8, $9,
         CASE WHEN $11::int > 0 THEN now() + ($11::int * interval '1 day') ELSE NULL END,
         CASE WHEN $11::int > 0 THEN true ELSE false END,
         CASE WHEN $11::int > 0 THEN now() ELSE NULL END
       )
       RETURNING id`,
      [
        companyName,
        slug,
        planId,
        email,
        adminName,
        partnerTenantId,
        input.seller_user_id ?? null,
        seats,
        partnerSellPlanId,
        tenantStatus,
        trialDays,
        cpfDigits,
      ]
    );
    tenantId = inserted.rows[0].id;

    await client.query(
      `INSERT INTO tenant_plan (tenant_id, plan_id, starts_at)
       SELECT $1, $2, now()
       WHERE NOT EXISTS (SELECT 1 FROM tenant_plan WHERE tenant_id = $1)`,
      [tenantId, planId]
    );

    await createTenantAdminUser(
      {
        tenantId,
        tenantName: companyName,
        email,
        responsibleName: adminName,
        password,
      },
      { db: client }
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    const code = (err as { code?: string })?.code;
    if (
      code === 'EMAIL_GLOBAL_DUPLICATE' ||
      (err as Error)?.message === 'EMAIL_ALREADY_REGISTERED_OTHER_TENANT'
    ) {
      throw new PartnerAdminError(
        'E-mail do admin já registrado em outra conta',
        'ADMIN_EMAIL_TAKEN',
        409
      );
    }
    throw err;
  } finally {
    client.release();
  }

  await refreshPartnerUsedSeatsCache(partnerTenantId);

  try {
    const { ensureTenantOperationalBootstrap } = await import(
      '../services/tenantOperationalBootstrapService.js'
    );
    const admin = await pool.query<{ id: string }>(
      `SELECT id FROM users WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [tenantId]
    );
    if (admin.rows[0]) {
      await ensureTenantOperationalBootstrap({
        tenantId,
        adminUserId: admin.rows[0].id,
      });
    }
  } catch (bootstrapErr) {
    console.warn('[partner] customer bootstrap failed', { tenantId, err: bootstrapErr });
  }

  const list = await listPartnerCustomers(partnerTenantId);
  const row = list.find((c) => c.id === tenantId);
  if (!row) {
    throw new PartnerAdminError('Cliente criado mas não encontrado', 'NOT_FOUND', 500);
  }

  return {
    ...row,
    admin_email: email,
  };
}

export async function updatePartnerCustomer(
  partnerTenantId: string,
  customerTenantId: string,
  input: UpdatePartnerCustomerInput
): Promise<PartnerCustomerRow> {
  const owner = await pool.query<{
    id: string;
    plan_id: string | null;
    max_users_override: number | null;
    partner_sell_plan_id: string | null;
  }>(
    `SELECT id, plan_id::text AS plan_id, max_users_override,
            partner_sell_plan_id::text AS partner_sell_plan_id
     FROM tenants
     WHERE id = $1 AND account_type = 'customer_tenant' AND partner_id = $2
     LIMIT 1`,
    [customerTenantId, partnerTenantId]
  );
  if (!owner.rows[0]) {
    throw new PartnerAdminError('Cliente não encontrado na carteira', 'CUSTOMER_NOT_FOUND', 404);
  }

  const current = owner.rows[0];
  const usersCountRes = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM users WHERE tenant_id = $1`,
    [customerTenantId]
  );
  const usersCount = parseInt(usersCountRes.rows[0]?.n || '0', 10) || 0;

  if (input.seller_user_id) {
    await assertSellerBelongsToPartner(partnerTenantId, input.seller_user_id);
  }

  let nextSeats: number | undefined;
  if (input.seats !== undefined) {
    nextSeats = Math.floor(Number(input.seats));
    if (!Number.isFinite(nextSeats) || nextSeats < 1) {
      throw new PartnerAdminError('Informe ao menos 1 licença', 'SEATS_REQUIRED', 400);
    }
    if (nextSeats > 10000) {
      throw new PartnerAdminError('Quantidade de licenças inválida', 'SEATS_INVALID', 400);
    }
    if (nextSeats < usersCount) {
      throw new PartnerAdminError(
        `Não é possível reduzir para ${nextSeats} licenças: o cliente já tem ${usersCount} usuário(s)`,
        'SEATS_BELOW_USERS',
        400
      );
    }
    const currentAllocated = current.max_users_override ?? usersCount;
    const delta = nextSeats - currentAllocated;
    if (delta > 0) {
      const summary = await getPartnerLicenseSummary(partnerTenantId);
      if (summary.available_seats < delta) {
        throw new PartnerAdminError(
          `Licenças insuficientes no pool (${summary.available_seats} disponíveis, +${delta} solicitadas)`,
          'LICENSE_POOL_EXHAUSTED',
          409
        );
      }
    }
  }

  let sellBinding: { partnerSellPlanId: string | null; platformPlanId: string | null } | null =
    null;
  if (input.sell_plan_id !== undefined) {
    if (input.sell_plan_id === null) {
      throw new PartnerAdminError(
        'Cliente Partner deve permanecer vinculado a um plano de venda do canal',
        'SELL_PLAN_REQUIRED',
        400
      );
    }
    if (input.sell_plan_id === current.partner_sell_plan_id) {
      // Mantém o plano atual (mesmo se arquivado) — sem revalidar status.
      sellBinding = null;
    } else {
      sellBinding = await resolveSellPlanBinding(
        partnerTenantId,
        input.sell_plan_id,
        current.plan_id
      );
    }
  }

  const companyName = input.company_name?.trim();
  if (companyName !== undefined && companyName.length < 2) {
    throw new PartnerAdminError('Informe o nome da empresa', 'COMPANY_REQUIRED', 400);
  }

  const adminName = input.admin_name?.trim();
  const adminEmail =
    input.admin_email !== undefined
      ? normalizeEmailForUniqueness(input.admin_email)
      : undefined;
  const adminPassword = input.admin_password?.trim();
  if (adminPassword !== undefined && adminPassword.length > 0 && adminPassword.length < 8) {
    throw new PartnerAdminError('Senha mínima 8 caracteres', 'PASSWORD_WEAK', 400);
  }

  let cpfDigits: string | null | undefined;
  if (input.cpf_cnpj !== undefined) {
    cpfDigits = input.cpf_cnpj === null || input.cpf_cnpj === ''
      ? null
      : normalizeOptionalBillingDocument(input.cpf_cnpj);
  }

  const admin = await pool.query<{ id: string; email: string }>(
    `SELECT id, email FROM users WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [customerTenantId]
  );
  const adminUser = admin.rows[0] ?? null;

  if (adminEmail && adminUser && adminEmail !== normalizeEmailForUniqueness(adminUser.email)) {
    const dup = await pool.query(
      `SELECT id FROM users WHERE lower(btrim(email)) = $1 AND id <> $2 LIMIT 1`,
      [adminEmail, adminUser.id]
    );
    if (dup.rows[0]) {
      throw new PartnerAdminError(
        'E-mail do admin já registrado em outra conta',
        'ADMIN_EMAIL_TAKEN',
        409
      );
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sets: string[] = ['updated_at = now()'];
    const params: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      sets.push(`${sql} = $${params.length}`);
    };

    if (companyName !== undefined) add('name', companyName);
    if (adminName !== undefined) add('responsible_name', adminName || null);
    if (adminEmail !== undefined) add('billing_email', adminEmail);
    if (nextSeats !== undefined) add('max_users_override', nextSeats);
    if (input.seller_user_id !== undefined) add('seller_user_id', input.seller_user_id);
    if (cpfDigits !== undefined) add('cpf_cnpj', cpfDigits);
    if (sellBinding) {
      add('partner_sell_plan_id', sellBinding.partnerSellPlanId);
    }

    if (sets.length > 1) {
      params.push(customerTenantId);
      await client.query(
        `UPDATE tenants SET ${sets.join(', ')} WHERE id = $${params.length}`,
        params
      );
    }

    if (
      sellBinding?.platformPlanId &&
      sellBinding.platformPlanId !== current.plan_id
    ) {
      await applyPlatformPlan(client, customerTenantId, sellBinding.platformPlanId);
    }

    if (adminUser) {
      if (adminEmail && adminEmail !== normalizeEmailForUniqueness(adminUser.email)) {
        await client.query(`UPDATE users SET email = $1, updated_at = now() WHERE id = $2`, [
          adminEmail,
          adminUser.id,
        ]);
      }
      if (adminName !== undefined) {
        const first = (adminName || '').split(/\s+/)[0] || adminName || 'Admin';
        const rest = (adminName || '').split(/\s+/).slice(1).join(' ') || null;
        await client.query(
          `UPDATE profiles SET first_name = $1, last_name = $2, updated_at = now() WHERE id = $3`,
          [first, rest, adminUser.id]
        );
      }
      if (adminPassword) {
        const hash = await hashPassword(adminPassword);
        await client.query(
          `UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`,
          [hash, adminUser.id]
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  if (nextSeats !== undefined) {
    await refreshPartnerUsedSeatsCache(partnerTenantId);
  }

  const list = await listPartnerCustomers(partnerTenantId);
  const row = list.find((c) => c.id === customerTenantId);
  if (!row) {
    throw new PartnerAdminError('Cliente não encontrado após update', 'CUSTOMER_NOT_FOUND', 404);
  }
  return row;
}

/**
 * Exclui customer_tenant da carteira do Partner (hard delete + limpeza de users).
 * Só permite se o tenant for customer_tenant deste partner_id.
 */
export async function deletePartnerCustomer(
  partnerTenantId: string,
  customerTenantId: string
): Promise<void> {
  const owner = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM tenants
     WHERE id = $1 AND account_type = 'customer_tenant' AND partner_id = $2
     LIMIT 1`,
    [customerTenantId, partnerTenantId]
  );
  if (!owner.rows[0]) {
    throw new PartnerAdminError('Cliente não encontrado na carteira', 'CUSTOMER_NOT_FOUND', 404);
  }

  try {
    const { deleteTenantWithDependencies } = await import('../services/tenantDeletionService.js');
    await deleteTenantWithDependencies(customerTenantId);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === '23503') {
      throw new PartnerAdminError(
        'Não foi possível excluir: há vínculos que impedem a remoção. Contate o suporte.',
        'DELETE_BLOCKED',
        409
      );
    }
    throw err;
  }

  await refreshPartnerUsedSeatsCache(partnerTenantId);
}

/** @deprecated Prefer updatePartnerCustomer — mantido para compat. */
export async function reassignPartnerCustomerSeller(
  partnerTenantId: string,
  customerTenantId: string,
  sellerUserId: string | null
): Promise<PartnerCustomerRow> {
  return updatePartnerCustomer(partnerTenantId, customerTenantId, {
    seller_user_id: sellerUserId,
  });
}
