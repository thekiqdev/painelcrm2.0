/**
 * Vínculo conta financeira ↔ gateway (um registo por conta).
 */
import { assertFinancialGatewayKeyAvailable } from '../config/financialAvailableGateways.js';
import { pool } from '../utils/db.js';

export type GatewayProviderKey = 'asaas' | 'mercado_pago';

export interface FinancialAccountGatewayLinkRow {
  id: string;
  tenant_id: string;
  financial_account_id: string;
  gateway: GatewayProviderKey;
  is_enabled: boolean;
  is_default_receivables: boolean;
  created_at: string;
  updated_at: string;
}

export function normalizeGatewayKey(raw: string | null | undefined): GatewayProviderKey | null {
  if (!raw || typeof raw !== 'string') return null;
  let x = raw.trim().toLowerCase().replace(/-/g, '_').replace(/\s+/g, '_');
  if (x.startsWith('gateway_')) x = x.slice('gateway_'.length);
  if (x === 'mercadopago') x = 'mercado_pago';
  if (x === 'asaas') return 'asaas';
  if (x === 'mercado_pago') return 'mercado_pago';
  const compact = x.replace(/_/g, '');
  if (compact === 'mercadopago') return 'mercado_pago';
  if (compact === 'asaas') return 'asaas';
  return null;
}

export async function getGatewayLinkForAccount(
  tenantId: string,
  financialAccountId: string
): Promise<FinancialAccountGatewayLinkRow | null> {
  const r = await pool.query<FinancialAccountGatewayLinkRow>(
    `SELECT id, tenant_id::text, financial_account_id::text, gateway, is_enabled,
            is_default_receivables, created_at, updated_at
     FROM financial_account_gateway_links
     WHERE tenant_id = $1 AND financial_account_id = $2
     LIMIT 1`,
    [tenantId, financialAccountId]
  );
  return r.rows[0] ?? null;
}

/** Resolve conta para lançar recebimento automático (preferência: default por gateway). */
export async function resolveFinancialAccountForGatewayIncome(
  tenantId: string,
  gatewayKey: GatewayProviderKey
): Promise<{ financial_account_id: string } | null> {
  const r = await pool.query<{ financial_account_id: string }>(
    `SELECT financial_account_id::text AS financial_account_id
     FROM financial_account_gateway_links
     WHERE tenant_id = $1 AND gateway = $2 AND is_enabled = true
     ORDER BY is_default_receivables DESC, created_at ASC
     LIMIT 1`,
    [tenantId, gatewayKey]
  );
  return r.rows[0] ?? null;
}

async function assertNoOtherAccountUsesEnabledGateway(
  tenantId: string,
  gateway: GatewayProviderKey,
  excludeFinancialAccountId: string
): Promise<void> {
  const r = await pool.query(
    `SELECT financial_account_id::text FROM financial_account_gateway_links
     WHERE tenant_id = $1 AND gateway = $2 AND is_enabled = true AND financial_account_id <> $3::uuid
     LIMIT 1`,
    [tenantId, gateway, excludeFinancialAccountId]
  );
  if (r.rowCount && r.rowCount > 0) {
    throw new Error(
      'Já existe outra conta financeira com este gateway activo. Desactive o vínculo na outra conta antes de continuar.'
    );
  }
}

export async function upsertGatewayLinkForAccount(
  tenantId: string,
  financialAccountId: string,
  patch: {
    gateway: GatewayProviderKey;
    is_enabled: boolean;
    is_default_receivables: boolean;
  }
): Promise<FinancialAccountGatewayLinkRow> {
  const acc = await pool.query(`SELECT 1 FROM financial_accounts WHERE tenant_id = $1 AND id = $2`, [
    tenantId,
    financialAccountId,
  ]);
  if (acc.rowCount === 0) throw new Error('Conta não encontrada');

  assertFinancialGatewayKeyAvailable(patch.gateway, patch.gateway);

  await pool.query('BEGIN');
  try {
    if (patch.is_enabled) {
      await assertNoOtherAccountUsesEnabledGateway(tenantId, patch.gateway, financialAccountId);
    }
    if (patch.is_enabled && patch.is_default_receivables) {
      await pool.query(
        `UPDATE financial_account_gateway_links
         SET is_default_receivables = false, updated_at = now()
         WHERE tenant_id = $1 AND gateway = $2 AND financial_account_id <> $3::uuid`,
        [tenantId, patch.gateway, financialAccountId]
      );
    }

    const ins = await pool.query<FinancialAccountGatewayLinkRow>(
      `INSERT INTO financial_account_gateway_links (
         tenant_id, financial_account_id, gateway, is_enabled, is_default_receivables
       ) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (financial_account_id) DO UPDATE SET
         gateway = EXCLUDED.gateway,
         is_enabled = EXCLUDED.is_enabled,
         is_default_receivables = EXCLUDED.is_default_receivables,
         updated_at = now()
       RETURNING id, tenant_id::text, financial_account_id::text, gateway, is_enabled,
                 is_default_receivables, created_at, updated_at`,
      [tenantId, financialAccountId, patch.gateway, patch.is_enabled, patch.is_default_receivables]
    );

    await pool.query('COMMIT');
    const row = ins.rows[0]!;
    return row;
  } catch (e) {
    await pool.query('ROLLBACK');
    throw e;
  }
}

export async function disableGatewayLinkForAccount(tenantId: string, financialAccountId: string): Promise<void> {
  await pool.query(`DELETE FROM financial_account_gateway_links WHERE tenant_id = $1 AND financial_account_id = $2`, [
    tenantId,
    financialAccountId,
  ]);
}

export async function listGatewayLinksForTenant(tenantId: string): Promise<FinancialAccountGatewayLinkRow[]> {
  const r = await pool.query<FinancialAccountGatewayLinkRow>(
    `SELECT id, tenant_id::text, financial_account_id::text, gateway, is_enabled,
            is_default_receivables, created_at, updated_at
     FROM financial_account_gateway_links
     WHERE tenant_id = $1`,
    [tenantId]
  );
  return r.rows;
}
