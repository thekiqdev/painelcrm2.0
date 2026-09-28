import { pool } from '../utils/db.js';
import type { ProposalOperationalContext } from './proposalOperationalCopy.js';

export async function loadProposalOperationalContext(params: {
  proposalId: string;
  tenantId: string;
  publicUrl: string;
}): Promise<ProposalOperationalContext | null> {
  const r = await pool.query<{
    title: string;
    amount: string;
    valid_until: string | null;
    client_name: string | null;
    tenant_name: string;
    first_name: string | null;
    last_name: string | null;
  }>(
    `SELECT p.title, p.amount::text AS amount, p.valid_until::text AS valid_until,
            CASE WHEN uclient.id IS NOT NULL THEN c.name ELSE NULL END AS client_name,
            tn.name AS tenant_name,
            pr.first_name, pr.last_name
     FROM proposals p
     INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $2
     INNER JOIN tenants tn ON tn.id = $2
     LEFT JOIN clients c ON c.id = p.client_id
     LEFT JOIN users uclient ON uclient.id = c.user_id AND uclient.tenant_id = $2
     LEFT JOIN profiles pr ON pr.id = p.user_id
     WHERE p.id = $1`,
    [params.proposalId, params.tenantId]
  );
  const row = r.rows[0];
  if (!row) return null;

  const nameFromProfile = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
  const amt = parseFloat(row.amount || '0');
  const amountStr = amt.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return {
    client_name: row.client_name || 'Cliente',
    proposal_title: row.title,
    proposal_amount: amountStr,
    proposal_link: params.publicUrl || '[Gere o link público na proposta e cole aqui]',
    tenant_name: row.tenant_name || '',
    valid_until: row.valid_until ? formatPtDate(row.valid_until) : '—',
    responsible_name: nameFromProfile || 'Equipe comercial',
  };
}

function formatPtDate(isoDate: string): string {
  try {
    const [y, m, d] = isoDate.split('-').map((x) => parseInt(x, 10));
    if (!y || !m || !d) return isoDate;
    return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  } catch {
    return isoDate;
  }
}
