/**
 * Categorias de despesa (globais tenant_id NULL + específicas do tenant).
 */
import { pool } from '../utils/db.js';

export interface ExpenseCategoryRow {
  id: string;
  tenant_id: string | null;
  name: string;
  created_at: string;
}

export async function listExpenseCategories(tenantId: string): Promise<ExpenseCategoryRow[]> {
  const r = await pool.query<ExpenseCategoryRow>(
    `SELECT id, tenant_id::text, name, created_at
     FROM expense_categories
     WHERE tenant_id IS NULL OR tenant_id = $1
     ORDER BY (tenant_id IS NULL) DESC, lower(name) ASC`,
    [tenantId]
  );
  return r.rows.map((row) => ({
    ...row,
    tenant_id: row.tenant_id,
  }));
}

export async function createExpenseCategory(tenantId: string, name: string): Promise<ExpenseCategoryRow> {
  const r = await pool.query<ExpenseCategoryRow>(
    `INSERT INTO expense_categories (tenant_id, name)
     VALUES ($1, $2)
     RETURNING id, tenant_id::text, name, created_at`,
    [tenantId, name.trim()]
  );
  return r.rows[0]!;
}
