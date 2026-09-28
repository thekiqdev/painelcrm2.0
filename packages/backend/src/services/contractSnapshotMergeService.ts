import type { Pool, PoolClient } from 'pg';
import { applyContractMergeFieldsToHtml } from '../utils/contractMergeFields.js';
import { computeSignatureTenancyDates } from './contractTenancyService.js';
import { loadContractMergeEnrichment } from './contractMergeContextLoader.js';

function parseVariablesCell(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  try {
    const p = JSON.parse(String(raw));
    return typeof p === 'object' && p !== null && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function normalizeIsoDate(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1]! : s.slice(0, 10);
}

/** Base sem migração 116 (`tenancy_rules` em `contracts`). */
function isMissingTenancyRulesColumnError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return (
    e?.code === '42703' &&
    typeof e?.message === 'string' &&
    e.message.includes('tenancy_rules')
  );
}

type ContractSnapshotRow = {
  title: string;
  contract_number: string;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
  total_value: string | null;
  currency: string | null;
  start_date: Date | string | null;
  end_date: Date | string | null;
  tenancy_rules: unknown;
  content_snapshot_html: string | null;
  variables: unknown;
};

async function selectContractRowForSnapshotMerge(
  q: Pool | PoolClient,
  contractId: string,
): Promise<ContractSnapshotRow | undefined> {
  try {
    const sel = await q.query<ContractSnapshotRow>(
      `SELECT title, contract_number, status, created_at, updated_at,
              total_value, currency, start_date, end_date, tenancy_rules, content_snapshot_html, variables
       FROM contracts WHERE id = $1 FOR UPDATE`,
      [contractId],
    );
    return sel.rows[0];
  } catch (err) {
    if (!isMissingTenancyRulesColumnError(err)) throw err;
    const sel = await q.query<Omit<ContractSnapshotRow, 'tenancy_rules'> & { tenancy_rules?: unknown }>(
      `SELECT title, contract_number, status, created_at, updated_at,
              total_value, currency, start_date, end_date, content_snapshot_html, variables
       FROM contracts WHERE id = $1 FOR UPDATE`,
      [contractId],
    );
    const r = sel.rows[0];
    if (!r) return undefined;
    return { ...r, tenancy_rules: null };
  }
}

/**
 * Na ativação (última assinatura): aplica vigência com base em `signature_date`, se ainda não houver datas manuais,
 * e reexecuta merge no snapshot para materializar `{{contract.*}}` (ex.: datas calculadas).
 * Deve ser chamado dentro da mesma transação que altera o status para ACTIVE.
 */
export async function applySignatureTenancyOnActivationInTx(
  q: Pool | PoolClient,
  contractId: string,
): Promise<void> {
  const row = await selectContractRowForSnapshotMerge(q, contractId);
  if (!row?.content_snapshot_html) return;

  let startD = normalizeIsoDate(row.start_date);
  let endD = normalizeIsoDate(row.end_date);

  if (startD == null && endD == null) {
    const computed = computeSignatureTenancyDates(row.tenancy_rules, new Date());
    if (computed) {
      await q.query(
        `UPDATE contracts SET start_date = $2::date, end_date = $3::date, updated_at = now() WHERE id = $1`,
        [contractId, computed.start, computed.end],
      );
      startD = computed.start;
      endD = computed.end;
    }
  }

  const tv = row.total_value != null ? parseFloat(String(row.total_value)) : null;
  const enrichment = await loadContractMergeEnrichment(contractId, q);
  const merged = applyContractMergeFieldsToHtml(String(row.content_snapshot_html), {
    title: row.title,
    total_value: Number.isFinite(tv) ? tv : null,
    currency: row.currency || 'BRL',
    start_date: startD,
    end_date: endD,
    variables: parseVariablesCell(row.variables),
    contract_number: row.contract_number,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    tenant: enrichment.tenant,
    client: enrichment.client,
    operator: enrichment.operator,
    signerPrimary: enrichment.signerPrimary,
  });

  await q.query(`UPDATE contracts SET content_snapshot_html = $2, updated_at = now() WHERE id = $1`, [
    contractId,
    merged,
  ]);
}
