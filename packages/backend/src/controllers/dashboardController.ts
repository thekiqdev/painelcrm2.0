import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';

// GET /api/dashboard/kpis
export async function getKPIs(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    // Vendas Totais (soma dos orders do mês atual)
    const currentMonthSales = await pool.query(
      `SELECT COALESCE(SUM(total_amount), 0) as total
       FROM orders
       WHERE store_user_id = $1
       AND EXTRACT(MONTH FROM created_at) = $2
       AND EXTRACT(YEAR FROM created_at) = $3`,
      [userId, currentMonth + 1, currentYear]
    );

    const lastMonthSales = await pool.query(
      `SELECT COALESCE(SUM(total_amount), 0) as total
       FROM orders
       WHERE store_user_id = $1
       AND EXTRACT(MONTH FROM created_at) = $2
       AND EXTRACT(YEAR FROM created_at) = $3`,
      [userId, lastMonth + 1, lastMonthYear]
    );

    const currentSales = parseFloat(currentMonthSales.rows[0]?.total || '0');
    const lastSales = parseFloat(lastMonthSales.rows[0]?.total || '0');
    const salesChange = lastSales > 0 ? ((currentSales - lastSales) / lastSales * 100) : 0;

    // Novos Leads (leads criados no mês atual)
    const currentMonthLeads = await pool.query(
      `SELECT COUNT(*) as count
       FROM leads
       WHERE user_id = $1
       AND EXTRACT(MONTH FROM created_at) = $2
       AND EXTRACT(YEAR FROM created_at) = $3`,
      [userId, currentMonth + 1, currentYear]
    );

    const lastMonthLeads = await pool.query(
      `SELECT COUNT(*) as count
       FROM leads
       WHERE user_id = $1
       AND EXTRACT(MONTH FROM created_at) = $2
       AND EXTRACT(YEAR FROM created_at) = $3`,
      [userId, lastMonth + 1, lastMonthYear]
    );

    const currentLeads = parseInt(currentMonthLeads.rows[0]?.count || '0');
    const lastLeads = parseInt(lastMonthLeads.rows[0]?.count || '0');
    const leadsChange = lastLeads > 0 ? ((currentLeads - lastLeads) / lastLeads * 100) : 0;

    // Propostas Enviadas (usando contracts como proxy por enquanto)
    const currentMonthProposals = await pool.query(
      `SELECT COUNT(*) as count
       FROM contracts
       WHERE user_id = $1
       AND EXTRACT(MONTH FROM created_at) = $2
       AND EXTRACT(YEAR FROM created_at) = $3`,
      [userId, currentMonth + 1, currentYear]
    );

    const lastMonthProposals = await pool.query(
      `SELECT COUNT(*) as count
       FROM contracts
       WHERE user_id = $1
       AND EXTRACT(MONTH FROM created_at) = $2
       AND EXTRACT(YEAR FROM created_at) = $3`,
      [userId, lastMonth + 1, lastMonthYear]
    );

    const currentProposals = parseInt(currentMonthProposals.rows[0]?.count || '0');
    const lastProposals = parseInt(lastMonthProposals.rows[0]?.count || '0');
    const proposalsChange = lastProposals > 0 ? ((currentProposals - lastProposals) / lastProposals * 100) : 0;

    // Tarefas Pendentes
    const pendingTasks = await pool.query(
      `SELECT COUNT(*) as count
       FROM tasks
       WHERE user_id = $1 AND status = 'pending'`,
      [userId]
    );

    const lastMonthPendingTasks = await pool.query(
      `SELECT COUNT(*) as count
       FROM tasks
       WHERE user_id = $1
       AND status = 'pending'
       AND EXTRACT(MONTH FROM created_at) = $2
       AND EXTRACT(YEAR FROM created_at) = $3`,
      [userId, lastMonth + 1, lastMonthYear]
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
    const userId = req.userId!;
    const months = [];
    const now = new Date();
    
    // Últimos 7 meses
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
          `SELECT COALESCE(SUM(total_amount), 0) as total
           FROM orders
           WHERE store_user_id = $1
           AND EXTRACT(MONTH FROM created_at) = $2
           AND EXTRACT(YEAR FROM created_at) = $3`,
          [userId, m.month, m.year]
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
    const userId = req.userId!;
    const months = [];
    const now = new Date();
    
    // Últimos 7 meses
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
          `SELECT COUNT(*) as count
           FROM leads
           WHERE user_id = $1
           AND EXTRACT(MONTH FROM created_at) = $2
           AND EXTRACT(YEAR FROM created_at) = $3`,
          [userId, m.month, m.year]
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
    const userId = req.userId!;

    // Buscar distribuição de clientes por funnel_stage
    const funnelData = await pool.query(
      `SELECT 
        COALESCE(funnel_stage, 'Sem estágio') as stage,
        COUNT(*) as count
       FROM clients
       WHERE user_id = $1
       GROUP BY funnel_stage
       ORDER BY count DESC`,
      [userId]
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

    // Buscar atividades recentes de diferentes tabelas
    const activities = [];

    // Leads criados
    const recentLeads = await pool.query(
      `SELECT 
        'lead' as type,
        'adicionou um novo lead' as action,
        name as entity_name,
        created_at
       FROM leads
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 3`,
      [userId]
    );

    // Clientes criados
    const recentClients = await pool.query(
      `SELECT 
        'client' as type,
        'adicionou um novo cliente' as action,
        name as entity_name,
        created_at
       FROM clients
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 3`,
      [userId]
    );

    // Contratos criados
    const recentContracts = await pool.query(
      `SELECT 
        'contract' as type,
        'criou um contrato' as action,
        title as entity_name,
        created_at
       FROM contracts
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 3`,
      [userId]
    );

    // Tarefas criadas
    const recentTasks = await pool.query(
      `SELECT 
        'task' as type,
        'adicionou uma tarefa' as action,
        title as entity_name,
        created_at
       FROM tasks
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 3`,
      [userId]
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
    const userId = req.userId!;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Buscar tarefas de hoje e próximos dias
    const tasks = await pool.query(
      `SELECT 
        id,
        title,
        due_date,
        due_time,
        priority,
        status
       FROM tasks
       WHERE user_id = $1
       AND status = 'pending'
       AND (due_date >= $2 OR due_date IS NULL)
       ORDER BY 
         CASE 
           WHEN due_date = $2::date THEN 0
           WHEN due_date IS NULL THEN 2
           ELSE 1
         END,
         due_time ASC NULLS LAST,
         created_at ASC
       LIMIT 10`,
      [userId, today.toISOString().split('T')[0]]
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

// Manter endpoint antigo para compatibilidade
export async function getDashboardStats(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;

    // Get counts
    const [leadsCount, clientsCount, funnelsCount, productsCount] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM leads WHERE user_id = $1', [userId]),
      pool.query('SELECT COUNT(*) as count FROM clients WHERE user_id = $1', [userId]),
      pool.query('SELECT COUNT(*) as count FROM sales_funnels WHERE user_id = $1', [userId]),
      pool.query('SELECT COUNT(*) as count FROM products WHERE user_id = $1', [userId]),
    ]);

    // Get recent leads
    const recentLeads = await pool.query(
      'SELECT * FROM leads WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
      [userId]
    );

    // Get leads by status
    const leadsByStatus = await pool.query(
      `SELECT status, COUNT(*) as count 
       FROM leads 
       WHERE user_id = $1 AND status IS NOT NULL
       GROUP BY status`,
      [userId]
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

