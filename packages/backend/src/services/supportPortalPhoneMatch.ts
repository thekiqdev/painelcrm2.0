import type { PoolClient } from 'pg';
import { pool } from '../utils/db.js';
import { brPhoneSearchKeysExpanded, onlyDigits } from '../utils/phone.js';

export { onlyDigits, brPhoneSearchKeys, brPhoneSearchKeysExpanded } from '../utils/phone.js';

export type PhoneMatchClientRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  profile_id: string | null;
};

export type PhoneMatchLeadRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  profile_id: string | null;
};

export type PhoneMatchResolution<T> = {
  match: T | null;
  candidateCount: number;
  autoPicked: boolean;
  emailDisambiguated: boolean;
  unresolvedConflict: boolean;
};

function normalizeEmailForMatch(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

/** Extrai só dígitos no PostgreSQL (POSIX — não usar \\D, que não é classe de dígito). */
function pgDigitsOnly(sqlExpr: string): string {
  return `regexp_replace(TRIM(COALESCE(${sqlExpr}, '')), '[^0-9]', '', 'g')`;
}

/**
 * Compara coluna de telefone com lista de chaves (nacional, 55+nacional, etc.).
 * @param keysParamIndex índice do placeholder $N (ex.: 2 → $2::text[])
 */
function sqlPhoneColumnMatchesKeys(columnSql: string, keysParamIndex: number): string {
  const d = pgDigitsOnly(columnSql);
  const p = `$${keysParamIndex}::text[]`;
  return `(
    (${d} <> '' AND ${d} = ANY(${p}))
    OR (length(${d}) >= 12 AND left(${d}, 2) = '55' AND substring(${d} from 3) = ANY(${p}))
    OR (length(${d}) IN (10, 11) AND ('55' || ${d}) = ANY(${p}))
  )`;
}

/**
 * Clientes do tenant cujo phone/whatsapp (ou communication_contacts.phone ligado) coincide com alguma variante.
 */
export async function findTenantClientsByPhoneKeys(
  tenantId: string,
  phoneKeys: string[]
): Promise<{ clients: PhoneMatchClientRow[]; ambiguous: boolean }> {
  if (phoneKeys.length === 0) {
    return { clients: [], ambiguous: false };
  }
  const phoneMatch = sqlPhoneColumnMatchesKeys('c.phone', 2);
  const whatsappMatch = sqlPhoneColumnMatchesKeys('c.whatsapp', 2);
  const ccMatch = sqlPhoneColumnMatchesKeys('cc.phone', 2);

  const r = await pool.query<PhoneMatchClientRow>(
    `WITH hits AS (
       SELECT c.id, c.name, c.email, c.phone, c.whatsapp, c.profile_id
       FROM clients c
       INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1
       WHERE ${phoneMatch}
          OR ${whatsappMatch}
       UNION
       SELECT c.id, c.name, c.email, c.phone, c.whatsapp, c.profile_id
       FROM communication_contacts cc
       INNER JOIN clients c ON c.id = cc.linked_client_id
       INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1
       WHERE cc.tenant_id = $1
         AND cc.linked_client_id IS NOT NULL
         AND ${ccMatch}
     )
     SELECT DISTINCT ON (h.id) h.id::text, h.name, h.email, h.phone, h.whatsapp, h.profile_id::text
     FROM hits h
     ORDER BY h.id`,
    [tenantId, phoneKeys]
  );
  const clients = r.rows;
  return { clients, ambiguous: clients.length > 1 };
}

export async function findTenantLeadsByPhoneKeys(
  tenantId: string,
  phoneKeys: string[]
): Promise<{ leads: PhoneMatchLeadRow[]; ambiguous: boolean }> {
  if (phoneKeys.length === 0) {
    return { leads: [], ambiguous: false };
  }
  const phoneMatch = sqlPhoneColumnMatchesKeys('l.phone', 2);

  const r = await pool.query<PhoneMatchLeadRow>(
    `SELECT l.id::text, l.name, l.email, l.phone, l.profile_id::text
     FROM leads l
     INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = $1
     WHERE ${phoneMatch}
     ORDER BY l.updated_at DESC`,
    [tenantId, phoneKeys]
  );
  const leads = r.rows;
  return { leads, ambiguous: leads.length > 1 };
}

export async function findTenantClientsByEmail(
  tenantId: string,
  email: string
): Promise<{ clients: PhoneMatchClientRow[]; ambiguous: boolean }> {
  const em = email.trim().toLowerCase();
  if (!em) return { clients: [], ambiguous: false };
  const r = await pool.query<PhoneMatchClientRow>(
    `SELECT c.id::text, c.name, c.email, c.phone, c.whatsapp, c.profile_id::text
     FROM clients c
     INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1
     WHERE lower(trim(c.email)) = $2`,
    [tenantId, em]
  );
  return { clients: r.rows, ambiguous: r.rows.length > 1 };
}

async function pickMostRecentClientByIds(
  tenantId: string,
  ids: string[]
): Promise<PhoneMatchClientRow | null> {
  if (ids.length === 0) return null;
  const r = await pool.query<PhoneMatchClientRow>(
    `SELECT c.id::text, c.name, c.email, c.phone, c.whatsapp, c.profile_id::text
     FROM clients c
     INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1
     WHERE c.id = ANY($2::uuid[])
     ORDER BY c.updated_at DESC
     LIMIT 1`,
    [tenantId, ids]
  );
  return r.rows[0] ?? null;
}

async function pickMostRecentLeadByIds(
  tenantId: string,
  ids: string[]
): Promise<PhoneMatchLeadRow | null> {
  if (ids.length === 0) return null;
  const r = await pool.query<PhoneMatchLeadRow>(
    `SELECT l.id::text, l.name, l.email, l.phone, l.profile_id::text
     FROM leads l
     INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = $1
     WHERE l.id = ANY($2::uuid[])
     ORDER BY l.updated_at DESC
     LIMIT 1`,
    [tenantId, ids]
  );
  return r.rows[0] ?? null;
}

/**
 * Resolve cliente por telefone: 1 hit direto; vários → e-mail; senão o mais recente.
 * Conflito só se o e-mail informado bater em mais de um candidato.
 */
export async function resolveTenantClientByPhone(
  tenantId: string,
  phoneKeys: string[],
  email?: string | null
): Promise<PhoneMatchResolution<PhoneMatchClientRow>> {
  const { clients } = await findTenantClientsByPhoneKeys(tenantId, phoneKeys);
  const candidateCount = clients.length;
  const empty: PhoneMatchResolution<PhoneMatchClientRow> = {
    match: null,
    candidateCount: 0,
    autoPicked: false,
    emailDisambiguated: false,
    unresolvedConflict: false,
  };
  if (candidateCount === 0) return empty;
  if (candidateCount === 1) {
    return { match: clients[0], candidateCount: 1, autoPicked: false, emailDisambiguated: false, unresolvedConflict: false };
  }

  const em = normalizeEmailForMatch(email);
  if (em) {
    const byEmail = clients.filter((c) => normalizeEmailForMatch(c.email) === em);
    if (byEmail.length === 1) {
      return {
        match: byEmail[0],
        candidateCount,
        autoPicked: true,
        emailDisambiguated: true,
        unresolvedConflict: false,
      };
    }
    if (byEmail.length > 1) {
      return { match: null, candidateCount, autoPicked: false, emailDisambiguated: false, unresolvedConflict: true };
    }
  }

  const picked = await pickMostRecentClientByIds(
    tenantId,
    clients.map((c) => c.id)
  );
  return {
    match: picked,
    candidateCount,
    autoPicked: Boolean(picked),
    emailDisambiguated: false,
    unresolvedConflict: false,
  };
}

/** Resolve lead por telefone (mesma regra do cliente). */
export async function resolveTenantLeadByPhone(
  tenantId: string,
  phoneKeys: string[],
  email?: string | null
): Promise<PhoneMatchResolution<PhoneMatchLeadRow>> {
  const { leads } = await findTenantLeadsByPhoneKeys(tenantId, phoneKeys);
  const candidateCount = leads.length;
  const empty: PhoneMatchResolution<PhoneMatchLeadRow> = {
    match: null,
    candidateCount: 0,
    autoPicked: false,
    emailDisambiguated: false,
    unresolvedConflict: false,
  };
  if (candidateCount === 0) return empty;
  if (candidateCount === 1) {
    return { match: leads[0], candidateCount: 1, autoPicked: false, emailDisambiguated: false, unresolvedConflict: false };
  }

  const em = normalizeEmailForMatch(email);
  if (em) {
    const byEmail = leads.filter((l) => normalizeEmailForMatch(l.email) === em);
    if (byEmail.length === 1) {
      return {
        match: byEmail[0],
        candidateCount,
        autoPicked: true,
        emailDisambiguated: true,
        unresolvedConflict: false,
      };
    }
    if (byEmail.length > 1) {
      return { match: null, candidateCount, autoPicked: false, emailDisambiguated: false, unresolvedConflict: true };
    }
  }

  const picked = await pickMostRecentLeadByIds(
    tenantId,
    leads.map((l) => l.id)
  );
  return {
    match: picked,
    candidateCount,
    autoPicked: Boolean(picked),
    emailDisambiguated: false,
    unresolvedConflict: false,
  };
}

export async function findTenantLeadsByEmail(
  tenantId: string,
  email: string
): Promise<{ leads: PhoneMatchLeadRow[]; ambiguous: boolean }> {
  const em = email.trim().toLowerCase();
  if (!em) return { leads: [], ambiguous: false };
  const r = await pool.query<PhoneMatchLeadRow>(
    `SELECT l.id::text, l.name, l.email, l.phone, l.profile_id::text
     FROM leads l
     INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = $1
     WHERE lower(trim(l.email)) = $2`,
    [tenantId, em]
  );
  return { leads: r.rows, ambiguous: r.rows.length > 1 };
}

export async function insertSupportPortalLead(params: {
  db: PoolClient;
  ownerUserId: string;
  name: string;
  phoneDigits: string;
  email: string | null;
  notes: string;
}): Promise<{ id: string; name: string; profile_id: string | null }> {
  const ins = await params.db.query<{
    id: string;
    name: string;
    profile_id: string | null;
  }>(
    `INSERT INTO leads (user_id, name, email, phone, company, source, status, notes, profile_id)
     VALUES ($1, $2, $3, $4, NULL, 'support_portal', NULL, $5, NULL)
     RETURNING id::text AS id, name, profile_id::text AS profile_id`,
    [params.ownerUserId, params.name, params.email, params.phoneDigits, params.notes]
  );
  const row = ins.rows[0];
  if (!row) throw new Error('insertSupportPortalLead: no row');
  return { id: row.id, name: row.name, profile_id: row.profile_id };
}

/** Igualdade do telefone do ticket (só dígitos) com o input do utilizador (variantes BR). */
export function ticketContactPhoneMatchesInput(
  storedContactPhone: string | null | undefined,
  rawInputPhone: string
): boolean {
  const keysInput = brPhoneSearchKeysExpanded(rawInputPhone);
  if (keysInput.length === 0) return false;
  const stored = onlyDigits(storedContactPhone ?? '');
  if (!stored) return false;
  const keysStored = brPhoneSearchKeysExpanded(stored);
  if (keysStored.length === 0) return false;
  return keysInput.some((k) => keysStored.includes(k));
}
