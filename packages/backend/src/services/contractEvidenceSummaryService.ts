/**
 * Resumo de evidências para auditoria operacional (Etapa 5).
 */
import { pool } from '../utils/db.js';
import { findContractInTenant } from '../utils/contractAccess.js';
import { assertModulePermission } from '../permissions/index.js';
import type { AuthRequest } from '../middleware/auth.js';

export interface EvidenceSignerRow {
  id: string;
  name: string;
  email: string;
  signed_at: string | null;
  evidence: {
    confirmed_name?: string;
    method?: string;
    signed_at?: string;
    client_ip?: string;
    user_agent?: string;
    accepted_terms_version?: string;
    /** PNG e-sign presente em `signature_data` (sem incluir base64 no JSON). */
    signature_image_stored?: boolean;
  } | null;
}

export const EVIDENCE_SUMMARY_SCHEMA_VERSION = 'contracts_evidence_summary_v3';

export async function buildEvidenceSummary(params: {
  contractId: string;
  requestUserId: string;
  req: AuthRequest;
}): Promise<{
  schema_version: string;
  generated_at: string;
  contract: {
    id: string;
    title: string;
    contract_number: string;
    status: string;
    document_frozen_at: string | null;
  };
  signers: EvidenceSignerRow[];
  summary_lines: string[];
} | null> {
  const contract = await findContractInTenant(params.contractId, params.requestUserId);
  if (!contract) return null;

  await assertModulePermission(
    params.requestUserId,
    'contracts',
    'view',
    { ownerId: contract.user_id, assigneeId: contract.responsible_id },
    params.req
  );

  const cr = await pool.query<{
    id: string;
    title: string;
    contract_number: string;
    status: string;
    document_frozen_at: string | null;
  }>(
    `SELECT id, title, contract_number, status::text AS status, document_frozen_at
     FROM contracts WHERE id = $1`,
    [params.contractId]
  );
  const c = cr.rows[0];
  if (!c) return null;

  const sr = await pool.query<{
    id: string;
    name: string;
    email: string;
    signed_at: string | null;
    signature_data: unknown;
  }>(
    `SELECT id, name, email, signed_at, signature_data FROM contract_signers
     WHERE contract_id = $1 ORDER BY signing_order NULLS LAST, created_at`,
    [params.contractId]
  );

  const signers: EvidenceSignerRow[] = sr.rows.map((s) => {
    let evidence: EvidenceSignerRow['evidence'] = null;
    const raw = s.signature_data;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const o = raw as Record<string, unknown>;
      const imgB64 = o.signature_image_png_base64;
      const signature_image_stored =
        typeof imgB64 === 'string' && imgB64.trim().length > 80 ? true : undefined;
      evidence = {
        confirmed_name: typeof o.confirmed_name === 'string' ? o.confirmed_name : undefined,
        method: typeof o.method === 'string' ? o.method : undefined,
        signed_at: typeof o.signed_at === 'string' ? o.signed_at : undefined,
        client_ip: typeof o.client_ip === 'string' ? o.client_ip : undefined,
        user_agent: typeof o.user_agent === 'string' ? o.user_agent : undefined,
        accepted_terms_version:
          typeof o.accepted_terms_version === 'string' ? o.accepted_terms_version : undefined,
        signature_image_stored,
      };
    }
    return {
      id: s.id,
      name: s.name,
      email: s.email,
      signed_at: s.signed_at,
      evidence,
    };
  });

  const generatedAt = new Date().toISOString();
  const summary_lines = signers.map((s) => {
    if (!s.signed_at) {
      return `${s.name} <${s.email}> — ainda não assinou.`;
    }
    const ev = s.evidence;
    const bits = [
      `Assinado: ${s.signed_at}`,
      ev?.confirmed_name ? `Nome confirmado: ${ev.confirmed_name}` : null,
      ev?.client_ip ? `IP: ${ev.client_ip}` : null,
      ev?.method ? `Método: ${ev.method}` : null,
      ev?.accepted_terms_version ? `Aceite: ${ev.accepted_terms_version}` : null,
      ev?.signature_image_stored ? 'Assinatura manuscrita (PNG) armazenada' : null,
    ].filter(Boolean);
    return `${s.name} <${s.email}> — ${bits.join(' · ')}`;
  });

  return {
    schema_version: EVIDENCE_SUMMARY_SCHEMA_VERSION,
    generated_at: generatedAt,
    contract: {
      id: c.id,
      title: c.title,
      contract_number: c.contract_number,
      status: c.status,
      document_frozen_at: c.document_frozen_at,
    },
    signers,
    summary_lines,
  };
}
