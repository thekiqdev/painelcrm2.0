import { pool } from '../utils/db.js';

export type ContractSignatureFieldRow = {
  id: string;
  contract_id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  field_type: 'signature' | 'name' | 'date';
  signer_type: 'CLIENT' | 'INTERNAL';
  contract_signer_id: string | null;
  required: boolean;
  label: string | null;
  sort_order: number;
};

export type SignatureFieldInput = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  field_type: 'signature' | 'name' | 'date';
  signer_type?: 'CLIENT' | 'INTERNAL';
  contract_signer_id?: string | null;
  required?: boolean;
  label?: string | null;
  sort_order?: number;
};

function mapRow(r: Record<string, unknown>): ContractSignatureFieldRow {
  return {
    id: String(r.id),
    contract_id: String(r.contract_id),
    page: Number(r.page),
    x: Number(r.x),
    y: Number(r.y),
    width: Number(r.width),
    height: Number(r.height),
    field_type: r.field_type as ContractSignatureFieldRow['field_type'],
    signer_type: (r.signer_type as 'CLIENT' | 'INTERNAL') || 'CLIENT',
    contract_signer_id: r.contract_signer_id != null ? String(r.contract_signer_id) : null,
    required: r.required !== false,
    label: r.label != null ? String(r.label) : null,
    sort_order: Number(r.sort_order ?? 0),
  };
}

export async function listSignatureFields(contractId: string): Promise<ContractSignatureFieldRow[]> {
  const r = await pool.query(
    `SELECT * FROM contract_signature_fields WHERE contract_id = $1 ORDER BY page, sort_order, created_at`,
    [contractId],
  );
  return r.rows.map((row) => mapRow(row as Record<string, unknown>));
}

export async function replaceSignatureFields(
  contractId: string,
  fields: SignatureFieldInput[],
): Promise<ContractSignatureFieldRow[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM contract_signature_fields WHERE contract_id = $1`, [contractId]);
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      await client.query(
        `INSERT INTO contract_signature_fields (
          contract_id, page, x, y, width, height, field_type, signer_type, contract_signer_id, required, label, sort_order
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          contractId,
          Math.max(1, Math.floor(f.page)),
          f.x,
          f.y,
          f.width,
          f.height,
          f.field_type,
          f.signer_type ?? 'CLIENT',
          f.contract_signer_id ?? null,
          f.required !== false,
          f.label ?? null,
          f.sort_order ?? i,
        ],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return listSignatureFields(contractId);
}

export async function insertSignatureAudit(params: {
  contractId: string;
  signerId?: string | null;
  eventType: 'VIEWED' | 'SIGNED' | 'DOWNLOADED';
  clientIp?: string | null;
  userAgent?: string | null;
  documentHashSha256?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await pool.query(
    `INSERT INTO contract_signature_audit_events (
      contract_id, signer_id, event_type, client_ip, user_agent, document_hash_sha256, metadata
    ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [
      params.contractId,
      params.signerId ?? null,
      params.eventType,
      params.clientIp?.slice(0, 80) ?? null,
      params.userAgent?.slice(0, 512) ?? null,
      params.documentHashSha256 ?? null,
      JSON.stringify(params.metadata ?? {}),
    ],
  );
}
