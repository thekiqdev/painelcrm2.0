/**
 * Nome/foto do operador para merge na conversa e WebSocket (Atender / flows).
 */
import { pool } from '../utils/db.js';
import { refreshCatalogMediaRelativeSignedUrl } from '../utils/catalogMediaPublicSignedUrl.js';

export type AssigneePublicFields = {
  assignee_email: string | null;
  assignee_display: string | null;
  assignee_avatar_url: string | null;
};

export async function loadAssigneePublicFields(
  userId: string | null | undefined
): Promise<AssigneePublicFields> {
  if (!userId) {
    return { assignee_email: null, assignee_display: null, assignee_avatar_url: null };
  }
  try {
    const r = await pool.query<{
      email: string;
      display: string | null;
      avatar: string | null;
    }>(
      `SELECT u.email,
              COALESCE(
                NULLIF(TRIM(COALESCE(pf.first_name, '') || ' ' || COALESCE(pf.last_name, '')), ''),
                u.email
              ) AS display,
              COALESCE(NULLIF(TRIM(pf.avatar_url), ''), NULLIF(TRIM(u.avatar_url), '')) AS avatar
       FROM users u
       LEFT JOIN profiles pf ON pf.id = u.id
       WHERE u.id = $1`,
      [userId]
    );
    const row = r.rows[0];
    if (!row) return { assignee_email: null, assignee_display: null, assignee_avatar_url: null };
    const av = row.avatar?.trim() || null;
    return {
      assignee_email: row.email ?? null,
      assignee_display: row.display?.trim() || row.email || null,
      // Re-assina catalog-media (mesmo path do GET /api/me/profile) para a foto carregar no chat.
      assignee_avatar_url: refreshCatalogMediaRelativeSignedUrl(av),
    };
  } catch {
    const r2 = await pool.query<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [
      userId,
    ]);
    const em = r2.rows[0]?.email ?? null;
    return { assignee_email: em, assignee_display: em, assignee_avatar_url: null };
  }
}

/** Campos vazios para limpar assignee no cliente (fila/equipe/unassign). */
export const EMPTY_ASSIGNEE_PUBLIC_FIELDS: AssigneePublicFields = {
  assignee_email: null,
  assignee_display: null,
  assignee_avatar_url: null,
};
