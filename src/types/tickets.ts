export type TicketStatus = 
  | 'new'
  | 'open'
  | 'pending'
  | 'waiting_customer'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'cancelled';

export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export type TicketChannel = 'portal' | 'email' | 'whatsapp' | 'internal';

export type MessageVisibility = 'public' | 'internal';

export type AutomationTrigger = 
  | 'on_create'
  | 'on_update'
  | 'status_change'
  | 'sla_overdue'
  | 'first_response_overdue'
  | 'resolution_overdue';

export interface Ticket {
  id: string;
  ticket_number: string;
  public_access_token?: string | null;
  user_id: string;
  profile_id?: string;
  client_id?: string;
  lead_id?: string | null;
  /** Quando a API incluir join com clients (opcional). */
  client_name?: string | null;
  /** Quando a API incluir join com leads (opcional). */
  lead_name?: string | null;
  client_avatar?: string | null;
  lead_avatar?: string | null;
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
  subject: string;
  description: string;
  category_id?: string;
  priority: TicketPriority;
  status: TicketStatus;
  channel: TicketChannel;
  team_id?: string;
  assignee_id?: string;
  tags: any;
  custom_fields: any;
  sla_policy_id?: string;
  first_response_at?: string;
  first_response_due_at?: string;
  resolution_due_at?: string;
  resolved_at?: string;
  closed_at?: string;
  sla_paused_at?: string;
  sla_paused_duration: number;
  billable: boolean;
  billable_hours: number;
  created_at: string;
  updated_at: string;
  /** Última mensagem pública: autor (API). */
  last_message_author_role?: 'customer' | 'support' | null;
  last_message_at?: string | null;
  /** Última mensagem pública do cliente (auto-resolve futuro). */
  last_customer_reply_at?: string | null;
}

export interface TicketMessage {
  id: string;
  ticket_id: string;
  user_id: string;
  content: string;
  visibility: MessageVisibility;
  attachments: any;
  mentions: any;
  created_at: string;
  updated_at: string;
}

export interface TicketCategory {
  id: string;
  user_id: string;
  profile_id?: string;
  name: string;
  description?: string;
  color: string;
  default_team_id?: string;
  custom_form: any;
  created_at: string;
  updated_at: string;
}

export interface TicketTeam {
  id: string;
  user_id: string;
  profile_id?: string;
  name: string;
  description?: string;
  members: any;
  created_at: string;
  updated_at: string;
}

export interface TicketSLAPolicy {
  id: string;
  user_id: string;
  profile_id?: string;
  name: string;
  priority: TicketPriority;
  first_response_minutes: number;
  resolution_minutes: number;
  business_hours: any;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TicketTemplate {
  id: string;
  user_id: string;
  profile_id?: string;
  name: string;
  content: string;
  category_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TicketAutomation {
  id: string;
  user_id: string;
  profile_id?: string;
  name: string;
  description?: string;
  trigger_type: AutomationTrigger;
  conditions: any;
  actions: any;
  is_active: boolean;
  execution_count: number;
  last_executed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface TicketActivity {
  id: string;
  ticket_id: string;
  user_id?: string;
  activity_type: string;
  changes?: any;
  metadata?: any;
  created_at: string;
}

export interface TicketWatcher {
  id: string;
  ticket_id: string;
  user_id: string;
  created_at: string;
}

export const ticketStatusLabels: Record<TicketStatus, string> = {
  new: 'Novo',
  open: 'Aberto',
  pending: 'Pendente',
  waiting_customer: 'Aguardando Cliente',
  in_progress: 'Em Andamento',
  resolved: 'Resolvido',
  closed: 'Fechado',
  cancelled: 'Cancelado'
};

export const ticketPriorityLabels: Record<TicketPriority, string> = {
  low: 'Baixa',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente'
};

export const ticketChannelLabels: Record<TicketChannel, string> = {
  portal: 'Portal público',
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  internal: 'Interno'
};

export const ticketStatusColors: Record<TicketStatus, string> = {
  new: 'bg-blue-500',
  open: 'bg-green-500',
  pending: 'bg-yellow-500',
  waiting_customer: 'bg-orange-500',
  in_progress: 'bg-purple-500',
  resolved: 'bg-emerald-500',
  closed: 'bg-gray-500',
  cancelled: 'bg-red-500'
};

export const ticketPriorityColors: Record<TicketPriority, string> = {
  low: 'bg-gray-400',
  normal: 'bg-blue-500',
  high: 'bg-orange-500',
  urgent: 'bg-red-500'
};
