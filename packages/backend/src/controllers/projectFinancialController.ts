import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { pool } from '../utils/db.js';
import { assertModulePermission, assertPermissionKey, ModulePermissionError } from '../permissions/index.js';
import type { PermissionCatalogKey } from '../permissions/permissionCatalog.js';

type ProjectScope = {
  id: string;
  user_id: string;
  client_id: string | null;
};

function moneyFromCents(cents: number): number {
  return Math.round(cents) / 100;
}

async function hasPermission(req: AuthRequest, key: PermissionCatalogKey): Promise<boolean> {
  try {
    await assertPermissionKey(req.userId, key, req);
    return true;
  } catch (error) {
    if (error instanceof ModulePermissionError) return false;
    throw error;
  }
}

async function requireProjectScope(req: AuthRequest, res: Response): Promise<ProjectScope | null> {
  const tenantId = req.tenantId ?? null;
  const userId = req.userId;
  if (!tenantId || !userId) {
    res.status(401).json({ error: 'Empresa ou usuário não identificado' });
    return null;
  }

  const projectResult = await pool.query<ProjectScope>(
    `SELECT p.id, p.user_id, p.client_id
     FROM projects p
     INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $1
     WHERE p.id = $2
     LIMIT 1`,
    [tenantId, req.params.projectId]
  );
  const project = projectResult.rows[0] ?? null;
  if (!project) {
    res.status(404).json({ error: 'Projeto não encontrado' });
    return null;
  }

  try {
    await assertModulePermission(userId, 'projects', 'view', { ownerId: project.user_id }, req);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return null;
    }
    throw error;
  }

  return project;
}

export async function getProjectFinancialInvoices(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    const project = await requireProjectScope(req, res);
    if (!project) return;
    if (!(await hasPermission(req, 'billing.view_invoices'))) {
      res.status(403).json({ error: 'Sem permissão para visualizar faturas' });
      return;
    }

    const rows = await pool.query(
      `SELECT ci.id,
              ci.invoice_number AS number,
              ci.project_id,
              ci.client_id,
              c.name AS client_name,
              ci.amount_cents,
              ci.status,
              ci.due_date::text,
              ci.paid_at,
              ci.gateway,
              ci.payment_method,
              ci.payment_token,
              ci.created_at
       FROM customer_invoices ci
       LEFT JOIN clients c ON c.id = ci.client_id
       WHERE ci.tenant_id = $1
         AND ci.project_id = $2
         AND ci.invoice_type IS DISTINCT FROM 'child'
       ORDER BY ci.created_at DESC`,
      [tenantId, project.id]
    );
    res.json(
      rows.rows.map((row: any) => ({
        ...row,
        amount_cents: Number(row.amount_cents ?? 0),
        amount: moneyFromCents(Number(row.amount_cents ?? 0)),
      }))
    );
  } catch (error) {
    console.error('[projectFinancial] getProjectFinancialInvoices', error);
    res.status(500).json({ error: 'Erro ao listar faturas do projeto' });
  }
}

export async function getProjectFinancialExpenses(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    const project = await requireProjectScope(req, res);
    if (!project) return;
    if (!(await hasPermission(req, 'finance.view_expenses'))) {
      res.status(403).json({ error: 'Sem permissão para visualizar despesas' });
      return;
    }

    const feeRows = await pool.query(
      `SELECT fee.id,
              fee.finance_account_id,
              fa.name AS account_name,
              fa.account_type,
              fee.description,
              fee.amount_cents,
              fee.expense_date::text AS date,
              fee.due_date::text,
              fee.paid_at::text,
              fee.status,
              fee.supplier_name,
              fec.name AS category,
              fee.created_at
       FROM finance_expense_entries fee
       LEFT JOIN finance_expense_categories fec ON fec.id = fee.category_id AND fec.tenant_id = fee.tenant_id
       LEFT JOIN finance_accounts fa ON fa.id = fee.finance_account_id AND fa.tenant_id = fee.tenant_id
       WHERE fee.tenant_id = $1
         AND fee.project_id = $2`,
      [tenantId, project.id]
    );

    const txRows = await pool.query(
      `SELECT t.id,
              t.account_id AS finance_account_id,
              fa.name AS account_name,
              fa.type AS account_type,
              t.description,
              t.amount_cents,
              t.transaction_date::text AS date,
              COALESCE(NULLIF(t.metadata->>'due_date', ''), t.transaction_date::text) AS due_date,
              CASE WHEN t.status = 'completed' THEN t.updated_at::text ELSE NULL END AS paid_at,
              CASE
                WHEN t.status = 'completed' THEN 'paid'
                WHEN NULLIF(t.metadata->>'expense_ui_status', '') IN ('expected', 'cancelled', 'overdue')
                  THEN t.metadata->>'expense_ui_status'
                WHEN t.transaction_date < CURRENT_DATE AND t.status = 'pending' THEN 'overdue'
                ELSE 'pending'
              END AS status,
              NULLIF(t.metadata->>'supplier_name', '') AS supplier_name,
              NULL::text AS category,
              t.created_at
       FROM financial_transactions t
       LEFT JOIN financial_accounts fa ON fa.id = t.account_id AND fa.tenant_id = t.tenant_id
       WHERE t.tenant_id = $1
         AND t.project_id = $2
         AND t.type = 'expense'
         AND COALESCE(t.transaction_kind, 'regular') = 'regular'`,
      [tenantId, project.id]
    );

    const merged = [...feeRows.rows, ...txRows.rows].sort((a: any, b: any) => {
      const da = String(a.date ?? '');
      const db = String(b.date ?? '');
      if (da !== db) return db.localeCompare(da);
      const ca = new Date(a.created_at).getTime();
      const cb = new Date(b.created_at).getTime();
      return cb - ca;
    });

    res.json(
      merged.map((row: any) => ({
        ...row,
        amount_cents: Number(row.amount_cents ?? 0),
        amount: moneyFromCents(Number(row.amount_cents ?? 0)),
      }))
    );
  } catch (error) {
    console.error('[projectFinancial] getProjectFinancialExpenses', error);
    res.status(500).json({ error: 'Erro ao listar despesas do projeto' });
  }
}

export async function getProjectFinancialSummary(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    const project = await requireProjectScope(req, res);
    if (!project) return;

    const canViewInvoices = await hasPermission(req, 'billing.view_invoices');
    const canViewExpenses = await hasPermission(req, 'finance.view_expenses');

    if (!canViewInvoices && !canViewExpenses) {
      res.status(403).json({ error: 'Seu perfil não tem acesso ao financeiro deste projeto.' });
      return;
    }

    let invoicedTotalCents = 0;
    let paidTotalCents = 0;
    let openInvoiceTotalCents = 0;
    let invoiceCount = 0;
    if (canViewInvoices) {
      const invoiceResult = await pool.query<{
        invoice_count: string;
        invoiced_total_cents: string;
        paid_total_cents: string;
        open_invoice_total_cents: string;
      }>(
        `SELECT COUNT(*)::text AS invoice_count,
                COALESCE(SUM(ci.amount_cents), 0)::text AS invoiced_total_cents,
                COALESCE(SUM(ci.amount_cents) FILTER (WHERE ci.status = 'paid'), 0)::text AS paid_total_cents,
                COALESCE(SUM(ci.amount_cents) FILTER (WHERE ci.status NOT IN ('paid', 'cancelled')), 0)::text AS open_invoice_total_cents
         FROM customer_invoices ci
         WHERE ci.tenant_id = $1
           AND ci.project_id = $2
           AND ci.invoice_type IS DISTINCT FROM 'child'`,
        [tenantId, project.id]
      );
      const row = invoiceResult.rows[0];
      invoiceCount = Number(row?.invoice_count ?? 0);
      invoicedTotalCents = Number(row?.invoiced_total_cents ?? 0);
      paidTotalCents = Number(row?.paid_total_cents ?? 0);
      openInvoiceTotalCents = Number(row?.open_invoice_total_cents ?? 0);
    }

    let expenseTotalCents = 0;
    let expenseCount = 0;
    if (canViewExpenses) {
      const feeAgg = await pool.query<{ expense_count: string; expense_total_cents: string }>(
        `SELECT COUNT(*)::text AS expense_count,
                COALESCE(SUM(amount_cents), 0)::text AS expense_total_cents
         FROM finance_expense_entries
         WHERE tenant_id = $1
           AND project_id = $2
           AND status IS DISTINCT FROM 'cancelled'`,
        [tenantId, project.id]
      );
      const txAgg = await pool.query<{ expense_count: string; expense_total_cents: string }>(
        `SELECT COUNT(*)::text AS expense_count,
                COALESCE(SUM(amount_cents), 0)::text AS expense_total_cents
         FROM financial_transactions
         WHERE tenant_id = $1
           AND project_id = $2
           AND type = 'expense'
           AND COALESCE(transaction_kind, 'regular') = 'regular'`,
        [tenantId, project.id]
      );
      const feeRow = feeAgg.rows[0];
      const txRow = txAgg.rows[0];
      expenseCount = Number(feeRow?.expense_count ?? 0) + Number(txRow?.expense_count ?? 0);
      expenseTotalCents =
        Number(feeRow?.expense_total_cents ?? 0) + Number(txRow?.expense_total_cents ?? 0);
    }

    const profitEstimateCents = canViewInvoices && canViewExpenses ? paidTotalCents - expenseTotalCents : null;

    res.json({
      can_view_invoices: canViewInvoices,
      can_view_expenses: canViewExpenses,
      invoiced_total: moneyFromCents(invoicedTotalCents),
      paid_total: moneyFromCents(paidTotalCents),
      open_invoice_total: moneyFromCents(openInvoiceTotalCents),
      expense_total: moneyFromCents(expenseTotalCents),
      profit_estimate: profitEstimateCents == null ? null : moneyFromCents(profitEstimateCents),
      invoice_count: invoiceCount,
      expense_count: expenseCount,
      invoiced_total_cents: invoicedTotalCents,
      paid_total_cents: paidTotalCents,
      open_invoice_total_cents: openInvoiceTotalCents,
      expense_total_cents: expenseTotalCents,
      profit_estimate_cents: profitEstimateCents,
    });
  } catch (error) {
    console.error('[projectFinancial] getProjectFinancialSummary', error);
    res.status(500).json({ error: 'Erro ao carregar resumo financeiro do projeto' });
  }
}
