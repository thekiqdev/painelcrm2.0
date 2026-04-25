import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { getFinancialEnterpriseReport } from '../services/financialReportsService.js';
import {
  buildActivationChecklist,
  setActivationChecklistDismissed,
} from '../services/activationChecklistService.js';

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
    if (!tenantId) {
      res.status(401).json({ error: 'Tenant não identificado' });
      return;
    }

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

    const [funnelR, leadNoResponseR, ticketsR, tasksR, clientsR, overdueInvoicesR, stalledLeadsR] = await Promise.all([
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

