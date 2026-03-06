import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';

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

    // Propostas/Contratos (tenant)
    const currentMonthProposals = await pool.query(
      `SELECT COUNT(*) as count FROM contracts c
       INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1
       WHERE EXTRACT(MONTH FROM c.created_at) = $2 AND EXTRACT(YEAR FROM c.created_at) = $3`,
      [tenantId, currentMonth + 1, currentYear]
    );

    const lastMonthProposals = await pool.query(
      `SELECT COUNT(*) as count FROM contracts c
       INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1
       WHERE EXTRACT(MONTH FROM c.created_at) = $2 AND EXTRACT(YEAR FROM c.created_at) = $3`,
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
      'lead': 'bg-blue-100 text-blue-700',
      'client': 'bg-green-100 text-green-700',
      'contract': 'bg-purple-100 text-purple-700',
      'task': 'bg-amber-100 text-amber-700'
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
        color: typeColors[activity.type] || 'bg-gray-100 text-gray-700'
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
      'high': 'bg-red-100 text-red-700 border-red-300',
      'medium': 'bg-amber-100 text-amber-700 border-amber-300',
      'low': 'bg-green-100 text-green-700 border-green-300'
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

