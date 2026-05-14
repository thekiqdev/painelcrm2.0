import { pool } from '../utils/db.js';

export function digitsOnly(input: string): string {
  return input.replace(/\D/g, '');
}

/**
 * Gera variantes numéricas para igualdade exata com telefones gravados (foco BR: prefixo 55).
 */
export function brPhoneSearchKeys(raw: string): string[] {
  const d = digitsOnly(raw);
  if (d.length < 8) return [];
  const keys = new Set<string>();
  keys.add(d);
  const trimmedLeadingZeros = d.replace(/^0+/, '');
  const x = trimmedLeadingZeros.length >= 8 ? trimmedLeadingZeros : d;
  keys.add(x);
  if (x.length === 10 || x.length === 11) {
    if (!x.startsWith('55')) keys.add(`55${x}`);
  }
  if (x.startsWith('55') && (x.length === 12 || x.length === 13)) {
    keys.add(x);
    const national = x.slice(2);
    if (national.length >= 10) keys.add(national);
  }
  if (x.length >= 11 && !x.startsWith('55')) {
    keys.add(`55${x}`);
  }
  return [...keys].filter((k) => k.length >= 8);
}

export type PhoneMatchClientRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  profile_id: string | null;
};

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
  const r = await pool.query<PhoneMatchClientRow>(
    `WITH hits AS (
       SELECT c.id, c.name, c.email, c.phone, c.whatsapp, c.profile_id
       FROM clients c
       INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1
       WHERE (
         NULLIF(TRIM(c.phone), '') IS NOT NULL
         AND regexp_replace(TRIM(c.phone), '\\D', '', 'g') = ANY($2::text[])
       )
       OR (
         NULLIF(TRIM(COALESCE(c.whatsapp, '')), '') IS NOT NULL
         AND regexp_replace(TRIM(c.whatsapp), '\\D', '', 'g') = ANY($2::text[])
       )
       UNION
       SELECT c.id, c.name, c.email, c.phone, c.whatsapp, c.profile_id
       FROM communication_contacts cc
       INNER JOIN clients c ON c.id = cc.linked_client_id
       WHERE cc.tenant_id = $1
         AND cc.linked_client_id IS NOT NULL
         AND NULLIF(TRIM(cc.phone), '') IS NOT NULL
         AND regexp_replace(TRIM(cc.phone), '\\D', '', 'g') = ANY($2::text[])
     )
     SELECT DISTINCT ON (h.id) h.id, h.name, h.email, h.phone, h.whatsapp, h.profile_id
     FROM hits h
     ORDER BY h.id`,
    [tenantId, phoneKeys]
  );
  const clients = r.rows;
  return { clients, ambiguous: clients.length > 1 };
}

/** Igualdade do telefone do ticket (só dígitos) com o input do utilizador (variantes BR). */
export function ticketContactPhoneMatchesInput(
  storedContactPhone: string | null | undefined,
  rawInputPhone: string,
): boolean {
  const keysInput = brPhoneSearchKeys(rawInputPhone);
  if (keysInput.length === 0) return false;
  const stored = digitsOnly(storedContactPhone ?? '');
  if (!stored) return false;
  const keysStored = brPhoneSearchKeys(stored);
  if (keysStored.length === 0) return false;
  return keysInput.some((k) => keysStored.includes(k));
}
