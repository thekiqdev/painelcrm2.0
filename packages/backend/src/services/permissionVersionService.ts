/**
 * Versionamento de permissões por usuário para invalidação de cache (Permission Engine).
 * getPermissionVersion: usado pelo resolver para montar cacheKey = permissions:userId:version.
 * incrementPermissionVersion: chamado quando role/custom role ou definição de permissões mudar.
 */
import { pool } from '../utils/db.js';

/**
 * Retorna a versão atual das permissões do usuário.
 * Se não existir registro, insere (user_id, 0) e retorna 0.
 */
export async function getPermissionVersion(userId: string): Promise<number> {
  const selectResult = await pool.query<{ version: string }>(
    'SELECT version FROM user_permission_versions WHERE user_id = $1',
    [userId]
  );
  const existing = selectResult.rows[0];
  if (existing) {
    const v = parseInt(existing.version, 10);
    return Number.isNaN(v) ? 0 : v;
  }
  await pool.query(
    'INSERT INTO user_permission_versions (user_id, version) VALUES ($1, 0) ON CONFLICT (user_id) DO NOTHING',
    [userId]
  );
  const afterInsert = await pool.query<{ version: string }>(
    'SELECT version FROM user_permission_versions WHERE user_id = $1',
    [userId]
  );
  const row = afterInsert.rows[0];
  if (!row) return 0;
  const v = parseInt(row.version, 10);
  return Number.isNaN(v) ? 0 : v;
}

/**
 * Incrementa a versão das permissões do usuário.
 * Deve ser chamado quando as permissões efetivas do usuário mudarem
 * (alteração de role/custom role ou de definição de permissões).
 */
export async function incrementPermissionVersion(userId: string): Promise<void> {
  await pool.query(
    `INSERT INTO user_permission_versions (user_id, version, updated_at)
     VALUES ($1, 1, now())
     ON CONFLICT (user_id) DO UPDATE SET
       version = user_permission_versions.version + 1,
       updated_at = now()`,
    [userId]
  );
}
