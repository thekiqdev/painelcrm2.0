import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { getFinancialEnterpriseReport } from '../services/financialReportsService.js';
import {
  buildActivationChecklist,
  setActivationChecklistDismissed,
} from '../services/activationChecklistService.js';
import { ensureTenantOverdueStatusesFresh } from '../services/billingOverdueStatusService.js';
import { hasAttendanceColumns } from '../utils/chatAttendanceSchema.js';
import { getEffectiveModulePermissions, getUserRoleInTenant } from '../services/modulePermissionsService.js';
import { listAppointmentsScopeForUser } from '../services/appointmentsService.js';

// GET /api/dashboard/kpis
export async function getKPIs(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.json({
        sales: { value: 0, change: 0, changeType: 'positive' },
        leads: { value: 0, change: 0, changeType: 'positive' },
        proposals: { value: 0, change: 0, changeType: 'positive' },
        tasks: { value: 0, change: 0, changeType: 'positive' },
      });
      return;
    }
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    // Vendas Totais (orders do tenant)
    const currentMonthSales = await pool.query(
      `SELECT COALESCE(SUM(o.total_amount), 0) as total
       FROM orders o
       INNER JOIN users u ON u.id = o.store_user_id AND u.tenant_id = $1
       WHERE EXTRACT(MONTH FROM o.created_at) = $2 AND EXTRACT(YEAR FROM o.created_at) = $3`,
      [tenantId, currentMonth + 1, currentYear]
    );

    const lastMonthSales = await pool.query(
      `SELECT COALESCE(SUM(o.total_amount), 0) as total
       FROM orders o
       INNER JOIN users u ON u.id = o.store_user_id AND u.tenant_id = $1
       WHERE EXTRACT(MONTH FROM o.created_at) = $2 AND EXTRACT(YEAR FROM o.created_at) = $3`,
      [tenantId, lastMonth + 1, lastMonthYear]
    );

    const currentSales = parseFloat(currentMonthSales.rows[0]?.total || '0');
    const lastSales = parseFloat(lastMonthSales.rows[0]?.total || '0');
    const salesChange = lastSales > 0 ? ((currentSales - lastSales) / lastSales * 100) : 0;

    // Novos Leads (tenant)
    const currentMonthLeads = await pool.query(
      `SELECT COUNT(*) as count FROM leads l
       INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = $1
       WHERE EXTRACT(MONTH FROM l.created_at) = $2 AND EXTRACT(YEAR FROM l.created_at) = $3`,
      [tenantId, currentMonth + 1, currentYear]
    );

    const lastMonthLeads = await pool.query(
      `SELECT COUNT(*) as count FROM leads l
       INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = $1
       WHERE EXTRACT(MONTH FROM l.created_at) = $2 AND EXTRACT(YEAR FROM l.created_at) = $3`,
      [tenantId, lastMonth + 1, lastMonthYear]
    );

    const currentLeads = parseInt(currentMonthLeads.rows[0]?.count || '0');
    const lastLeads = parseInt(lastMonthLeads.rows[0]?.count || '0');
    const leadsChange = lastLeads > 0 ? ((currentLeads - lastLeads) / lastLeads * 100) : 0;

    // Propostas / orçamentos criados no mês (tenant)
    const currentMonthProposals = await pool.query(
      `SELECT COUNT(*) as count FROM proposals p
       INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $1
       WHERE EXTRACT(MONTH FROM p.created_at) = $2 AND EXTRACT(YEAR FROM p.created_at) = $3`,
      [tenantId, currentMonth + 1, currentYear]
    );

    const lastMonthProposals = await pool.query(
      `SELECT COUNT(*) as count FROM proposals p
       INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $1
       WHERE EXTRACT(MONTH FROM p.created_at) = $2 AND EXTRACT(YEAR FROM p.created_at) = $3`,
      [tenantId, lastMonth + 1, lastMonthYear]
    );

    const currentProposals = parseInt(currentMonthProposals.rows[0]?.count || '0');
    const lastProposals = parseInt(lastMonthProposals.rows[0]?.count || '0');
    const proposalsChange = lastProposals > 0 ? ((currentProposals - lastProposals) / lastProposals * 100) : 0;

    // Tarefas Pendentes (tenant)
    const pendingTasks = await pool.query(
      `SELECT COUNT(*) as count FROM tasks t
       INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = $1
       WHERE t.status = 'pending'`,
      [tenantId]
    );

    const lastMonthPendingTasks = await pool.query(
      `SELECT COUNT(*) as count FROM tasks t
       INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = $1
       WHERE t.status = 'pending'
       AND EXTRACT(MONTH FROM t.created_at) = $2 AND EXTRACT(YEAR FROM t.created_at) = $3`,
      [tenantId, lastMonth + 1, lastMonthYear]
    );

    const currentPendingTasks = parseInt(pendingTasks.rows[0]?.count || '0');
    const lastPendingTasks = parseInt(lastMonthPendingTasks.rows[0]?.count || '0');
    const tasksChange = lastPendingTasks > 0 ? ((currentPendingTasks - lastPendingTasks) / lastPendingTasks * 100) : 0;

    res.json({
      sales: {
        value: currentSales,
        change: salesChange,
        changeType: salesChange >= 0 ? 'positive' : 'negative'
      },
      leads: {
        value: currentLeads,
        change: leadsChange,
        changeType: leadsChange >= 0 ? 'positive' : 'negative'
      },
      proposals: {
        value: currentProposals,
        change: proposalsChange,
        changeType: proposalsChange >= 0 ? 'positive' : 'negative'
      },
      tasks: {
        value: currentPendingTasks,
        change: tasksChange,
        changeType: tasksChange >= 0 ? 'positive' : 'negative'
      }
    });
  } catch (error) {
    console.error('Error fetching KPIs:', error);
    res.status(500).json({ error: 'Erro ao buscar KPIs' });
  }
}

function resolveDashboardRange(q: Record<string, unknown>): { from: string; to: string; preset: string | null } {
  const preset = typeof q.preset === 'string' ? q.preset.trim() : '';
  const now = new Date();
  const y = now.getUTCFullYear();
  const m0 = now.getUTCMonth();
  const d0 = now.getUTCDate();

  if (preset === 'current_month') {
    const from = `${y}-${String(m0 + 1).padStart(2, '0')}-01`;
    const last = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
    const to = `${y}-${String(m0 + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    return { from, to, preset };
  }
  if (preset === 'last_month') {
    let yy = y;
    let mm = m0 - 1;
    if (mm < 0) {
      yy -= 1;
      mm = 11;
    }
    const from = `${yy}-${String(mm + 1).padStart(2, '0')}-01`;
    const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
    const to = `${yy}-${String(mm + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    return { from, to, preset };
  }
  if (preset === 'ytd' || preset === 'current_year') {
    const from = `${y}-01-01`;
    const to = `${y}-${String(m0 + 1).padStart(2, '0')}-${String(d0).padStart(2, '0')}`;
    return { from, to, preset };
  }

  const from = typeof q.from === 'string' && q.from.trim() ? q.from.trim() : `${y}-${String(m0 + 1).padStart(2, '0')}-01`;
  const to =
    typeof q.to === 'string' && q.to.trim()
      ? q.to.trim()
      : `${y}-${String(m0 + 1).padStart(2, '0')}-${String(new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate()).padStart(2, '0')}`;
  return { from, to, preset: preset || null };
}

function previousPeriod(from: string, to: string): { from: string; to: string } {
  const [y1, m1, d1] = from.split('-').map((x) => parseInt(x, 10));
  const [y2, m2, d2] = to.split('-').map((x) => parseInt(x, 10));
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  const days = Math.floor((b - a) / 86400000) + 1;
  const prevTo = new Date(a - 86400000);
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * 86400000);
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return { from: fmt(prevFrom), to: fmt(prevTo) };
}

function pct(current: number, previous: number): number {
  if (!Number.isFinite(previous) || previous <= 0) return 0;
  return ((current - previous) / previous) * 100;
}

// GET /api/dashboard/overview
export async function getExecutiveOverview(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    const userId = req.userId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    await ensureTenantOverdueStatusesFresh(tenantId).catch((err) =>
      console.error('[dashboard] ensureTenantOverdueStatusesFresh:', err)
    );

    const q = req.query as Record<string, unknown>;
    const { from, to, preset } = resolveDashboardRange(q);
    const prev = previousPeriod(from, to);

    const [report, reportPrev] = await Promise.all([
      getFinancialEnterpriseReport(tenantId, { from, to }),
      getFinancialEnterpriseReport(tenantId, { from: prev.from, to: prev.to }),
    ]);

    const [paidSalesCountR, leadsCreatedR, leadsConvertedR, leadsCreatedPrevR, leadsConvertedPrevR] = await Promise.all([
      pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM customer_invoices ci
         WHERE ci.tenant_id = $1
           AND ci.status = 'paid'
           AND ci.paid_at IS NOT NULL
           AND (ci.paid_at::date) >= $2::date AND (ci.paid_at::date) <= $3::date`,
        [tenantId, from, to]
      ),
      pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM leads l
         INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = $1
         WHERE (l.created_at::date) >= $2::date AND (l.created_at::date) <= $3::date`,
        [tenantId, from, to]
      ),
      pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM leads l
         INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = $1
         WHERE lower(COALESCE(l.status, '')) IN ('convertido', 'fechado', 'ganho', 'won')
           AND (l.created_at::date) >= $2::date AND (l.created_at::date) <= $3::date`,
        [tenantId, from, to]
      ),
      pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM leads l
         INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = $1
         WHERE (l.created_at::date) >= $2::date AND (l.created_at::date) <= $3::date`,
        [tenantId, prev.from, prev.to]
      ),
      pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM leads l
         INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = $1
         WHERE lower(COALESCE(l.status, '')) IN ('convertido', 'fechado', 'ganho', 'won')
           AND (l.created_at::date) >= $2::date AND (l.created_at::date) <= $3::date`,
        [tenantId, prev.from, prev.to]
      ),
    ]);

    const paidSalesCount = Number(paidSalesCountR.rows[0]?.c ?? 0);
    const leadsCreated = Number(leadsCreatedR.rows[0]?.c ?? 0);
    const leadsConverted = Number(leadsConvertedR.rows[0]?.c ?? 0);
    const leadsCreatedPrev = Number(leadsCreatedPrevR.rows[0]?.c ?? 0);
    const leadsConvertedPrev = Number(leadsConvertedPrevR.rows[0]?.c ?? 0);
    const conversionRate = leadsCreated > 0 ? (leadsConverted / leadsCreated) * 100 : 0;
    const conversionPrev = leadsCreatedPrev > 0 ? (leadsConvertedPrev / leadsCreatedPrev) * 100 : 0;

    const attendanceCols = await hasAttendanceColumns();

    const [
      funnelR,
      leadNoResponseR,
      ticketsR,
      tasksR,
      clientsR,
      overdueInvoicesR,
      stalledLeadsR,
      payableRowsR,
      payableTotalR,
      receivableNext7R,
      tasksListR,
      projectsOverviewR,
      chatCountsR,
      chatListR,
      ticketsBreakdownR,
      ticketsRecentR,
      agentMetricsR,
      agentQueuePreviewR,
    ] = await Promise.all([
      pool.query<{ stage_id: string | null; stage_name: string; c: string; amount: string }>(
        `SELECT 
           COALESCE(fs.id::text, c.funnel_stage) AS stage_id,
           COALESCE(NULLIF(trim(fs.name), ''), NULLIF(trim(c.funnel_stage), ''), 'Sem etapa') AS stage_name,
           COUNT(*)::text AS c,
           0::text AS amount
         FROM clients c
         INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1
         LEFT JOIN funnel_stages fs ON fs.id::text = c.funnel_stage OR lower(fs.name) = lower(c.funnel_stage)
         GROUP BY COALESCE(fs.id::text, c.funnel_stage), COALESCE(NULLIF(trim(fs.name), ''), NULLIF(trim(c.funnel_stage), ''), 'Sem etapa')
         ORDER BY COUNT(*) DESC`,
        [tenantId]
      ),
      pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM leads l
         INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = $1
         WHERE (l.created_at::date) >= $2::date AND (l.created_at::date) <= $3::date
           AND l.updated_at <= l.created_at + interval '1 hour'
           AND NOT EXISTS (SELECT 1 FROM lead_tasks lt WHERE lt.lead_id = l.id)`,
        [tenantId, from, to]
      ),
      pool.query<{ open_c: string; overdue_c: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE t.status IN ('new', 'open', 'pending', 'waiting_customer', 'in_progress'))::text AS open_c,
           COUNT(*) FILTER (WHERE t.status IN ('new', 'open', 'pending', 'waiting_customer', 'in_progress')
                            AND (t.created_at::date) < (CURRENT_DATE - INTERVAL '3 day'))::text AS overdue_c
         FROM tickets t
         INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = $1`,
        [tenantId]
      ),
      pool.query<{ overdue_c: string; today_c: string; critical_c: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE t.status = 'pending' AND t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE)::text AS overdue_c,
           COUNT(*) FILTER (WHERE t.status = 'pending' AND t.due_date = CURRENT_DATE)::text AS today_c,
           COUNT(*) FILTER (WHERE t.status = 'pending' AND t.priority IN ('high', 'medium'))::text AS critical_c
         FROM tasks t
         INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = $1`,
        [tenantId]
      ),
      pool.query<{ active_clients: string; new_clients: string; active_subs: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE lower(COALESCE(c.status, 'ativo')) IN ('ativo', 'active'))::text AS active_clients,
           COUNT(*) FILTER (WHERE (c.created_at::date) >= $2::date AND (c.created_at::date) <= $3::date)::text AS new_clients,
           (
             SELECT COUNT(*)::text
             FROM subscriptions s
             WHERE s.tenant_id = $1 AND COALESCE(s.status, 'active') IN ('active', 'trialing')
           ) AS active_subs
         FROM clients c
         INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1`,
        [tenantId, from, to]
      ),
      pool.query<{ c: string }>(
        `SELECT COUNT(DISTINCT ci.client_id)::text AS c
         FROM customer_invoices ci
         WHERE ci.tenant_id = $1
           AND ci.status IN ('pending', 'overdue')
           AND ci.due_date < CURRENT_DATE`,
        [tenantId]
      ),
      pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM leads l
         INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = $1
         WHERE (l.created_at::date) < (CURRENT_DATE - INTERVAL '15 day')
           AND lower(COALESCE(l.status, '')) NOT IN ('convertido', 'fechado', 'ganho', 'won')`,
        [tenantId]
      ),
      pool.query<{ id: string; description: string; due_date: string; amount_cents: string; source: 'transaction' | 'recurring'; status: 'planned' | 'pending' }>(
        `SELECT * FROM (
           SELECT
             ft.id::text AS id,
             ft.description AS description,
             ft.transaction_date::text AS due_date,
             ft.amount_cents::text AS amount_cents,
             'transaction'::text AS source,
             CASE WHEN ft.status = 'pending' THEN 'pending' ELSE 'planned' END::text AS status
           FROM financial_transactions ft
           WHERE ft.tenant_id = $1
             AND ft.type = 'expense'
             AND ft.status IN ('pending')
             AND COALESCE(ft.transaction_kind, 'regular') = 'regular'
             AND ft.transaction_date <= (CURRENT_DATE + INTERVAL '7 day')
           UNION ALL
           SELECT
             fro.id::text AS id,
             fre.description AS description,
             fro.due_date::text AS due_date,
             fro.amount_cents::text AS amount_cents,
             'recurring'::text AS source,
             fro.status::text AS status
           FROM financial_recurring_expense_occurrences fro
           INNER JOIN financial_recurring_expenses fre
             ON fre.id = fro.recurring_expense_id AND fre.tenant_id = fro.tenant_id
           WHERE fro.tenant_id = $1
             AND fro.status IN ('planned', 'pending')
             AND fro.due_date <= (CURRENT_DATE + INTERVAL '7 day')
         ) p
         ORDER BY p.due_date::date ASC, p.amount_cents::bigint DESC
         LIMIT 5`,
        [tenantId]
      ),
      pool.query<{ total: string }>(
        `SELECT COALESCE(SUM(amount_cents), 0)::text AS total
         FROM (
           SELECT ft.amount_cents
           FROM financial_transactions ft
           WHERE ft.tenant_id = $1
             AND ft.type = 'expense'
             AND ft.status IN ('pending')
             AND COALESCE(ft.transaction_kind, 'regular') = 'regular'
             AND ft.transaction_date <= (CURRENT_DATE + INTERVAL '7 day')
           UNION ALL
           SELECT fro.amount_cents
           FROM financial_recurring_expense_occurrences fro
           INNER JOIN financial_recurring_expenses fre
             ON fre.id = fro.recurring_expense_id AND fre.tenant_id = fro.tenant_id
           WHERE fro.tenant_id = $1
             AND fro.status IN ('planned', 'pending')
             AND fro.due_date <= (CURRENT_DATE + INTERVAL '7 day')
         ) s`,
        [tenantId]
      ),
      pool.query<{ total: string }>(
        `SELECT COALESCE(SUM(ci.amount_cents), 0)::text AS total
         FROM customer_invoices ci
         WHERE ci.tenant_id = $1
           AND ci.status IN ('pending', 'overdue')
           AND ci.due_date >= CURRENT_DATE
           AND ci.due_date <= (CURRENT_DATE + INTERVAL '7 day')`,
        [tenantId]
      ),
      pool.query<{ id: string; title: string; due_date: string | null; priority: string | null; status: string | null; client_name: string | null; created_at: string }>(
        `SELECT
           t.id::text,
           t.title,
           t.due_date::text,
           t.priority,
           t.status,
           t.client_name,
           t.created_at::text
         FROM tasks t
         INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = $1
         WHERE t.status = 'pending'
           AND ($2::uuid IS NULL OR t.assignee_id = $2::uuid OR t.user_id = $2::uuid)
         ORDER BY
           CASE
             WHEN t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE THEN 0
             WHEN t.due_date = CURRENT_DATE THEN 1
             WHEN t.due_date IS NOT NULL AND t.due_date > CURRENT_DATE THEN 2
             ELSE 3
           END,
           t.due_date ASC NULLS LAST,
           t.created_at DESC
         LIMIT 20`,
        [tenantId, userId]
      ),
      pool.query<{ id: string; name: string; status: string | null; due_date: string | null; pending_tasks: string }>(
        `SELECT
           p.id::text,
           p.name,
           p.status,
           p.due_date::text,
           COALESCE((
             SELECT COUNT(*)::int
             FROM project_tasks pt
             WHERE pt.project_id = p.id
               AND lower(COALESCE(pt.status, 'todo')) NOT IN ('done', 'completed', 'concluido', 'concluído')
           ), 0)::text AS pending_tasks
         FROM projects p
         INNER JOIN users owner ON owner.id = p.user_id
         WHERE owner.tenant_id = $1
           AND lower(COALESCE(p.status, 'active')) NOT IN ('done', 'completed', 'cancelled', 'cancelado')
           AND (
             $2::uuid IS NULL
             OR p.user_id = $2::uuid
             OR COALESCE(p.responsible_ids, '[]'::jsonb) @> to_jsonb(ARRAY[$2::text]::text[])
           )
         ORDER BY p.updated_at DESC
         LIMIT 5`,
        [tenantId, userId]
      ),
      pool.query<{ active_conversations: number; awaiting_response: number; unread: number }>(
        `SELECT
           COUNT(*) FILTER (WHERE c.attendance_status IS DISTINCT FROM 'closed')::int AS active_conversations,
           COUNT(*) FILTER (
             WHERE c.attendance_status IS NULL OR c.attendance_status IN ('pending', 'open')
           )::int AS awaiting_response,
           COUNT(*) FILTER (WHERE COALESCE(c.unread_count, 0) > 0)::int AS unread
         FROM chat_conversations c
         INNER JOIN users u ON u.id = c.user_id
         WHERE u.tenant_id = $1`,
        [tenantId]
      ),
      pool.query<{ id: string; contact_name: string | null; phone_number: string | null; unread_count: number; last_message_at: string | null }>(
        `SELECT
           c.id::text,
           c.contact_name,
           c.phone_number,
           COALESCE(c.unread_count, 0)::int AS unread_count,
           c.last_message_at::text
         FROM chat_conversations c
         INNER JOIN users u ON u.id = c.user_id
         WHERE u.tenant_id = $1
         ORDER BY COALESCE(c.unread_count, 0) DESC, c.last_message_at DESC NULLS LAST
         LIMIT 3`,
        [tenantId]
      ),
      pool.query<{ open_excl: string; in_progress: string; resolved: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE t.status IN ('new', 'open', 'pending', 'waiting_customer'))::text AS open_excl,
           COUNT(*) FILTER (WHERE t.status = 'in_progress')::text AS in_progress,
           COUNT(*) FILTER (WHERE t.status IN ('resolved', 'closed'))::text AS resolved
         FROM tickets t
         INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = $1`,
        [tenantId]
      ),
      pool.query<{ id: string; ticket_number: string; subject: string; status: string; updated_at: string }>(
        `SELECT t.id::text, t.ticket_number, t.subject, t.status, t.updated_at::text
         FROM tickets t
         INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = $1
         ORDER BY t.updated_at DESC NULLS LAST
         LIMIT 5`,
        [tenantId]
      ),
      attendanceCols && userId
        ? pool.query<{
            my_in_service: string;
            my_queued: string;
            my_closed_7d: string;
            queue_unassigned: string;
          }>(
            `SELECT
               COUNT(*) FILTER (
                 WHERE c.assigned_to_user_id = $2::uuid AND c.attendance_status = 'in_progress'
               )::text AS my_in_service,
               COUNT(*) FILTER (
                 WHERE c.assigned_to_user_id = $2::uuid AND c.attendance_status IN ('pending', 'waiting_customer')
               )::text AS my_queued,
               COUNT(*) FILTER (
                 WHERE c.assigned_to_user_id = $2::uuid
                   AND c.attendance_status = 'closed'
                   AND c.updated_at >= (CURRENT_TIMESTAMP - INTERVAL '7 days')
               )::text AS my_closed_7d,
               COUNT(*) FILTER (
                 WHERE c.attendance_status IN ('pending', 'open')
                   AND c.assigned_to_user_id IS NULL
               )::text AS queue_unassigned
             FROM chat_conversations c
             INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1`,
            [tenantId, userId]
          )
        : Promise.resolve({ rows: [] as Array<{ my_in_service: string; my_queued: string; my_closed_7d: string; queue_unassigned: string }> }),
      attendanceCols && userId
        ? pool.query<{
            id: string;
            contact_name: string | null;
            phone_number: string | null;
            attendance_status: string | null;
            last_message_at: string | null;
            unread_count: number;
          }>(
            `SELECT
               c.id::text,
               c.contact_name,
               c.phone_number,
               c.attendance_status,
               c.last_message_at::text,
               COALESCE(c.unread_count, 0)::int AS unread_count
             FROM chat_conversations c
             INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1
             WHERE c.assigned_to_user_id = $2::uuid
               AND COALESCE(c.attendance_status, '') <> 'closed'
             ORDER BY c.last_message_at DESC NULLS LAST
             LIMIT 7`,
            [tenantId, userId]
          )
        : Promise.resolve({
            rows: [] as Array<{
              id: string;
              contact_name: string | null;
              phone_number: string | null;
              attendance_status: string | null;
              last_message_at: string | null;
              unread_count: number;
            }>,
          }),
    ]);

    const futureRevenue = report.general.projected_subscription_income;
    const receivedRevenue = report.general.received_income;
    const averageTicket = paidSalesCount > 0 ? receivedRevenue / paidSalesCount : 0;
    const expensePaid = report.general.expense_paid ?? report.general.total_expense;
    const expenseProjected =
      report.general.expense_projected ??
      Math.max(0, (report.general.projected_total_expense ?? report.general.total_expense) - report.general.total_expense);
    const resultProjected =
      report.general.projected_result ??
      receivedRevenue + futureRevenue - (report.general.expense_total_potential ?? report.general.projected_total_expense);
    const cashAvailable = report.by_account.reduce((acc, r) => acc + (r.estimated_balance ?? 0), 0);

    const alerts: Array<{ type: string; severity: 'warning' | 'critical'; title: string; description: string; href: string }> = [];
    const overdueInvoicesCount = Number(overdueInvoicesR.rows[0]?.c ?? 0);
    if (overdueInvoicesCount > 0) {
      alerts.push({
        type: 'overdue_invoices',
        severity: 'warning',
        title: 'Faturas vencidas',
        description: `Existem ${overdueInvoicesCount} clientes com faturas vencidas.`,
        href: '/customer-invoices?status=overdue',
      });
    }
    if (resultProjected < 0) {
      alerts.push({
        type: 'projected_negative_result',
        severity: 'critical',
        title: 'Resultado previsto negativo',
        description: 'As despesas previstas estão acima da receita esperada no período.',
        href: '/finance',
      });
    }
    const stalledLeadsCount = Number(stalledLeadsR.rows[0]?.c ?? 0);
    if (stalledLeadsCount > 0) {
      alerts.push({
        type: 'stalled_leads',
        severity: 'warning',
        title: 'Leads parados no funil',
        description: `${stalledLeadsCount} leads sem avanço recente no funil.`,
        href: '/funnel',
      });
    }
    const ticketsOverdue = Number(ticketsR.rows[0]?.overdue_c ?? 0);
    if (ticketsOverdue > 0) {
      alerts.push({
        type: 'overdue_tickets',
        severity: 'warning',
        title: 'Tickets atrasados',
        description: `${ticketsOverdue} tickets com prazo vencido aguardam ação.`,
        href: '/support/tickets',
      });
    }
    const tasksOverdue = Number(tasksR.rows[0]?.overdue_c ?? 0);
    if (tasksOverdue > 0) {
      alerts.push({
        type: 'overdue_tasks',
        severity: 'warning',
        title: 'Tarefas vencidas',
        description: `${tasksOverdue} tarefas estão vencidas.`,
        href: '/tasks',
      });
    }

    const tasksList = tasksListR.rows;
    const taskClassifier = (row: (typeof tasksList)[number]) => {
      if (!row.due_date) return 'recent_assigned' as const;
      const due = new Date(`${row.due_date}T00:00:00Z`).getTime();
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const todayTs = today.getTime();
      if (due < todayTs) return 'overdue' as const;
      if (due === todayTs) return 'due_today' as const;
      return 'upcoming' as const;
    };
    type TaskOverviewItem = {
      id: string;
      title: string;
      due_date: string | null;
      priority: string | null;
      status: string | null;
      project_name: string | null;
      client_name: string | null;
    };
    const tasksBuckets: {
      overdue: TaskOverviewItem[];
      due_today: TaskOverviewItem[];
      upcoming: TaskOverviewItem[];
      recent_assigned: TaskOverviewItem[];
    } = {
      overdue: [],
      due_today: [],
      upcoming: [],
      recent_assigned: [],
    };
    for (const row of tasksList) {
      const bucket = taskClassifier(row);
      if (tasksBuckets.overdue.length + tasksBuckets.due_today.length + tasksBuckets.upcoming.length + tasksBuckets.recent_assigned.length >= 5) {
        break;
      }
      if (tasksBuckets[bucket].length >= 5) continue;
      tasksBuckets[bucket].push({
        id: row.id,
        title: row.title,
        due_date: row.due_date,
        priority: row.priority,
        status: row.status,
        project_name: null,
        client_name: row.client_name,
      });
    }

    const accountsPayableItems = payableRowsR.rows.map((row) => ({
      id: row.id,
      description: row.description,
      due_date: row.due_date,
      amount_cents: Number(row.amount_cents ?? 0),
      source: row.source,
      status: row.status,
    }));
    const accountsPayableTotalCents = Number(payableTotalR.rows[0]?.total ?? 0);
    const next7ReceivableCents = Number(receivableNext7R.rows[0]?.total ?? 0);

    const projectsOverview = projectsOverviewR.rows.map((row) => {
      const pendingTasks = Number(row.pending_tasks ?? 0);
      const progressPct = Math.max(0, Math.min(100, pendingTasks === 0 ? 100 : 100 - pendingTasks * 10));
      return {
        id: row.id,
        name: row.name,
        status: row.status,
        due_date: row.due_date,
        pending_tasks: pendingTasks,
        progress_pct: progressPct,
      };
    });

    const chatCounts = chatCountsR.rows[0] ?? {
      active_conversations: 0,
      awaiting_response: 0,
      unread: 0,
    };

    const tb = ticketsBreakdownR.rows[0];
    const tickets_overview = {
      open: Number(tb?.open_excl ?? 0),
      in_progress: Number(tb?.in_progress ?? 0),
      resolved: Number(tb?.resolved ?? 0),
      recent: ticketsRecentR.rows.map((r) => ({
        id: r.id,
        ticket_number: r.ticket_number,
        subject: r.subject,
        status: r.status,
        updated_at: r.updated_at,
      })),
    };

    const am = agentMetricsR.rows[0];
    const agent_attendance =
      attendanceCols && userId
        ? {
            my_in_service: Number(am?.my_in_service ?? 0),
            my_queued: Number(am?.my_queued ?? 0),
            my_closed_7d: Number(am?.my_closed_7d ?? 0),
            queue_unassigned: Number(am?.queue_unassigned ?? 0),
            preview: agentQueuePreviewR.rows.map((r) => ({
              id: r.id,
              contact_name: r.contact_name,
              phone_number: r.phone_number,
              attendance_status: r.attendance_status,
              last_message_at: r.last_message_at,
              unread_count: r.unread_count,
            })),
          }
        : null;

    let upcoming_appointments: Array<{
      id: string;
      title: string;
      starts_at: string;
      client_name: string | null;
    }> = [];
    let appointments_needing_reschedule: Array<{
      id: string;
      title: string;
      starts_at: string;
      client_name: string | null;
      task_created: boolean;
      task_href: string | null;
    }> = [];
    if (userId) {
      const perms = await getEffectiveModulePermissions(userId);
      if (perms['agenda']?.can_view !== false) {
        const role = await getUserRoleInTenant(userId);
        const { ownOnly } = listAppointmentsScopeForUser(userId, role, perms['agenda']);
        const uar = ownOnly
          ? await pool.query<{
              id: string;
              title: string;
              starts_at: string;
              client_name: string | null;
            }>(
              `SELECT a.id::text, a.title, a.starts_at::text, c.name AS client_name
               FROM public.appointments a
               LEFT JOIN public.clients c ON c.id = a.client_id
               WHERE a.tenant_id = $1
                 AND a.status = 'scheduled'
                 AND a.starts_at > now()
                 AND (a.responsible_user_id = $2::uuid OR a.created_by = $2::uuid)
               ORDER BY a.starts_at ASC
               LIMIT 3`,
              [tenantId, userId],
            )
          : await pool.query<{
              id: string;
              title: string;
              starts_at: string;
              client_name: string | null;
            }>(
              `SELECT a.id::text, a.title, a.starts_at::text, c.name AS client_name
               FROM public.appointments a
               LEFT JOIN public.clients c ON c.id = a.client_id
               WHERE a.tenant_id = $1
                 AND a.status = 'scheduled'
                 AND a.starts_at > now()
               ORDER BY a.starts_at ASC
               LIMIT 3`,
              [tenantId],
            );
        upcoming_appointments = uar.rows;
        const nrr = ownOnly
          ? await pool.query<{
              id: string;
              title: string;
              starts_at: string;
              client_name: string | null;
              task_created: boolean;
              task_href: string | null;
            }>(
              `SELECT
                 a.id::text,
                 a.title,
                 a.starts_at::text,
                 c.name AS client_name,
                 (al.id IS NOT NULL) AS task_created,
                 (al.metadata_json->>'task_href') AS task_href
               FROM public.appointments a
               LEFT JOIN public.clients c ON c.id = a.client_id
               LEFT JOIN public.appointment_automation_logs al
                 ON al.appointment_id = a.id
                AND al.automation_key = 'needs_reschedule_task_created'
                AND al.result = 'created'
               WHERE a.tenant_id = $1
                 AND a.status = 'scheduled'
                 AND a.public_confirmation_response = 'needs_reschedule'
                 AND (a.responsible_user_id = $2::uuid OR a.created_by = $2::uuid)
               ORDER BY a.starts_at ASC
               LIMIT 3`,
              [tenantId, userId],
            )
          : await pool.query<{
              id: string;
              title: string;
              starts_at: string;
              client_name: string | null;
              task_created: boolean;
              task_href: string | null;
            }>(
              `SELECT
                 a.id::text,
                 a.title,
                 a.starts_at::text,
                 c.name AS client_name,
                 (al.id IS NOT NULL) AS task_created,
                 (al.metadata_json->>'task_href') AS task_href
               FROM public.appointments a
               LEFT JOIN public.clients c ON c.id = a.client_id
               LEFT JOIN public.appointment_automation_logs al
                 ON al.appointment_id = a.id
                AND al.automation_key = 'needs_reschedule_task_created'
                AND al.result = 'created'
               WHERE a.tenant_id = $1
                 AND a.status = 'scheduled'
                 AND a.public_confirmation_response = 'needs_reschedule'
               ORDER BY a.starts_at ASC
               LIMIT 3`,
              [tenantId],
            );
        appointments_needing_reschedule = nrr.rows;
      }
    }

    res.json({
      period: { from, to, preset },
      sales: {
        received_revenue: receivedRevenue,
        future_revenue: futureRevenue,
        conversion_rate: conversionRate,
        conversion_rate_prev: conversionPrev,
        conversion_rate_change_pct: pct(conversionRate, conversionPrev),
        average_ticket: paidSalesCount > 0 ? averageTicket : null,
        paid_sales_count: paidSalesCount,
        received_revenue_prev: reportPrev.general.received_income,
        received_revenue_change_pct: pct(receivedRevenue, reportPrev.general.received_income),
      },
      funnel: funnelR.rows.map((r) => ({
        stage_id: r.stage_id ?? '',
        stage_name: r.stage_name,
        count: Number(r.c ?? 0),
        amount: Number(r.amount ?? 0),
      })),
      operations: {
        leads_without_response: Number(leadNoResponseR.rows[0]?.c ?? 0),
        open_tickets: Number(ticketsR.rows[0]?.open_c ?? 0),
        overdue_tickets: ticketsOverdue,
        overdue_tasks: tasksOverdue,
        today_tasks: Number(tasksR.rows[0]?.today_c ?? 0),
        critical_tasks: Number(tasksR.rows[0]?.critical_c ?? 0),
      },
      clients: {
        active_clients: Number(clientsR.rows[0]?.active_clients ?? 0),
        new_clients: Number(clientsR.rows[0]?.new_clients ?? 0),
        active_subscriptions: Number(clientsR.rows[0]?.active_subs ?? 0),
        clients_with_overdue_invoices: overdueInvoicesCount,
      },
      finance: {
        income_received: receivedRevenue,
        income_projected: futureRevenue,
        expense_paid: expensePaid,
        expense_projected: expenseProjected,
        result_projected: resultProjected,
        cash_available: cashAvailable,
      },
      monthly: report.monthly.map((m) => ({
        month: m.month,
        revenue_received: m.income_received ?? m.income ?? 0,
        revenue_projected: m.income_projected ?? m.income_projected_subscriptions ?? 0,
        expenses_paid: m.expense_paid ?? m.expense ?? 0,
        expenses_projected: m.expense_projected ?? Math.max(0, (m.expense_total_potential ?? m.projected_expense ?? m.expense) - (m.expense_paid ?? m.expense ?? 0)),
      })),
      alerts,
      accounts_payable_next_7_days: accountsPayableItems,
      accounts_payable_total_cents: accountsPayableTotalCents,
      next_7_days: {
        receivable_cents: next7ReceivableCents,
        payable_cents: accountsPayableTotalCents,
        balance_cents: next7ReceivableCents - accountsPayableTotalCents,
      },
      tasks_overview: tasksBuckets,
      projects_overview: projectsOverview,
      chat_overview: {
        active_conversations: Number(chatCounts.active_conversations ?? 0),
        awaiting_response: Number(chatCounts.awaiting_response ?? 0),
        unread: Number(chatCounts.unread ?? 0),
        list: chatListR.rows.map((row) => ({
          id: row.id,
          contact_name: row.contact_name,
          phone_number: row.phone_number,
          unread_count: Number(row.unread_count ?? 0),
          last_message_at: row.last_message_at,
        })),
      },
      tickets_overview,
      agent_attendance,
      upcoming_appointments,
      appointments_needing_reschedule,
    });
  } catch (error) {
    console.error('Error fetching executive dashboard overview:', error);
    res.status(500).json({ error: 'Erro ao carregar visão executiva do dashboard' });
  }
}

// GET /api/dashboard/charts/sales
export async function getSalesChart(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.json([]);
      return;
    }
    const months = [];
    const now = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        month: date.getMonth() + 1,
        year: date.getFullYear(),
        name: date.toLocaleDateString('pt-BR', { month: 'short' })
      });
    }

    const salesData = await Promise.all(
      months.map(async (m) => {
        const result = await pool.query(
          `SELECT COALESCE(SUM(o.total_amount), 0) as total
           FROM orders o
           INNER JOIN users u ON u.id = o.store_user_id AND u.tenant_id = $1
           WHERE EXTRACT(MONTH FROM o.created_at) = $2 AND EXTRACT(YEAR FROM o.created_at) = $3`,
          [tenantId, m.month, m.year]
        );
        return {
          name: m.name,
          value: parseFloat(result.rows[0]?.total || '0')
        };
      })
    );

    res.json(salesData);
  } catch (error) {
    console.error('Error fetching sales chart:', error);
    res.status(500).json({ error: 'Erro ao buscar dados de vendas' });
  }
}

// GET /api/dashboard/charts/leads
export async function getLeadsChart(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.json([]);
      return;
    }
    const months = [];
    const now = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        month: date.getMonth() + 1,
        year: date.getFullYear(),
        name: date.toLocaleDateString('pt-BR', { month: 'short' })
      });
    }

    const leadsData = await Promise.all(
      months.map(async (m) => {
        const result = await pool.query(
          `SELECT COUNT(*) as count FROM leads l
           INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = $1
           WHERE EXTRACT(MONTH FROM l.created_at) = $2 AND EXTRACT(YEAR FROM l.created_at) = $3`,
          [tenantId, m.month, m.year]
        );
        return {
          name: m.name,
          value: parseInt(result.rows[0]?.count || '0')
        };
      })
    );

    res.json(leadsData);
  } catch (error) {
    console.error('Error fetching leads chart:', error);
    res.status(500).json({ error: 'Erro ao buscar dados de leads' });
  }
}

// GET /api/dashboard/funnel
export async function getFunnelData(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.json([]);
      return;
    }

    const funnelData = await pool.query(
      `SELECT 
        COALESCE(c.funnel_stage, 'Sem estágio') as stage,
        COUNT(*) as count
       FROM clients c
       INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1
       GROUP BY c.funnel_stage
       ORDER BY count DESC`,
      [tenantId]
    );

    // Cores padrão para os estágios
    const stageColors: { [key: string]: string } = {
      'Prospecção': '#3b82f6',
      'Qualificação': '#10b981',
      'Proposta': '#f59e0b',
      'Negociação': '#ef4444',
      'Fechado': '#8b5cf6',
      'Sem estágio': '#6b7280'
    };

    const formattedData = funnelData.rows.map((row: any) => ({
      name: row.stage,
      value: parseInt(row.count || '0'),
      color: stageColors[row.stage] || '#6b7280'
    }));

    res.json(formattedData);
  } catch (error) {
    console.error('Error fetching funnel data:', error);
    res.status(500).json({ error: 'Erro ao buscar dados do funil' });
  }
}

// GET /api/dashboard/activities
export async function getRecentActivities(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.json([]);
      return;
    }

    const activities = [];

    const recentLeads = await pool.query(
      `SELECT 'lead' as type, 'adicionou um novo lead' as action, l.name as entity_name, l.created_at
       FROM leads l INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = $1
       ORDER BY l.created_at DESC LIMIT 3`,
      [tenantId]
    );

    const recentClients = await pool.query(
      `SELECT 'client' as type, 'adicionou um novo cliente' as action, c.name as entity_name, c.created_at
       FROM clients c INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1
       ORDER BY c.created_at DESC LIMIT 3`,
      [tenantId]
    );

    const recentContracts = await pool.query(
      `SELECT 'contract' as type, 'criou um contrato' as action, c.title as entity_name, c.created_at
       FROM contracts c INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1
       ORDER BY c.created_at DESC LIMIT 3`,
      [tenantId]
    );

    const recentTasks = await pool.query(
      `SELECT 'task' as type, 'adicionou uma tarefa' as action, t.title as entity_name, t.created_at
       FROM tasks t INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = $1
       ORDER BY t.created_at DESC LIMIT 3`,
      [tenantId]
    );

    // Combinar todas as atividades
    activities.push(...recentLeads.rows);
    activities.push(...recentClients.rows);
    activities.push(...recentContracts.rows);
    activities.push(...recentTasks.rows);

    // Ordenar por data e pegar as 5 mais recentes
    activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const topActivities = activities.slice(0, 5);

    // Formatar com cores e informações do usuário
    const typeColors: { [key: string]: string } = {
      lead: 'bg-blue-100 text-blue-800 ring-1 ring-blue-500/15 dark:bg-blue-950/45 dark:text-blue-200 dark:ring-blue-400/25',
      client: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-500/15 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-400/25',
      contract: 'bg-violet-100 text-violet-800 ring-1 ring-violet-500/15 dark:bg-violet-950/40 dark:text-violet-200 dark:ring-violet-400/25',
      task: 'bg-amber-100 text-amber-800 ring-1 ring-amber-500/15 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-400/25',
    };

    // Buscar informações do usuário para exibir
    const userInfo = await pool.query(
      `SELECT p.first_name, p.last_name, u.email 
       FROM users u
       LEFT JOIN profiles p ON p.id = u.id
       WHERE u.id = $1`,
      [userId]
    );

    const userName = userInfo.rows[0] 
      ? (userInfo.rows[0].first_name && userInfo.rows[0].last_name
          ? `${userInfo.rows[0].first_name} ${userInfo.rows[0].last_name}`.trim()
          : userInfo.rows[0].email?.split('@')[0] || 'Usuário')
      : 'Usuário';

    const formattedActivities = topActivities.map((activity: any) => {
      const timeAgo = getTimeAgo(new Date(activity.created_at));
      return {
        user: userName,
        action: activity.action,
        entity: activity.entity_name,
        time: timeAgo,
        color:
          typeColors[activity.type] ||
          'bg-muted text-muted-foreground ring-1 ring-border dark:bg-muted/60 dark:text-foreground/90',
      };
    });

    res.json(formattedActivities);
  } catch (error) {
    console.error('Error fetching activities:', error);
    res.status(500).json({ error: 'Erro ao buscar atividades recentes' });
  }
}

// GET /api/dashboard/tasks
export async function getUpcomingTasks(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.json([]);
      return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tasks = await pool.query(
      `SELECT t.id, t.title, t.due_date, t.due_time, t.priority, t.status
       FROM tasks t
       INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = $1
       WHERE t.status = 'pending' AND (t.due_date >= $2 OR t.due_date IS NULL)
       ORDER BY 
         CASE WHEN t.due_date = $2::date THEN 0 WHEN t.due_date IS NULL THEN 2 ELSE 1 END,
         t.due_time ASC NULLS LAST, t.created_at ASC
       LIMIT 10`,
      [tenantId, today.toISOString().split('T')[0]]
    );

    const priorityColors: { [key: string]: string } = {
      high:
        'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/45 dark:text-red-200 dark:border-red-800/60',
      medium:
        'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/45 dark:text-amber-200 dark:border-amber-800/60',
      low: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800/60',
    };

    const priorityLabels: { [key: string]: string } = {
      'high': 'Alta',
      'medium': 'Média',
      'low': 'Baixa'
    };

    const formattedTasks = tasks.rows.map((task: any) => {
      const dueDate = task.due_date ? new Date(task.due_date) : null;
      const timeStr = task.due_time || '';
      const isToday = dueDate && dueDate.toISOString().split('T')[0] === today.toISOString().split('T')[0];
      
      return {
        id: task.id,
        title: task.title,
        time: isToday && timeStr ? timeStr : (isToday ? 'Hoje' : (dueDate ? dueDate.toLocaleDateString('pt-BR') : 'Sem data')),
        priority: priorityLabels[task.priority] || 'Média',
        color: priorityColors[task.priority] || priorityColors['medium']
      };
    });

    res.json(formattedTasks);
  } catch (error) {
    console.error('Error fetching upcoming tasks:', error);
    res.status(500).json({ error: 'Erro ao buscar tarefas próximas' });
  }
}

// Helper function para calcular tempo relativo
function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'agora';
  if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? 'minuto' : 'minutos'} atrás`;
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hora' : 'horas'} atrás`;
  if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? 'dia' : 'dias'} atrás`;
  return date.toLocaleDateString('pt-BR');
}

// Manter endpoint antigo para compatibilidade (escopo tenant)
export async function getDashboardStats(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.json({
        counts: { leads: 0, clients: 0, funnels: 0, products: 0 },
        recentLeads: [],
        leadsByStatus: [],
      });
      return;
    }

    const [leadsCount, clientsCount, funnelsCount, productsCount] = await Promise.all([
      pool.query(`SELECT COUNT(*) as count FROM leads l INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = $1`, [tenantId]),
      pool.query(`SELECT COUNT(*) as count FROM clients c INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1`, [tenantId]),
      pool.query(`SELECT COUNT(*) as count FROM sales_funnels sf INNER JOIN users u ON u.id = sf.user_id AND u.tenant_id = $1`, [tenantId]),
      pool.query(`SELECT COUNT(*) as count FROM products p INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $1`, [tenantId]),
    ]);

    const recentLeads = await pool.query(
      `SELECT l.* FROM leads l INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = $1 ORDER BY l.created_at DESC LIMIT 5`,
      [tenantId]
    );

    const leadsByStatus = await pool.query(
      `SELECT l.status, COUNT(*) as count FROM leads l
       INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = $1
       WHERE l.status IS NOT NULL GROUP BY l.status`,
      [tenantId]
    );

    res.json({
      counts: {
        leads: parseInt(leadsCount.rows[0]?.count || '0'),
        clients: parseInt(clientsCount.rows[0]?.count || '0'),
        funnels: parseInt(funnelsCount.rows[0]?.count || '0'),
        products: parseInt(productsCount.rows[0]?.count || '0'),
      },
      recentLeads: recentLeads.rows,
      leadsByStatus: leadsByStatus.rows,
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET /api/dashboard/activation-checklist */
export async function getActivationChecklist(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    const userId = req.userId;
    if (!tenantId || !userId) {
      res.status(403).json({ error: 'TENANT_REQUIRED_FOR_OPERATION' });
      return;
    }
    const payload = await buildActivationChecklist(tenantId, userId);
    res.json(payload);
  } catch (error) {
    console.error('getActivationChecklist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/** POST /api/dashboard/activation-checklist/dismiss */
export async function postDismissActivationChecklist(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    await setActivationChecklistDismissed(userId);
    res.json({ ok: true });
  } catch (error) {
    console.error('postDismissActivationChecklist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

