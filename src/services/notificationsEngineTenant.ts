import { apiClient } from '@/integrations/api/client';

const BASE = '/api/notifications-engine';

export type NeBootstrap = {
  ok: boolean;
  engine_enabled: boolean;
  /** Efetivo para publicação automática (motor + flag global de negócio). */
  business_events_enabled?: boolean;
  /** Efetivo para envio ao gateway (motor + flag global WhatsApp). */
  whatsapp_send_enabled?: boolean;
  default_locale: string;
};

export type NeCatalogItem = {
  event_key: string;
  module: string;
  description: string | null;
  default_channel: string;
  effective_channel: string;
  merge_fields: unknown;
  tenant_enabled: boolean;
  has_override: boolean;
  template_exists?: boolean;
};

export type NePreferenceEvent = {
  event_key: string;
  label: string;
  description: string | null;
  channel: string;
  enabled: boolean;
  template_exists: boolean;
  has_override: boolean;
  last_delivery_status: string | null;
  last_delivery_at: string | null;
  /** Timing efetivo (defaults no backend) — due_soon / overdue. */
  schedule?: {
    days_before?: number;
    days_after?: number;
    repeat_enabled?: boolean;
    repeat_every_days?: number;
    repeat_max_extra?: number;
  } | null;
};

export type NePreferenceModule = {
  module: string;
  label: string;
  events: NePreferenceEvent[];
};

export type NeTenantPreferencesResponse = {
  ok: boolean;
  modules: NePreferenceModule[];
};

export type NeTenantSummaryResponse = {
  ok: boolean;
  active_events_count: number;
  disabled_events_count: number;
  sent_last_7_days: number;
  failures_last_7_days: number;
};

export type NeCatalogResponse = {
  ok: boolean;
  locale: string;
  items: NeCatalogItem[];
};

export type NeTemplateBundle = {
  ok: boolean;
  event_key: string;
  locale: string;
  effective_channel: string;
  merge_fields: string[];
  system: { subject_template: string | null; body_template: string; version: number };
  override: { subject_template: string | null; body_template: string } | null;
};

export type NeDeliveryRow = {
  id: string;
  tenant_id: string;
  event_key: string;
  entity_type?: string;
  entity_id?: string | null;
  status: string;
  rendered_body: string;
  rendered_subject: string | null;
  error_message: string | null;
  provider_message_id: string | null;
  idempotency_key: string;
  created_at: string;
  channel?: string;
  /** Módulo do catálogo (invoices, proposals, …). */
  module?: string | null;
  recipient_type?: string;
  recipient_address?: string;
  retry_count?: number;
  next_retry_at?: string | null;
  dispatch_sender_user_id?: string | null;
  sent_at?: string | null;
};

export type NeDeliveryAttemptRow = {
  id: string;
  attempt_number: number;
  status: string;
  error_message: string | null;
  provider_response: unknown;
  duration_ms: number | null;
  created_at: string;
};

export type NeDeliveriesSearchResponse = {
  ok: boolean;
  deliveries: NeDeliveryRow[];
};

export async function fetchNeBootstrap() {
  return apiClient.get<NeBootstrap>(`${BASE}/bootstrap`);
}

export async function fetchNeCatalogWithState(locale = 'pt-BR') {
  return apiClient.get<NeCatalogResponse>(`${BASE}/tenant/catalog-with-state?locale=${encodeURIComponent(locale)}`);
}

export async function fetchNeTenantPreferences(locale = 'pt-BR') {
  return apiClient.get<NeTenantPreferencesResponse>(
    `${BASE}/tenant/preferences?locale=${encodeURIComponent(locale)}`,
  );
}

export async function fetchNeTenantSummary() {
  return apiClient.get<NeTenantSummaryResponse>(`${BASE}/tenant/summary`);
}

export async function fetchNeDeliveryAttempts(deliveryId: string) {
  return apiClient.get<{ ok: boolean; attempts: NeDeliveryAttemptRow[] }>(
    `${BASE}/deliveries/${encodeURIComponent(deliveryId)}/attempts`,
  );
}

export async function fetchNeTemplateBundle(eventKey: string, locale = 'pt-BR', channel?: string) {
  const q = new URLSearchParams({ locale });
  if (channel) q.set('channel', channel);
  return apiClient.get<NeTemplateBundle>(
    `${BASE}/tenant/template-bundle/${encodeURIComponent(eventKey)}?${q.toString()}`,
  );
}

export async function putNeTenantPreference(
  eventKey: string,
  body: {
    enabled: boolean;
    channel?: 'whatsapp' | 'email' | 'sms';
    recipient_policy?: {
      days_before?: number;
      days_after?: number;
      repeat_enabled?: boolean;
      repeat_every_days?: number;
      repeat_max_extra?: number;
    };
  },
) {
  return apiClient.put<{ ok: boolean }>(`${BASE}/tenant/preferences/${encodeURIComponent(eventKey)}`, body);
}

export async function patchNeTenantPreference(
  eventKey: string,
  body: {
    enabled: boolean;
    channel?: 'whatsapp' | 'email' | 'sms';
    recipient_policy?: {
      days_before?: number;
      days_after?: number;
      repeat_enabled?: boolean;
      repeat_every_days?: number;
      repeat_max_extra?: number;
    };
  },
) {
  return apiClient.patch<{ ok: boolean }>(`${BASE}/tenant/preferences/${encodeURIComponent(eventKey)}`, body);
}

export async function putNeTenantOverride(
  eventKey: string,
  body: { body_template: string; subject_template?: string | null },
  locale = 'pt-BR',
  channel?: string,
) {
  const q = new URLSearchParams({ locale });
  if (channel) q.set('channel', channel);
  return apiClient.put<{ ok: boolean }>(
    `${BASE}/tenant/override/${encodeURIComponent(eventKey)}?${q.toString()}`,
    body,
  );
}

export async function deleteNeTenantOverride(eventKey: string, locale = 'pt-BR', channel?: string) {
  const q = new URLSearchParams({ locale });
  if (channel) q.set('channel', channel);
  return apiClient.delete<{ ok: boolean; deleted: number }>(
    `${BASE}/tenant/override/${encodeURIComponent(eventKey)}?${q.toString()}`,
  );
}

export type NePreviewResponse =
  | {
      ok: true;
      render_ok: true;
      rendered_subject: string | null;
      rendered_body: string;
    }
  | {
      ok: true;
      render_ok: false;
      error: string;
      disallowed_placeholders?: string[];
      missing_keys?: string[];
    };

export async function postNePreview(body: {
  event_key: string;
  body_template: string;
  subject_template?: string | null;
  merge_context?: Record<string, string>;
}) {
  return apiClient.post<NePreviewResponse>(`${BASE}/tenant/preview`, body);
}

export async function fetchNeDeliveriesSearch(params: {
  hours?: number;
  limit?: number;
  status?: string;
  event_key?: string;
  channel?: string;
  module?: string;
}) {
  const q = new URLSearchParams();
  if (params.hours != null) q.set('hours', String(params.hours));
  if (params.limit != null) q.set('limit', String(params.limit));
  if (params.status) q.set('status', params.status);
  if (params.event_key) q.set('event_key', params.event_key);
  if (params.channel) q.set('channel', params.channel);
  if (params.module) q.set('module', params.module);
  const qs = q.toString();
  return apiClient.get<NeDeliveriesSearchResponse>(`${BASE}/deliveries/search${qs ? `?${qs}` : ''}`);
}
