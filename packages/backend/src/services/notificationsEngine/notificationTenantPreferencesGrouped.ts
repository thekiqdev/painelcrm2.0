import type { CatalogWithTenantStateRow } from './notificationEngineRepository.js';
import { scheduleFieldsForEventKey } from './invoiceDigestSchedulePolicy.js';

export type TenantPreferenceEventJson = {
  event_key: string;
  label: string;
  description: string | null;
  channel: string;
  enabled: boolean;
  template_exists: boolean;
  has_override: boolean;
  /** Última entrega registada para este evento neste tenant, se existir. */
  last_delivery_status: string | null;
  last_delivery_at: string | null;
  /** Timing efetivo (defaults aplicados) — só due_soon / overdue. */
  schedule?: {
    days_before?: number;
    days_after?: number;
    repeat_enabled?: boolean;
    repeat_every_days?: number;
    repeat_max_extra?: number;
  } | null;
};

export type TenantPreferenceModuleJson = {
  module: string;
  label: string;
  events: TenantPreferenceEventJson[];
};

/** Nomes curtos para UI (evita expor chaves técnicas). */
const EVENT_LABEL_PT: Record<string, string> = {
  'appointment.invited': 'Convite de compromisso',
  'appointment.reminder': 'Lembrete de compromisso',
  'appointment.completed': 'Resumo pós-compromisso',
  'appointment.confirmation_request': 'Solicitação de confirmação',
  'proposal.sent': 'Proposta enviada ao cliente',
  'proposal.accepted': 'Confirmação de proposta aceita',
  'proposal.rejected': 'Proposta recusada',
  'contract.sent': 'Contrato enviado para assinatura',
  'contract.signed': 'Contrato assinado',
  'invoice.created': 'Nova fatura',
  'invoice.due_soon': 'Lembrete antes do vencimento',
  'invoice.overdue': 'Fatura em atraso',
  'invoice.paid': 'Confirmação de pagamento',
};

const MODULE_BUCKET_LABEL: Record<string, string> = {
  billing: 'Faturas',
  proposals: 'Propostas',
  contracts: 'Contratos',
  agenda: 'Agenda',
  other: 'Outros',
};

const MODULE_ORDER = ['billing', 'proposals', 'contracts', 'agenda', 'other'];

function toApiModule(dbModule: string): keyof typeof MODULE_BUCKET_LABEL | string {
  if (dbModule === 'invoices') return 'billing';
  if (dbModule === 'proposals') return 'proposals';
  if (dbModule === 'contracts') return 'contracts';
  if (dbModule === 'agenda') return 'agenda';
  return 'other';
}

function displayLabel(row: CatalogWithTenantStateRow): string {
  const manual = EVENT_LABEL_PT[row.event_key];
  if (manual) return manual;
  const d = row.description?.trim();
  if (d) return d;
  return row.event_key;
}

export type LastDeliveryByEventInput = {
  status: string;
  created_at: Date;
};

/**
 * Agrupa o catálogo por módulo amigável (billing = faturas, etc.) para GET /tenant/preferences.
 */
export function groupCatalogRowsForTenantPreferences(
  rows: CatalogWithTenantStateRow[],
  lastByEventKey: Map<string, LastDeliveryByEventInput>,
): TenantPreferenceModuleJson[] {
  const map = new Map<string, TenantPreferenceEventJson[]>();

  for (const row of rows) {
    const apiModule = toApiModule(row.module);
    const bucket = MODULE_BUCKET_LABEL[apiModule] ? apiModule : 'other';
    const effectiveChannel = row.pref_primary_channel || row.default_channel;
    const enabled = row.pref_enabled !== false;
    const last = lastByEventKey.get(row.event_key);

    const evt: TenantPreferenceEventJson = {
      event_key: row.event_key,
      label: displayLabel(row),
      description: row.description,
      channel: effectiveChannel,
      enabled,
      template_exists: row.has_system_template,
      has_override: row.has_override,
      last_delivery_status: last ? last.status : null,
      last_delivery_at: last ? last.created_at.toISOString() : null,
      schedule: scheduleFieldsForEventKey(row.event_key, row.pref_recipient_policy),
    };

    const list = map.get(bucket) ?? [];
    list.push(evt);
    map.set(bucket, list);
  }

  for (const [, events] of map) {
    events.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }

  const out: TenantPreferenceModuleJson[] = [];
  for (const key of MODULE_ORDER) {
    const events = map.get(key);
    if (!events?.length) continue;
    out.push({
      module: key,
      label: MODULE_BUCKET_LABEL[key] ?? key,
      events,
    });
  }
  return out;
}
