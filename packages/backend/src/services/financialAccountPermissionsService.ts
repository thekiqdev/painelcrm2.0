/**
 * Permissões de visibilidade por conta financeira (financial_account_permissions + visibility_mode).
 */
import { pool } from '../utils/db.js';
import { isTenantAdmin } from '../utils/tenant.js';
import { checkPermission } from '../permissions/permissionEngine.js';
import type { RequestWithPermissionMap } from '../permissions/permissionTypes.js';
import type { FinancialAccountRow, FinancialAccountVisibilityMode } from './financialAccountsService.js';

export type AccountPermissionKind = 'view' | 'manage';

export interface FinancialAccountPermissionRow {
  id: string;
  tenant_id: string;
  account_id: string;
  user_id: string | null;
  team_id: string | null;
  permission: AccountPermissionKind;
  created_at: string;
  updated_at: string;
}

export interface TenantUserPickerRow {
  id: string;
  email: string | null;
  display_name: string | null;
}

async function fetchGrantedAccountIdsForUser(tenantId: string, userId: string): Promise<Set<string>> {
  const r = await pool.query<{ account_id: string }>(
    `SELECT DISTINCT fap.account_id::text AS account_id
     FROM financial_account_permissions fap
     WHERE fap.tenant_id = $1
       AND (
         fap.user_id = $2
         OR EXISTS (
           SELECT 1 FROM team_members tm
           WHERE tm.team_id = fap.team_id AND tm.user_id = $2
         )
       )`,
    [tenantId, userId]
  );
  return new Set(r.rows.map((x) => x.account_id));
}

/** IDs de contas que o utilizador pode ver (módulo financeiro + regras da conta). */
export async function getVisibleFinancialAccountIdsForUser(
  tenantId: string,
  userId: string,
  req?: RequestWithPermissionMap
): Promise<Set<string>> {
  const [admin, financeView] = await Promise.all([
    isTenantAdmin(userId),
    checkPermission({ userId, tenantId, module: 'finance', action: 'view' }, req),
  ]);

  const rows = await pool.query<{
    id: string;
    visibility_mode: FinancialAccountVisibilityMode;
  }>(
    `SELECT id::text,
            COALESCE(visibility_mode, 'all_finance_users')::text AS visibility_mode
     FROM financial_accounts WHERE tenant_id = $1`,
    [tenantId]
  );

  if (admin) {
    return new Set(rows.rows.map((x) => x.id));
  }
  if (!financeView) {
    return new Set();
  }

  const granted = await fetchGrantedAccountIdsForUser(tenantId, userId);
  const visible = new Set<string>();
  for (const row of rows.rows) {
    const mode = row.visibility_mode ?? 'all_finance_users';
    if (mode === 'admins_only') continue;
    if (mode === 'all_finance_users') visible.add(row.id);
    else if (mode === 'restricted' && granted.has(row.id)) visible.add(row.id);
  }
  return visible;
}

export async function canUserViewFinancialAccountId(
  tenantId: string,
  userId: string,
  accountId: string,
  req?: RequestWithPermissionMap
): Promise<boolean> {
  const ids = await getVisibleFinancialAccountIdsForUser(tenantId, userId, req);
  return ids.has(accountId);
}

export async function listPermissionRowsForAccount(
  tenantId: string,
  accountId: string
): Promise<FinancialAccountPermissionRow[]> {
  const r = await pool.query<FinancialAccountPermissionRow>(
    `SELECT id, tenant_id::text, account_id::text,
            user_id::text, team_id::text, permission,
            created_at, updated_at
     FROM financial_account_permissions
     WHERE tenant_id = $1 AND account_id = $2
     ORDER BY created_at ASC`,
    [tenantId, accountId]
  );
  return r.rows;
}

export async function replaceAccountPermissions(
  tenantId: string,
  accountId: string,
  visibilityMode: FinancialAccountVisibilityMode,
  grants: Array<{ user_id?: string | null; team_id?: string | null; permission: AccountPermissionKind }>
): Promise<void> {
  const acc = await pool.query(`SELECT 1 FROM financial_accounts WHERE tenant_id = $1 AND id = $2`, [
    tenantId,
    accountId,
  ]);
  if (acc.rowCount === 0) throw new Error('Conta não encontrada');

  await pool.query('BEGIN');
  try {
    await pool.query(
      `UPDATE financial_accounts SET visibility_mode = $3, updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, accountId, visibilityMode]
    );

    await pool.query(`DELETE FROM financial_account_permissions WHERE tenant_id = $1 AND account_id = $2`, [
      tenantId,
      accountId,
    ]);

    if (visibilityMode === 'restricted' && grants.length > 0) {
      for (const g of grants) {
        const uid = g.user_id?.trim() || null;
        const tid = g.team_id?.trim() || null;
        if ((uid != null) === (tid != null)) {
          throw new Error('Cada permissão deve referir um utilizador ou uma equipa');
        }
        if (uid) {
          const u = await pool.query(`SELECT 1 FROM users WHERE id = $1::uuid AND tenant_id = $2`, [uid, tenantId]);
          if (u.rowCount === 0) throw new Error('Utilizador inválido para a empresa');
          await pool.query(
            `INSERT INTO financial_account_permissions (tenant_id, account_id, user_id, team_id, permission)
             VALUES ($1, $2::uuid, $3::uuid, NULL, $4)`,
            [tenantId, accountId, uid, g.permission]
          );
        } else if (tid) {
          const t = await pool.query(`SELECT 1 FROM teams WHERE id = $1::uuid AND tenant_id = $2`, [tid, tenantId]);
          if (t.rowCount === 0) throw new Error('Equipa inválida para a empresa');
          await pool.query(
            `INSERT INTO financial_account_permissions (tenant_id, account_id, user_id, team_id, permission)
             VALUES ($1, $2::uuid, NULL, $3::uuid, $4)`,
            [tenantId, accountId, tid, g.permission]
          );
        }
      }
    }

    await pool.query('COMMIT');
  } catch (e) {
    await pool.query('ROLLBACK');
    throw e;
  }
}

export async function listTeamsForPicker(tenantId: string): Promise<{ id: string; name: string }[]> {
  const r = await pool.query<{ id: string; name: string }>(
    `SELECT id::text AS id, name FROM teams WHERE tenant_id = $1 ORDER BY lower(name)`,
    [tenantId]
  );
  return r.rows;
}

export async function listTenantUsersForPicker(tenantId: string): Promise<TenantUserPickerRow[]> {
  const r = await pool.query<TenantUserPickerRow>(
    `SELECT u.id::text AS id,
            u.email,
            TRIM(CONCAT(COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, ''))) AS display_name
     FROM users u
     LEFT JOIN profiles p ON p.id = u.id
     WHERE u.tenant_id = $1 AND COALESCE(u.is_super_admin, false) = false
     ORDER BY lower(COALESCE(p.first_name, '')), lower(u.email)`,
    [tenantId]
  );
  return r.rows.map((row) => ({
    ...row,
    display_name: row.display_name?.trim() || row.email?.split('@')[0] || 'Utilizador',
  }));
}
