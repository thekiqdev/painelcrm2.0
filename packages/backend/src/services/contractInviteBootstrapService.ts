/**
 * Emissão automática de convites de assinatura ao enviar contrato para PENDING_SIGNATURE (aprimoramento UX).
 */
import type { AuthRequest } from '../middleware/auth.js';
import { pool } from '../utils/db.js';
import { assertModulePermission } from '../permissions/index.js';
import { findContractInTenant } from '../utils/contractAccess.js';
import { isDraftStatus } from './contractLifecycle.js';
import { issueSignatureInvite } from './contractSignatureInviteService.js';

export type SignatureInviteBootstrapItem =
  | { signer_id: string; token: string; frontend_path: string; expires_at: string | null }
  | { signer_id: string; already_active: true }
  | { signer_id: string; error: string };

/**
 * Para cada signatário sem assinatura, emite convite com regenerate=false.
 * Se já existir convite ativo, devolve `already_active` (token opaco não pode ser recuperado do hash).
 */
export async function bootstrapSignatureInvitesForContract(params: {
  contractId: string;
  requestUserId: string;
  createdByUserId: string;
  req: AuthRequest;
  /** Garantir que só corre no primeiro envio a partir de rascunho. */
  previousStatus: string;
  newStatus: string;
}): Promise<SignatureInviteBootstrapItem[]> {
  if (!isDraftStatus(params.previousStatus) || params.newStatus !== 'PENDING_SIGNATURE') {
    return [];
  }

  const contract = await findContractInTenant(params.contractId, params.requestUserId);
  if (!contract) return [];

  await assertModulePermission(
    params.requestUserId,
    'contracts',
    'edit',
    { ownerId: contract.user_id, assigneeId: contract.responsible_id },
    params.req
  );

  const sr = await pool.query<{ id: string }>(
    `SELECT id FROM contract_signers WHERE contract_id = $1 ORDER BY signing_order NULLS LAST, created_at`,
    [params.contractId]
  );

  const out: SignatureInviteBootstrapItem[] = [];
  for (const row of sr.rows) {
    const r = await issueSignatureInvite({
      contractId: params.contractId,
      signerId: row.id,
      requesterUserId: params.requestUserId,
      regenerate: false,
      createdByUserId: params.createdByUserId,
    });
    if (!r.ok) {
      if (r.code === 'ALREADY_EXISTS') {
        out.push({ signer_id: row.id, already_active: true });
      } else if (r.code === 'CONFLICT') {
        out.push({ signer_id: row.id, error: 'CONFLICT' });
      } else if (r.code === 'NOT_ELIGIBLE') {
        out.push({ signer_id: row.id, error: 'NOT_ELIGIBLE' });
      } else {
        out.push({ signer_id: row.id, error: r.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'UNKNOWN' });
      }
      continue;
    }
    out.push({
      signer_id: row.id,
      token: r.raw_token,
      frontend_path: r.frontend_path,
      expires_at: r.expires_at,
    });
  }

  return out;
}
