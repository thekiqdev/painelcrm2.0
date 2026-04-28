import { apiClient } from '@/integrations/api/client';

export interface KPIData {
  sales: { value: number; change: number; changeType: 'positive' | 'negative' };
  leads: { value: number; change: number; changeType: 'positive' | 'negative' };
  proposals: { value: number; change: number; changeType: 'positive' | 'negative' };
  tasks: { value: number; change: number; changeType: 'positive' | 'negative' };
}

export interface ChartData {
  name: string;
  value: number;
}

export interface FunnelData {
  name: string;
  value: number;
  color: string;
}

export interface Activity {
  user: string;
  action: string;
  entity: string;
  time: string;
  color: string;
}

export interface UpcomingTask {
  id: string;
  title: string;
  time: string;
  priority: string;
  color: string;
}

export interface DashboardOverviewResponse {
  period: { from: string; to: string; preset: string | null };
  sales: {
    received_revenue: number;
    future_revenue: number;
    conversion_rate: number;
    conversion_rate_prev: number;
    conversion_rate_change_pct: number;
    average_ticket: number | null;
    paid_sales_count: number;
    received_revenue_prev: number;
    received_revenue_change_pct: number;
  };
  funnel: Array<{
    stage_id: string;
    stage_name: string;
    count: number;
    amount: number;
  }>;
  operations: {
    leads_without_response: number;
    open_tickets: number;
    overdue_tickets: number;
    overdue_tasks: number;
    today_tasks: number;
    critical_tasks: number;
  };
  clients: {
    active_clients: number;
    new_clients: number;
    active_subscriptions: number;
    clients_with_overdue_invoices: number;
  };
  finance: {
    income_received: number;
    income_projected: number;
    expense_paid: number;
    expense_projected: number;
    result_projected: number;
    cash_available: number;
  };
  monthly: Array<{
    month: string;
    revenue_received: number;
    revenue_projected: number;
    expenses_paid: number;
    expenses_projected: number;
  }>;
  alerts: Array<{
    type: string;
    severity: "warning" | "critical";
    title: string;
    description: string;
    href: string;
  }>;
  accounts_payable_next_7_days?: Array<{
    id: string;
    description: string;
    due_date: string;
    amount_cents: number;
    source: "transaction" | "recurring";
    status: "planned" | "pending";
  }>;
  accounts_payable_total_cents?: number;
  next_7_days?: {
    receivable_cents: number;
    payable_cents: number;
    balance_cents: number;
  };
  tasks_overview?: {
    overdue: Array<{
      id: string;
      title: string;
      due_date: string | null;
      priority: string | null;
      status: string | null;
      project_name: string | null;
      client_name: string | null;
    }>;
    due_today: Array<{
      id: string;
      title: string;
      due_date: string | null;
      priority: string | null;
      status: string | null;
      project_name: string | null;
      client_name: string | null;
    }>;
    upcoming: Array<{
      id: string;
      title: string;
      due_date: string | null;
      priority: string | null;
      status: string | null;
      project_name: string | null;
      client_name: string | null;
    }>;
    recent_assigned: Array<{
      id: string;
      title: string;
      due_date: string | null;
      priority: string | null;
      status: string | null;
      project_name: string | null;
      client_name: string | null;
    }>;
  };
  projects_overview?: Array<{
    id: string;
    name: string;
    status: string | null;
    due_date: string | null;
    pending_tasks: number;
    progress_pct: number;
  }>;
  chat_overview?: {
    active_conversations: number;
    awaiting_response: number;
    unread: number;
    list: Array<{
      id: string;
      contact_name: string | null;
      phone_number: string | null;
      unread_count: number;
      last_message_at: string | null;
    }>;
  };
  tickets_overview?: {
    open: number;
    in_progress: number;
    resolved: number;
    recent: Array<{
      id: string;
      ticket_number: string;
      subject: string;
      status: string;
      updated_at: string;
    }>;
  };
  agent_attendance?: {
    my_in_service: number;
    my_queued: number;
    my_closed_7d: number;
    queue_unassigned: number;
    preview: Array<{
      id: string;
      contact_name: string | null;
      phone_number: string | null;
      attendance_status: string | null;
      last_message_at: string | null;
      unread_count: number;
    }>;
  } | null;
  /** Próximos compromissos agendados (até 3), respeitando permissão da agenda. */
  upcoming_appointments?: Array<{
    id: string;
    title: string;
    starts_at: string;
    client_name: string | null;
  }>;
  appointments_needing_reschedule?: Array<{
    id: string;
    title: string;
    starts_at: string;
    client_name: string | null;
    task_created: boolean;
    task_href: string | null;
  }>;
}

export interface ActivationMissionItem {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
}

export interface ActivationChecklistPayload {
  dismissed: boolean;
  applicableTotal: number;
  completedCount: number;
  progressPercent: number;
  pendingMissions: ActivationMissionItem[];
}

export const dashboardService = {
  async getKPIs(): Promise<KPIData> {
    const response = await apiClient.get<KPIData>('/api/dashboard/kpis');
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Erro ao buscar KPIs');
    return response.data;
  },

  async getSalesChart(): Promise<ChartData[]> {
    const response = await apiClient.get<ChartData[]>('/api/dashboard/charts/sales');
    if (response.error) throw new Error(response.error);
    return response.data || [];
  },

  async getLeadsChart(): Promise<ChartData[]> {
    const response = await apiClient.get<ChartData[]>('/api/dashboard/charts/leads');
    if (response.error) throw new Error(response.error);
    return response.data || [];
  },

  async getFunnelData(): Promise<FunnelData[]> {
    const response = await apiClient.get<FunnelData[]>('/api/dashboard/funnel');
    if (response.error) throw new Error(response.error);
    return response.data || [];
  },

  async getRecentActivities(): Promise<Activity[]> {
    const response = await apiClient.get<Activity[]>('/api/dashboard/activities');
    if (response.error) throw new Error(response.error);
    return response.data || [];
  },

  async getUpcomingTasks(): Promise<UpcomingTask[]> {
    const response = await apiClient.get<UpcomingTask[]>('/api/dashboard/tasks');
    if (response.error) throw new Error(response.error);
    return response.data || [];
  },

  async getOverview(params?: {
    preset?: "current_month" | "last_month" | "ytd";
    from?: string;
    to?: string;
  }): Promise<DashboardOverviewResponse> {
    const q = new URLSearchParams();
    if (params?.preset) q.set("preset", params.preset);
    if (params?.from) q.set("from", params.from);
    if (params?.to) q.set("to", params.to);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    const response = await apiClient.get<DashboardOverviewResponse>(`/api/dashboard/overview${suffix}`);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error("Erro ao carregar visão geral executiva");
    return response.data;
  },

  async getActivationChecklist(): Promise<ActivationChecklistPayload> {
    const response = await apiClient.get<ActivationChecklistPayload>('/api/dashboard/activation-checklist');
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Erro ao carregar primeiros passos');
    return response.data;
  },

  async dismissActivationChecklist(): Promise<void> {
    const response = await apiClient.post<{ ok: boolean }>(
      '/api/dashboard/activation-checklist/dismiss',
      {}
    );
    if (response.error) throw new Error(response.error);
  },
};

