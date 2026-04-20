import type { Pool, PoolClient } from 'pg';

type Db = Pool | PoolClient;

export type ContractMergeEnrichment = {
  tenant: { name: string | null; domain: string | null; slug: string | null } | null;
  client: {
    name: string | null;
    email: string | null;
    phone: string | null;
    company: string | null;
    cpf_cnpj: string | null;
    status: string | null;
    source: string | null;
    funnel_stage: string | null;
    notes: string | null;
  } | null;
  operator: {
    email: string | null;
    whatsapp_number: string | null;
    first_name: string | null;
    last_name: string | null;
    company_name: string | null;
    profile_whatsapp: string | null;
  } | null;
  signerPrimary: {
    name: string;
    signed_at: Date | string | null;
    signed: boolean;
  } | null;
};

type EnrichmentRow = {
  client_id: string | null;
  responsible_id: string | null;
  tenant_name: string | null;
  tenant_domain: string | null;
  tenant_slug: string | null;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  client_company: string | null;
  client_cpf_cnpj: string | null;
  client_status: string | null;
  client_source: string | null;
  client_funnel_stage: string | null;
  client_notes: string | null;
  operator_email: string | null;
  operator_user_whatsapp: string | null;
  operator_first_name: string | null;
  operator_last_name: string | null;
  operator_company_name: string | null;
  operator_profile_whatsapp: string | null;
};

/** Carrega dados relacionados para merge (mesmo tenant do contrato). */
export async function loadContractMergeEnrichment(contractId: string, db: Db): Promise<ContractMergeEnrichment> {
  const main = await db.query<EnrichmentRow>(
    `SELECT
       c.client_id,
       c.responsible_id,
       t.name AS tenant_name,
       t.domain AS tenant_domain,
       t.slug AS tenant_slug,
       cl.name AS client_name,
       cl.email AS client_email,
       cl.phone AS client_phone,
       cl.company AS client_company,
       cl.cpf_cnpj AS client_cpf_cnpj,
       cl.status AS client_status,
       cl.source AS client_source,
       cl.funnel_stage AS client_funnel_stage,
       cl.notes AS client_notes,
       op.email AS operator_email,
       op.whatsapp_number AS operator_user_whatsapp,
       pf.first_name AS operator_first_name,
       pf.last_name AS operator_last_name,
       pf.company_name AS operator_company_name,
       pf.whatsapp_number AS operator_profile_whatsapp
     FROM contracts c
     LEFT JOIN clients cl ON cl.id = c.client_id
     LEFT JOIN users op ON op.id = c.responsible_id
     LEFT JOIN profiles pf ON pf.id = op.id
     LEFT JOIN users owner ON owner.id = c.user_id
     LEFT JOIN tenants t ON t.id = owner.tenant_id
     WHERE c.id = $1`,
    [contractId],
  );

  const row = main.rows[0];
  const tenant =
    row && (row.tenant_name || row.tenant_domain || row.tenant_slug)
      ? {
          name: row.tenant_name,
          domain: row.tenant_domain,
          slug: row.tenant_slug,
        }
      : null;

  const client =
    row?.client_id
      ? {
          name: row.client_name,
          email: row.client_email,
          phone: row.client_phone,
          company: row.client_company,
          cpf_cnpj: row.client_cpf_cnpj,
          status: row.client_status,
          source: row.client_source,
          funnel_stage: row.client_funnel_stage,
          notes: row.client_notes,
        }
      : null;

  const operator =
    row?.responsible_id && row.operator_email
      ? {
          email: row.operator_email,
          whatsapp_number: row.operator_user_whatsapp,
          first_name: row.operator_first_name,
          last_name: row.operator_last_name,
          company_name: row.operator_company_name,
          profile_whatsapp: row.operator_profile_whatsapp,
        }
      : row?.responsible_id
        ? {
            email: row.operator_email,
            whatsapp_number: row.operator_user_whatsapp,
            first_name: row.operator_first_name,
            last_name: row.operator_last_name,
            company_name: row.operator_company_name,
            profile_whatsapp: row.operator_profile_whatsapp,
          }
        : null;

  const sig = await db.query<{ name: string; signed_at: Date | string | null }>(
    `SELECT name, signed_at
     FROM contract_signers
     WHERE contract_id = $1
     ORDER BY signing_order NULLS LAST, created_at ASC
     LIMIT 1`,
    [contractId],
  );

  const s0 = sig.rows[0];
  const signerPrimary = s0
    ? {
        name: s0.name,
        signed_at: s0.signed_at,
        signed: s0.signed_at != null,
      }
    : null;

  return { tenant, client, operator, signerPrimary };
}
