import type { Pool } from 'pg';
import { normalizeWhatsappDigits } from '../../utils/userIdentity.js';

export type TenantAdminNotifyRow = {
  user_id: string;
  email: string | null;
  whatsapp_digits: string | null;
  first_name: string | null;
  last_name: string | null;
  tenant_name: string;
  responsible_name: string | null;
  billing_email: string | null;
  billing_phone: string | null;
};

export async function loadPrimaryTenantAdminForNotify(
  client: Pool,
  tenantId: string,
): Promise<TenantAdminNotifyRow | null> {
  const r = await client.query<TenantAdminNotifyRow>(
    `SELECT u.id::text AS user_id,
            COALESCE(NULLIF(trim(u.email), ''), NULLIF(trim(t.billing_email), '')) AS email,
            regexp_replace(
              COALESCE(
                NULLIF(trim(COALESCE(u.whatsapp_number, '')), ''),
                NULLIF(trim(COALESCE(p.whatsapp_number, '')), ''),
                ''
              ),
              '\\D', '', 'g'
            ) AS whatsapp_digits,
            p.first_name, p.last_name,
            t.name AS tenant_name,
            t.responsible_name,
            t.billing_email,
            regexp_replace(COALESCE(t.billing_phone, ''), '\\D', '', 'g') AS billing_phone
     FROM users u
     INNER JOIN tenants t ON t.id = u.tenant_id
     LEFT JOIN profiles p ON p.id = u.id
     LEFT JOIN profile_members pm ON pm.user_id = u.id
     LEFT JOIN user_profiles up ON up.id = pm.profile_id
     WHERE u.tenant_id = $1::uuid
       AND COALESCE(u.is_super_admin, false) = false
     GROUP BY u.id, u.email, u.whatsapp_number, p.whatsapp_number, p.first_name, p.last_name,
              t.name, t.responsible_name, t.billing_email, t.billing_phone, u.created_at
     ORDER BY COALESCE(bool_or(up.is_admin), false) DESC, u.created_at ASC
     LIMIT 1`,
    [tenantId],
  );
  return r.rows[0] ?? null;
}

export function resolveRecipientWhatsapp(row: TenantAdminNotifyRow): string | null {
  const fromUser = normalizeWhatsappDigits(row.whatsapp_digits);
  if (fromUser) return fromUser;
  return normalizeWhatsappDigits(row.billing_phone);
}

export function adminDisplayName(row: TenantAdminNotifyRow): string {
  const fn = (row.first_name ?? '').trim();
  const ln = (row.last_name ?? '').trim();
  const joined = [fn, ln].filter(Boolean).join(' ').trim();
  if (joined) return joined;
  const responsible = (row.responsible_name ?? '').trim();
  if (responsible) return responsible;
  return row.email?.trim() || 'Administrador';
}

export function normalizeTenantAdminEmail(email: string | null | undefined): string | null {
  const normalized = (email ?? '').trim().toLowerCase();
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  return normalized;
}
