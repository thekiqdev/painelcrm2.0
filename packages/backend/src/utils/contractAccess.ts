/**
 * Acesso a contratos no escopo do tenant (mesmo critério de contractsController).
 * Usado por signers/events para alinhar listagem tenant-wide com mutações.
 */
import { pool } from './db.js';

export type ContractTenantRow = {
  id: string;
  user_id: string;
  responsible_id: string | null;
  status: string;
};

/** Contrato visível ao usuário se pertencer ao mesmo tenant (via user_id do criador do contrato). */
export async function findContractInTenant(
  contractId: string,
  requestUserId: string
): Promise<ContractTenantRow | null> {
  const result = await pool.query<ContractTenantRow>(
    `SELECT c.id, c.user_id, c.responsible_id, c.status::text AS status
     FROM contracts c
     INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
     WHERE c.id = $1`,
    [contractId, requestUserId]
  );
  return result.rows[0] ?? null;
}

export type SignerContractRow = {
  signer_id: string;
  contract_id: string;
  user_id: string;
  responsible_id: string | null;
  status: string;
};

/** Signatário + contrato no tenant do solicitante. */
export async function findSignerInTenant(
  signerId: string,
  requestUserId: string
): Promise<SignerContractRow | null> {
  const result = await pool.query<SignerContractRow>(
    `SELECT cs.id AS signer_id, c.id AS contract_id, c.user_id, c.responsible_id, c.status::text AS status
     FROM contract_signers cs
     INNER JOIN contracts c ON c.id = cs.contract_id
     INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
     WHERE cs.id = $1`,
    [signerId, requestUserId]
  );
  return result.rows[0] ?? null;
}
