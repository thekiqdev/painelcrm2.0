import crypto from 'node:crypto';
import { pool } from '../utils/db.js';
import { hashPublicViewToken } from './contractPublicViewService.js';

export { hashPublicViewToken as hashProposalPublicToken };

export function generateProposalPublicRawToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export interface ProposalPublicTokenRow {
  id: string;
  proposal_id: string;
  tenant_id: string;
  created_at: string;
  revoked_at: string | null;
}

/** Revoga tokens ativos da proposta e insere um novo hash. Retorna o token cru apenas uma vez. */
export async function issueNewPublicTokenForProposal(params: {
  proposalId: string;
  tenantId: string;
}): Promise<{ rawToken: string }> {
  const raw = generateProposalPublicRawToken();
  const tokenHash = hashPublicViewToken(raw);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE proposal_public_view_tokens SET revoked_at = now()
       WHERE proposal_id = $1 AND tenant_id = $2 AND revoked_at IS NULL`,
      [params.proposalId, params.tenantId]
    );
    await client.query(
      `INSERT INTO proposal_public_view_tokens (proposal_id, tenant_id, token_hash)
       VALUES ($1, $2, $3)`,
      [params.proposalId, params.tenantId, tokenHash]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return { rawToken: raw };
}

export async function revokeActivePublicTokensForProposal(
  proposalId: string,
  tenantId: string
): Promise<number> {
  const r = await pool.query(
    `UPDATE proposal_public_view_tokens SET revoked_at = now()
     WHERE proposal_id = $1 AND tenant_id = $2 AND revoked_at IS NULL`,
    [proposalId, tenantId]
  );
  return r.rowCount ?? 0;
}

export async function getActiveTokenMetaForProposal(
  proposalId: string,
  tenantId: string
): Promise<{ created_at: string } | null> {
  const r = await pool.query<{ created_at: string }>(
    `SELECT created_at::text AS created_at
     FROM proposal_public_view_tokens
     WHERE proposal_id = $1 AND tenant_id = $2 AND revoked_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [proposalId, tenantId]
  );
  return r.rows[0] ?? null;
}

/** Resolve proposta + tenant por token cru; valida não revogado e alinhamento tenant/proposta. */
export async function resolveProposalByPublicRawToken(
  rawToken: string
): Promise<{
  proposal_id: string;
  tenant_id: string;
  token_row_id: string;
} | null> {
  const trimmed = String(rawToken || '').trim();
  if (trimmed.length < 32) return null;
  const tokenHash = hashPublicViewToken(trimmed);
  const r = await pool.query<{
    proposal_id: string;
    tenant_id: string;
    id: string;
  }>(
    `SELECT t.id, t.proposal_id::text AS proposal_id, t.tenant_id::text AS tenant_id
     FROM proposal_public_view_tokens t
     WHERE t.token_hash = $1 AND t.revoked_at IS NULL
     LIMIT 1`,
    [tokenHash]
  );
  const row = r.rows[0];
  if (!row) return null;

  const verify = await pool.query<{ ok: string }>(
    `SELECT p.id::text AS ok
     FROM proposals p
     INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $2
     WHERE p.id = $1`,
    [row.proposal_id, row.tenant_id]
  );
  if (!verify.rows[0]?.ok) return null;

  return {
    proposal_id: row.proposal_id,
    tenant_id: row.tenant_id,
    token_row_id: row.id,
  };
}

/** Alinhado ao Postgres `valid_until::date < CURRENT_DATE` (timezone do servidor do banco). */
export async function isProposalExpiredByValidUntil(validUntil: string | null | undefined): Promise<boolean> {
  if (!validUntil) return false;
  const r = await pool.query<{ x: boolean }>(
    `SELECT ($1::date < CURRENT_DATE) AS x`,
    [validUntil]
  );
  return r.rows[0]?.x === true;
}

export interface ProposalPublicViewPayload {
  kind: 'proposal_public_view';
  title: string;
  description: string | null;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    total: number;
  }>;
  amount: number;
  client_name: string | null;
  tenant_name: string | null;
  /** Branding do tenant (logos + nome) para páginas públicas */
  tenant_branding: {
    name: string | null;
    logo_url: string | null;
    logo_light_url: string | null;
    logo_dark_url: string | null;
  };
  responsible_display: string;
  status: string;
  /** Status após aplicar validade (sem persistir `expired` no banco nesta etapa). */
  display_status: string;
  valid_until: string | null;
  sent_date: string | null;
  can_accept: boolean;
  can_reject: boolean;
  is_expired_by_validity: boolean;
  converted_invoice_id: string | null;
}

export async function loadProposalPublicPayload(
  proposalId: string,
  tenantId: string
): Promise<ProposalPublicViewPayload | null> {
  const r = await pool.query<{
    title: string;
    description: string | null;
    items: unknown;
    amount: string;
    status: string;
    valid_until: string | null;
    sent_date: string | null;
    converted_invoice_id: string | null;
    client_name: string | null;
    tenant_name: string | null;
    first_name: string | null;
    last_name: string | null;
    tenant_logo_url: string | null;
    tenant_logo_light_url: string | null;
    tenant_logo_dark_url: string | null;
  }>(
    `SELECT p.title, p.description, p.items, p.amount, p.status, p.valid_until::text AS valid_until,
            p.sent_date::text AS sent_date, p.converted_invoice_id::text AS converted_invoice_id,
            CASE WHEN uclient.id IS NOT NULL THEN c.name ELSE NULL END AS client_name,
            tn.name AS tenant_name,
            tn.logo_url AS tenant_logo_url,
            tn.logo_light_url AS tenant_logo_light_url,
            tn.logo_dark_url AS tenant_logo_dark_url,
            pr.first_name, pr.last_name
     FROM proposals p
     INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $2
     INNER JOIN tenants tn ON tn.id = $2
     LEFT JOIN clients c ON c.id = p.client_id
     LEFT JOIN users uclient ON uclient.id = c.user_id AND uclient.tenant_id = $2
     LEFT JOIN profiles pr ON pr.id = p.user_id
     WHERE p.id = $1`,
    [proposalId, tenantId]
  );
  const row = r.rows[0];
  if (!row) return null;

  const expiredByDate = await isProposalExpiredByValidUntil(row.valid_until);
  const itemsArr = Array.isArray(row.items) ? row.items : [];
  const items = itemsArr.map((raw: Record<string, unknown>) => {
    const qty = Math.max(0, Number(raw.quantity) || 0);
    const unit = Math.max(0, Number(raw.unitPrice ?? raw.unit_price) || 0);
    const disc = Math.max(0, Number(raw.discount) || 0);
    const total = Math.max(0, Number(raw.total) || qty * unit - disc);
    return {
      description: String(raw.description ?? ''),
      quantity: qty,
      unitPrice: unit,
      discount: disc,
      total,
    };
  });

  const nameFromProfile = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
  const responsible_display = nameFromProfile || 'Contato comercial';

  const st = row.status;
  const display_status = expiredByDate && st === 'sent' ? 'expired' : st;

  const can_accept =
    st === 'sent' && !row.converted_invoice_id && !expiredByDate;
  const can_reject = can_accept;

  return {
    kind: 'proposal_public_view',
    title: row.title,
    description: row.description,
    items,
    amount: parseFloat(row.amount || '0'),
    client_name: row.client_name,
    tenant_name: row.tenant_name,
    tenant_branding: {
      name: row.tenant_name,
      logo_url: row.tenant_logo_url,
      logo_light_url: row.tenant_logo_light_url,
      logo_dark_url: row.tenant_logo_dark_url,
    },
    responsible_display,
    status: st,
    display_status,
    valid_until: row.valid_until,
    sent_date: row.sent_date,
    can_accept,
    can_reject,
    is_expired_by_validity: expiredByDate,
    converted_invoice_id: row.converted_invoice_id,
  };
}

