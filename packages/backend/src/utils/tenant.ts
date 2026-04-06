/**
 * Utilitários para escopo por tenant (conta/empresa).
 * Usado em controllers para listar/ler/editar/excluir dados visíveis a todos os usuários do mesmo tenant.
 */
import { pool } from './db.js';

/** Retorna o tenant_id do usuário ou null se não vinculado. */
export async function getTenantIdForUser(userId: string): Promise<string | null> {
  const r = await pool.query<{ tenant_id: string }>('SELECT tenant_id FROM users WHERE id = $1', [userId]);
  return r.rows[0]?.tenant_id ?? null;
}

/**
 * Condição SQL para filtrar por tenant: entidades cujo user_id pertence ao mesmo tenant do usuário.
 * Uso: WHERE entity.user_id IN (SELECT id FROM users WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = $N))
 * Parâmetro: passar o userId na posição $N.
 */
export const TENANT_SCOPE_USER_IDS = '(SELECT id FROM users WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = $1))';

/** Retorna true se o usuário é admin do tenant (role 'admin' em algum perfil do tenant). */
export async function isTenantAdmin(userId: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM user_roles ur
     JOIN user_profiles up ON up.id = ur.profile_id
     JOIN users o ON o.id = up.owner_id
     WHERE ur.user_id = $1 AND ur.role = 'admin' AND o.tenant_id = (SELECT tenant_id FROM users WHERE id = $1)
     LIMIT 1`,
    [userId]
  );
  return r.rows.length > 0;
}
