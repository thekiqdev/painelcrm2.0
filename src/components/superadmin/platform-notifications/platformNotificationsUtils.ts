export const LOCALE = 'pt-BR';
export const CHANNEL = 'whatsapp';

export type CatalogEvent = {
  id: string;
  event_key: string;
  module: string;
  description: string | null;
  default_channel: string;
  merge_field_list: string[];
  is_active: boolean;
  has_override: boolean;
};

export type EventDetail = {
  event: CatalogEvent;
  system: {
    body_template: string;
    subject_template: string | null;
    version: number;
    send_whatsapp_pix_copy_paste_button?: boolean;
  };
  override: {
    body_template: string;
    subject_template: string | null;
    send_whatsapp_pix_copy_paste_button?: boolean;
  } | null;
  effective_source: 'override' | 'system';
};

export type PlatformGlobalSettings = {
  ok?: boolean;
  platform_notifications_enabled: boolean;
  platform_notifications_whatsapp_send_enabled: boolean;
  platform_notifications_verbose_log: boolean;
  platform_notifications_business_events_enabled: boolean;
  platform_notifications_pilot_target_tenant_ids: string | null;
  platform_notifications_dispatch_tenant_id: string | null;
  platform_notifications_dispatch_sender_user_id: string | null;
  platform_notifications_whatsapp_chat_instance_id: string | null;
};

export type DeliveryRow = {
  id: string;
  target_tenant_id: string;
  event_key: string;
  status: string;
  channel: string;
  recipient_address: string | null;
  recipient_type: string | null;
  error_message: string | null;
  entity_type?: string;
  entity_id?: string | null;
  created_at: string;
};

export const MODULE_LABELS: Record<string, string> = {
  account: 'Conta e acesso',
  billing: 'Cobrança e pagamento',
  plan: 'Plano e assinatura',
  subscription: 'Plano e assinatura',
};

export const EVENT_TITLES: Record<string, string> = {
  'platform.account.created': 'Conta criada na plataforma',
  'platform.plan.activated': 'Plano ativado',
  'platform.billing.charge.created': 'Cobrança criada (SaaS)',
  'platform.billing.charge.overdue': 'Fatura vencida (SaaS)',
  'platform.billing.payment_confirmed': 'Pagamento confirmado (SaaS)',
  'platform.trial.started': 'Trial iniciado',
  'platform.trial.ended': 'Trial encerrado',
  'platform.trial.expiring': 'Trial a vencer',
  'platform.auth.login_link.issued': 'Link de login emitido',
};

export function moduleLabel(m: string) {
  return MODULE_LABELS[m] ?? m;
}

export function eventTitle(key: string) {
  return EVENT_TITLES[key] ?? key;
}

export function channelLabel(ch: string) {
  if (ch === 'whatsapp') return 'WhatsApp';
  if (ch === 'email') return 'E-mail';
  return ch;
}

export function buildSampleMergeContext(fields: string[]): Record<string, string> {
  const samples: Record<string, string> = {
    'platform.name': 'PainelCRM',
    'platform.support_link': 'https://exemplo.app/suporte',
    'auth.login_link': 'https://exemplo.app/login',
    tenant_name: 'Empresa Exemplo Lda',
    tenant_id: '00000000-0000-4000-8000-000000000001',
    user_name: 'Maria Silva',
    user_email: 'admin@exemplo.pt',
    plan_name: 'Plano Profissional',
    amount_display: '29,90 €',
    charge_id: 'chg_demo_001',
    payment_id: 'pay_demo_001',
    invoice_number: 'FAT-2026-001',
  };
  const o: Record<string, string> = {};
  for (const f of fields) {
    o[f] = samples[f] ?? `[exemplo: ${f}]`;
  }
  return o;
}
