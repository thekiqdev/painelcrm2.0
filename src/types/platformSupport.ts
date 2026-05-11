export type PlatformSupportCategory =
  | 'question'
  | 'bug'
  | 'billing'
  | 'whatsapp_integration'
  | 'google_integration'
  | 'suggestion'
  | 'other';

export type PlatformSupportPriority = 'low' | 'medium' | 'high' | 'urgent';

export type PlatformSupportStatus =
  | 'open'
  | 'waiting_support'
  | 'waiting_customer'
  | 'resolved'
  | 'closed';

export type PlatformSupportPublicSettings = {
  support_enabled: boolean;
  whatsapp_configured: boolean;
  whatsapp_number_masked: string | null;
  whatsapp_url: string | null;
  whatsapp_message_preview: string;
};

export type PlatformSupportTicket = {
  id: string;
  tenant_id: string;
  created_by_user_id: string;
  subject: string;
  category: PlatformSupportCategory;
  priority: PlatformSupportPriority;
  status: PlatformSupportStatus;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  tenant_name?: string;
  created_by_email?: string;
};

export type PlatformSupportMessage = {
  id: string;
  ticket_id: string;
  sender_type: 'customer' | 'superadmin';
  sender_user_id: string | null;
  message: string;
  attachments: unknown[];
  created_at: string;
  sender_email?: string | null;
};

export const platformSupportCategoryLabels: Record<PlatformSupportCategory, string> = {
  question: 'Dúvida',
  bug: 'Erro / Bug',
  billing: 'Financeiro',
  whatsapp_integration: 'Integração WhatsApp',
  google_integration: 'Integração Google',
  suggestion: 'Sugestão',
  other: 'Outro',
};

export const platformSupportPriorityLabels: Record<PlatformSupportPriority, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente',
};

export const platformSupportStatusLabels: Record<PlatformSupportStatus, string> = {
  open: 'Aberto',
  waiting_support: 'Aguardando suporte',
  waiting_customer: 'Aguardando cliente',
  resolved: 'Resolvido',
  closed: 'Encerrado',
};

export const platformSupportStatusColors: Record<PlatformSupportStatus, string> = {
  open: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  waiting_support: 'bg-amber-500/15 text-amber-800 dark:text-amber-200',
  waiting_customer: 'bg-violet-500/15 text-violet-800 dark:text-violet-200',
  resolved: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
  closed: 'bg-muted text-muted-foreground',
};

export const platformSupportPriorityColors: Record<PlatformSupportPriority, string> = {
  low: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
  medium: 'bg-sky-500/10 text-sky-800 dark:text-sky-200',
  high: 'bg-orange-500/15 text-orange-800 dark:text-orange-200',
  urgent: 'bg-red-500/15 text-red-800 dark:text-red-200',
};
