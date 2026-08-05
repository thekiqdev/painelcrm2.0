import type { Pool, PoolClient } from 'pg';

export type NotificationEventRow = {
  id: string;
  event_key: string;
  module: string;
  description: string | null;
  default_channel: string;
  merge_fields: unknown;
  is_active: boolean;
};

export type SystemTemplateRow = {
  id: string;
  event_key: string;
  channel: string;
  locale: string;
  subject_template: string | null;
  body_template: string;
  version: number;
  is_active: boolean;
};

export type TenantPreferenceRow = {
  enabled: boolean;
  primary_channel: string | null;
  recipient_policy: unknown;
};

export type TenantOverrideRow = {
  subject_template: string | null;
  body_template: string;
  system_template_id: string;
};

export type DeliveryRow = {
  id: string;
  tenant_id: string;
  event_key: string;
  status: string;
  rendered_body: string;
  rendered_subject: string | null;
  error_message: string | null;
  provider_message_id: string | null;
  idempotency_key: string;
  created_at: Date;
  channel?: string;
  retry_count?: number;
  next_retry_at?: Date | null;
  dispatch_not_before?: Date | null;
  dispatch_sender_user_id?: string | null;
  sent_at?: Date | null;
  entity_type?: string;
  entity_id?: string | null;
  recipient_type?: string;
  recipient_address?: string;
  /** Módulo do catálogo (ex.: invoices, proposals), quando JOIN disponível. */
  catalog_module?: string | null;
};

export type DeliveryAttemptRow = {
  id: string;
  attempt_number: number;
  status: string;
  error_message: string | null;
  provider_response: unknown;
  duration_ms: number | null;
  created_at: Date;
};

export type LastDeliveryByEventRow = {
  event_key: string;
  status: string;
  created_at: Date;
};

export type OutboundDeliveryDispatchRow = {
  id: string;
  tenant_id: string;
  event_key: string;
  channel: string;
  recipient_type: string;
  recipient_address: string;
  rendered_body: string;
  rendered_subject: string | null;
  dispatch_sender_user_id: string | null;
  dispatch_chat_instance_id: string | null;
  retry_count: number;
  next_retry_at: Date | null;
  dispatch_not_before: Date | null;
};

export type DeliveryStatusCountRow = {
  status: string;
  channel: string;
  total: number;
};

export type DeliveryLatencyRow = {
  channel: string;
  avg_latency_ms: number | null;
};

function parseMergeFields(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === 'string');
  }
  if (typeof raw === 'string') {
    try {
      const j = JSON.parse(raw) as unknown;
      return Array.isArray(j) ? j.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function getEventByKey(
  client: Pool | PoolClient,
  eventKey: string,
): Promise<(NotificationEventRow & { merge_field_list: string[] }) | null> {
  const r = await client.query<NotificationEventRow>(
    `SELECT id, event_key, module, description, default_channel, merge_fields, is_active
     FROM notification_event_catalog
     WHERE event_key = $1
     LIMIT 1`,
    [eventKey],
  );
  const row = r.rows[0];
  if (!row) return null;
  return { ...row, merge_field_list: parseMergeFields(row.merge_fields) };
}

export async function getSystemTemplate(
  client: Pool | PoolClient,
  eventKey: string,
  channel: string,
  locale: string,
): Promise<SystemTemplateRow | null> {
  const r = await client.query<SystemTemplateRow>(
    `SELECT id, event_key, channel, locale, subject_template, body_template, version, is_active
     FROM notification_template_system
     WHERE event_key = $1 AND channel = $2 AND locale = $3 AND is_active = true
     LIMIT 1`,
    [eventKey, channel, locale],
  );
  return r.rows[0] ?? null;
}

export async function getTenantPreference(
  client: Pool | PoolClient,
  tenantId: string,
  eventKey: string,
): Promise<TenantPreferenceRow | null> {
  const r = await client.query<TenantPreferenceRow>(
    `SELECT enabled, primary_channel, COALESCE(recipient_policy, '{}'::jsonb) AS recipient_policy
     FROM tenant_notification_preferences
     WHERE tenant_id = $1 AND event_key = $2
     LIMIT 1`,
    [tenantId, eventKey],
  );
  return r.rows[0] ?? null;
}

export async function getTenantOverride(
  client: Pool | PoolClient,
  tenantId: string,
  eventKey: string,
  channel: string,
  locale: string,
): Promise<TenantOverrideRow | null> {
  const r = await client.query<TenantOverrideRow>(
    `SELECT subject_template, body_template, system_template_id
     FROM tenant_notification_template_overrides
     WHERE tenant_id = $1 AND event_key = $2 AND channel = $3 AND locale = $4 AND is_active = true
     LIMIT 1`,
    [tenantId, eventKey, channel, locale],
  );
  return r.rows[0] ?? null;
}

export async function insertDelivery(
  client: Pool | PoolClient,
  params: {
    tenantId: string;
    eventKey: string;
    entityType: string;
    entityId: string | null;
    idempotencyKey: string;
    channel: string;
    recipientType: string;
    recipientAddress: string;
    status: string;
    renderedSubject: string | null;
    renderedBody: string;
    errorMessage: string | null;
    providerMessageId: string | null;
    actor: Record<string, unknown>;
    metadata: Record<string, unknown>;
    eventOccurredAt: Date | null;
    dispatchSenderUserId?: string | null;
    dispatchNotBefore?: Date | null;
  },
): Promise<{ created: boolean; row: DeliveryRow }> {
  const ins = await client.query<DeliveryRow>(
    `INSERT INTO notification_outbound_deliveries (
       tenant_id, event_key, entity_type, entity_id, idempotency_key, channel,
       recipient_type, recipient_address, status, rendered_subject, rendered_body,
       error_message, provider_message_id, actor, metadata, event_occurred_at,
       retry_count, next_retry_at, dispatch_sender_user_id, dispatch_not_before
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16,
       0, NULL, $17, $18
     )
     ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
     RETURNING id, tenant_id, event_key, entity_type, entity_id, status, rendered_body, rendered_subject,
       error_message, provider_message_id, idempotency_key, created_at, channel,
       recipient_type, recipient_address,
       retry_count, next_retry_at, dispatch_sender_user_id, dispatch_not_before`,
    [
      params.tenantId,
      params.eventKey,
      params.entityType,
      params.entityId,
      params.idempotencyKey,
      params.channel,
      params.recipientType,
      params.recipientAddress,
      params.status,
      params.renderedSubject,
      params.renderedBody,
      params.errorMessage,
      params.providerMessageId,
      JSON.stringify(params.actor),
      JSON.stringify(params.metadata),
      params.eventOccurredAt,
      params.dispatchSenderUserId ?? null,
      params.dispatchNotBefore ?? null,
    ],
  );
  if (ins.rows[0]) {
    return { created: true, row: ins.rows[0]! };
  }
  const ex = await client.query<DeliveryRow>(
    `SELECT id, tenant_id, event_key, entity_type, entity_id, status, rendered_body, rendered_subject,
            error_message, provider_message_id, idempotency_key, created_at, channel,
            recipient_type, recipient_address,
            retry_count, next_retry_at, dispatch_sender_user_id, dispatch_not_before
     FROM notification_outbound_deliveries
     WHERE tenant_id = $1 AND idempotency_key = $2
     LIMIT 1`,
    [params.tenantId, params.idempotencyKey],
  );
  return { created: false, row: ex.rows[0]! };
}

export async function updateDeliveryOutcome(
  client: Pool | PoolClient,
  deliveryId: string,
  params: {
    status: string;
    errorMessage: string | null;
    providerMessageId: string | null;
    sentAt: Date | null;
  },
): Promise<void> {
  await client.query(
    `UPDATE notification_outbound_deliveries
     SET status = $2,
         error_message = $3,
         provider_message_id = $4,
         sent_at = $5,
         updated_at = now()
     WHERE id = $1`,
    [deliveryId, params.status, params.errorMessage, params.providerMessageId, params.sentAt],
  );
}

export async function insertDeliveryAttempt(
  client: Pool | PoolClient,
  params: {
    deliveryId: string;
    attemptNumber: number;
    status: string;
    errorMessage: string | null;
    providerResponse: unknown;
    durationMs: number | null;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO notification_outbound_delivery_attempts (
       delivery_id, attempt_number, status, error_message, provider_response, duration_ms
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [
      params.deliveryId,
      params.attemptNumber,
      params.status,
      params.errorMessage,
      JSON.stringify(params.providerResponse ?? {}),
      params.durationMs,
    ],
  );
}

export async function listActiveEvents(client: Pool | PoolClient): Promise<NotificationEventRow[]> {
  const r = await client.query<NotificationEventRow>(
    `SELECT id, event_key, module, description, default_channel, merge_fields, is_active
     FROM notification_event_catalog
     WHERE is_active = true
     ORDER BY module, event_key`,
  );
  return r.rows;
}

export async function listRecentDeliveries(
  client: Pool | PoolClient,
  tenantId: string,
  limit: number,
): Promise<DeliveryRow[]> {
  const r = await client.query<DeliveryRow>(
    `SELECT id, tenant_id, event_key, entity_type, entity_id, status, rendered_body, rendered_subject,
            error_message, provider_message_id, idempotency_key, created_at, channel,
            recipient_type, recipient_address,
            retry_count, next_retry_at, dispatch_sender_user_id, sent_at
     FROM notification_outbound_deliveries
     WHERE tenant_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [tenantId, limit],
  );
  return r.rows;
}

export async function listRecentDeliveriesFiltered(
  client: Pool | PoolClient,
  params: {
    tenantId: string;
    limit: number;
    status?: string | null;
    eventKey?: string | null;
    channel?: string | null;
    hours?: number | null;
    /** Valores do catálogo: invoices, proposals, contracts, agenda, ou 'other'. */
    catalogModule?: string | null;
  },
): Promise<DeliveryRow[]> {
  const hours = Math.min(168, Math.max(1, params.hours ?? 72));
  const lim = Math.min(200, Math.max(1, params.limit));
  const conds: string[] = ['d.tenant_id = $1', `d.created_at >= now() - ($2::int || ' hours')::interval`];
  const vals: unknown[] = [params.tenantId, hours];
  let i = 3;
  if (params.status) {
    conds.push(`d.status = $${i++}`);
    vals.push(params.status);
  }
  if (params.eventKey) {
    conds.push(`d.event_key = $${i++}`);
    vals.push(params.eventKey);
  }
  if (params.channel) {
    conds.push(`d.channel = $${i++}`);
    vals.push(params.channel);
  }
  if (params.catalogModule === 'other') {
    conds.push(
      `(c.module IS NULL OR c.module NOT IN ('invoices', 'proposals', 'contracts', 'agenda'))`,
    );
  } else if (params.catalogModule) {
    conds.push(`c.module = $${i++}`);
    vals.push(params.catalogModule);
  }
  vals.push(lim);
  const r = await client.query<DeliveryRow>(
    `SELECT d.id, d.tenant_id, d.event_key, d.entity_type, d.entity_id, d.status, d.rendered_body, d.rendered_subject,
            d.error_message, d.provider_message_id, d.idempotency_key, d.created_at, d.channel,
            d.recipient_type, d.recipient_address,
            d.retry_count, d.next_retry_at, d.dispatch_sender_user_id, d.sent_at,
            c.module AS catalog_module
     FROM notification_outbound_deliveries d
     LEFT JOIN notification_event_catalog c ON c.event_key = d.event_key
     WHERE ${conds.join(' AND ')}
     ORDER BY d.created_at DESC
     LIMIT $${i}`,
    vals,
  );
  return r.rows;
}

export async function getLatestDeliveryPerEventKey(
  client: Pool | PoolClient,
  tenantId: string,
  eventKeys: string[],
): Promise<LastDeliveryByEventRow[]> {
  if (eventKeys.length === 0) return [];
  const r = await client.query<LastDeliveryByEventRow>(
    `SELECT DISTINCT ON (d.event_key)
       d.event_key,
       d.status,
       d.created_at
     FROM notification_outbound_deliveries d
     WHERE d.tenant_id = $1::uuid
       AND d.event_key = ANY($2::text[])
     ORDER BY d.event_key, d.created_at DESC`,
    [tenantId, eventKeys],
  );
  return r.rows;
}

export async function listDeliveriesForCustomerInvoice(
  client: Pool | PoolClient,
  tenantId: string,
  invoiceId: string,
  eventKey = 'invoice.created',
): Promise<DeliveryRow[]> {
  const r = await client.query<DeliveryRow>(
    `SELECT id, tenant_id, event_key, entity_type, entity_id, status, rendered_body, rendered_subject,
            error_message, provider_message_id, idempotency_key, created_at, channel,
            recipient_type, recipient_address,
            retry_count, next_retry_at, dispatch_sender_user_id, sent_at
     FROM notification_outbound_deliveries
     WHERE tenant_id = $1::uuid
       AND entity_type = 'customer_invoice'
       AND entity_id = $2::uuid
       AND event_key = $3
     ORDER BY created_at DESC
     LIMIT 50`,
    [tenantId, invoiceId, eventKey],
  );
  return r.rows;
}

export type OverdueDigestSendStateRow = {
  entity_id: string;
  idempotency_key: string;
  created_at: Date;
  status: string;
};

/**
 * Deliveries de invoice.overdue para calcular seq / último envio no digest (Sprint 2).
 */
export async function listOverdueDigestDeliveriesForInvoices(
  client: Pool | PoolClient,
  tenantId: string,
  invoiceIds: string[],
): Promise<OverdueDigestSendStateRow[]> {
  if (invoiceIds.length === 0) return [];
  const r = await client.query<OverdueDigestSendStateRow>(
    `SELECT entity_id::text AS entity_id,
            idempotency_key,
            created_at,
            status
     FROM notification_outbound_deliveries
     WHERE tenant_id = $1::uuid
       AND event_key = 'invoice.overdue'
       AND entity_type = 'customer_invoice'
       AND entity_id = ANY($2::uuid[])
       AND status IN ('queued', 'processing', 'sent', 'failed')
     ORDER BY created_at ASC`,
    [tenantId, invoiceIds],
  );
  return r.rows;
}

export async function listDeliveryAttemptsForTenantDelivery(
  client: Pool | PoolClient,
  tenantId: string,
  deliveryId: string,
): Promise<DeliveryAttemptRow[]> {
  const r = await client.query<DeliveryAttemptRow>(
    `SELECT a.id::text, a.attempt_number, a.status, a.error_message, a.provider_response, a.duration_ms, a.created_at
     FROM notification_outbound_delivery_attempts a
     INNER JOIN notification_outbound_deliveries d ON d.id = a.delivery_id
     WHERE d.tenant_id = $1::uuid AND a.delivery_id = $2::uuid
     ORDER BY a.attempt_number ASC`,
    [tenantId, deliveryId],
  );
  return r.rows;
}

export type TenantNotificationPanelSummaryRow = {
  active_events_count: number;
  disabled_events_count: number;
  sent_last_7_days: number;
  failures_last_7_days: number;
};

export async function getTenantNotificationPanelSummary(
  client: Pool | PoolClient,
  tenantId: string,
): Promise<TenantNotificationPanelSummaryRow> {
  const pref = await client.query<{ active: string; disabled: string }>(
    `SELECT
       COUNT(*) FILTER (WHERE COALESCE(p.enabled, true))::text AS active,
       COUNT(*) FILTER (WHERE p.enabled = false)::text AS disabled
     FROM notification_event_catalog c
     LEFT JOIN tenant_notification_preferences p
       ON p.tenant_id = $1::uuid AND p.event_key = c.event_key
     WHERE c.is_active = true`,
    [tenantId],
  );
  const sent = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
     FROM notification_outbound_deliveries
     WHERE tenant_id = $1::uuid
       AND status = 'sent'
       AND created_at >= now() - interval '7 days'`,
    [tenantId],
  );
  const fail = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
     FROM notification_outbound_deliveries
     WHERE tenant_id = $1::uuid
       AND status IN ('failed', 'failed_transient')
       AND created_at >= now() - interval '7 days'`,
    [tenantId],
  );
  return {
    active_events_count: parseInt(pref.rows[0]?.active ?? '0', 10) || 0,
    disabled_events_count: parseInt(pref.rows[0]?.disabled ?? '0', 10) || 0,
    sent_last_7_days: parseInt(sent.rows[0]?.c ?? '0', 10) || 0,
    failures_last_7_days: parseInt(fail.rows[0]?.c ?? '0', 10) || 0,
  };
}

export async function countDeliveryAttempts(client: Pool | PoolClient, deliveryId: string): Promise<number> {
  const r = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM notification_outbound_delivery_attempts WHERE delivery_id = $1`,
    [deliveryId],
  );
  return parseInt(r.rows[0]?.c ?? '0', 10) || 0;
}

export async function getNextDeliveryAttemptNumber(client: Pool | PoolClient, deliveryId: string): Promise<number> {
  const r = await client.query<{ m: string }>(
    `SELECT COALESCE(MAX(attempt_number), 0)::text AS m
     FROM notification_outbound_delivery_attempts
     WHERE delivery_id = $1`,
    [deliveryId],
  );
  return (parseInt(r.rows[0]?.m ?? '0', 10) || 0) + 1;
}

export async function getOutboundDeliveryForDispatch(
  client: Pool | PoolClient,
  deliveryId: string,
): Promise<OutboundDeliveryDispatchRow | null> {
  const r = await client.query<OutboundDeliveryDispatchRow>(
    `SELECT id, tenant_id, event_key, channel, recipient_type, recipient_address,
            rendered_body, rendered_subject, dispatch_sender_user_id,
            dispatch_chat_instance_id, retry_count, next_retry_at,
            dispatch_not_before
     FROM notification_outbound_deliveries
     WHERE id = $1
     LIMIT 1`,
    [deliveryId],
  );
  return r.rows[0] ?? null;
}

export async function listDeliveriesDueForRetry(
  client: Pool | PoolClient,
  limit: number,
): Promise<{ id: string }[]> {
  const r = await client.query<{ id: string }>(
    `SELECT id::text AS id
     FROM notification_outbound_deliveries
     WHERE status = 'queued'
       AND (dispatch_not_before IS NULL OR dispatch_not_before <= now())
       AND (
         (next_retry_at IS NOT NULL AND next_retry_at <= now())
         OR (next_retry_at IS NULL)
       )
     ORDER BY COALESCE(next_retry_at, dispatch_not_before, created_at) ASC
     LIMIT $1`,
    [limit],
  );
  return r.rows;
}

export async function scheduleOutboundDeliveryRetry(
  client: Pool | PoolClient,
  params: {
    deliveryId: string;
    errorMessage: string;
    nextRetryAt: Date;
  },
): Promise<void> {
  await client.query(
    `UPDATE notification_outbound_deliveries
     SET status = 'queued',
         error_message = $2,
         retry_count = retry_count + 1,
         next_retry_at = $3,
         updated_at = now()
     WHERE id = $1`,
    [params.deliveryId, params.errorMessage, params.nextRetryAt],
  );
}

export async function clearOutboundDeliveryRetrySchedule(
  client: Pool | PoolClient,
  deliveryId: string,
): Promise<void> {
  await client.query(
    `UPDATE notification_outbound_deliveries
     SET next_retry_at = NULL,
         updated_at = now()
     WHERE id = $1`,
    [deliveryId],
  );
}

export async function setDispatchSenderIfNull(
  client: Pool | PoolClient,
  deliveryId: string,
  senderUserId: string,
): Promise<void> {
  await client.query(
    `UPDATE notification_outbound_deliveries
     SET dispatch_sender_user_id = COALESCE(dispatch_sender_user_id, $2::uuid),
         updated_at = now()
     WHERE id = $1`,
    [deliveryId, senderUserId],
  );
}

export async function setDispatchChatInstanceIfNull(
  client: Pool | PoolClient,
  deliveryId: string,
  chatInstanceId: string,
): Promise<void> {
  await client.query(
    `UPDATE notification_outbound_deliveries
     SET dispatch_chat_instance_id = COALESCE(dispatch_chat_instance_id, $2::uuid),
         updated_at = now()
     WHERE id = $1`,
    [deliveryId, chatInstanceId],
  );
}

export async function getTenantDeliveryStatusSummary(
  client: Pool | PoolClient,
  tenantId: string,
  hours: number,
): Promise<DeliveryStatusCountRow[]> {
  const h = Math.min(168, Math.max(1, hours));
  const r = await client.query<DeliveryStatusCountRow>(
    `SELECT status, channel, COUNT(*)::int AS total
     FROM notification_outbound_deliveries
     WHERE tenant_id = $1
       AND created_at >= now() - ($2::int || ' hours')::interval
     GROUP BY status, channel
     ORDER BY status, channel`,
    [tenantId, h],
  );
  return r.rows;
}

export async function getGlobalDeliveryStatusSummary(
  client: Pool | PoolClient,
  params: { hours: number; tenantId?: string | null },
): Promise<DeliveryStatusCountRow[]> {
  const h = Math.min(168 * 4, Math.max(1, params.hours));
  if (params.tenantId) {
    const r = await client.query<DeliveryStatusCountRow>(
      `SELECT status, channel, COUNT(*)::int AS total
       FROM notification_outbound_deliveries
       WHERE tenant_id = $1
         AND created_at >= now() - ($2::int || ' hours')::interval
       GROUP BY status, channel
       ORDER BY status, channel`,
      [params.tenantId, h],
    );
    return r.rows;
  }
  const r = await client.query<DeliveryStatusCountRow>(
    `SELECT status, channel, COUNT(*)::int AS total
     FROM notification_outbound_deliveries
     WHERE created_at >= now() - ($1::int || ' hours')::interval
     GROUP BY status, channel
     ORDER BY status, channel`,
    [h],
  );
  return r.rows;
}

export async function getSentLatencySummaryMs(
  client: Pool | PoolClient,
  params: { hours: number; tenantId?: string | null },
): Promise<DeliveryLatencyRow[]> {
  const h = Math.min(168 * 4, Math.max(1, params.hours));
  if (params.tenantId) {
    const r = await client.query<DeliveryLatencyRow>(
      `SELECT channel,
              (AVG(EXTRACT(EPOCH FROM (sent_at - created_at)) * 1000))::float AS avg_latency_ms
       FROM notification_outbound_deliveries
       WHERE tenant_id = $1
         AND status = 'sent'
         AND sent_at IS NOT NULL
         AND created_at >= now() - ($2::int || ' hours')::interval
       GROUP BY channel`,
      [params.tenantId, h],
    );
    return r.rows;
  }
  const r = await client.query<DeliveryLatencyRow>(
    `SELECT channel,
            (AVG(EXTRACT(EPOCH FROM (sent_at - created_at)) * 1000))::float AS avg_latency_ms
     FROM notification_outbound_deliveries
     WHERE status = 'sent'
       AND sent_at IS NOT NULL
       AND created_at >= now() - ($1::int || ' hours')::interval
     GROUP BY channel`,
    [h],
  );
  return r.rows;
}

export async function listOperationalDeliveriesGlobal(
  client: Pool | PoolClient,
  params: {
    limit: number;
    tenantId?: string | null;
    status?: string | null;
    eventKey?: string | null;
    channel?: string | null;
    hours: number;
  },
): Promise<DeliveryRow[]> {
  const lim = Math.min(500, Math.max(1, params.limit));
  const h = Math.min(168 * 4, Math.max(1, params.hours));
  const conds: string[] = [`created_at >= now() - ($1::int || ' hours')::interval`];
  const vals: unknown[] = [h];
  let i = 2;
  if (params.tenantId) {
    conds.push(`tenant_id = $${i++}`);
    vals.push(params.tenantId);
  }
  if (params.status) {
    conds.push(`status = $${i++}`);
    vals.push(params.status);
  }
  if (params.eventKey) {
    conds.push(`event_key = $${i++}`);
    vals.push(params.eventKey);
  }
  if (params.channel) {
    conds.push(`channel = $${i++}`);
    vals.push(params.channel);
  }
  vals.push(lim);
  const r = await client.query<DeliveryRow>(
    `SELECT id, tenant_id, event_key, entity_type, entity_id, status, rendered_body, rendered_subject,
            error_message, provider_message_id, idempotency_key, created_at, channel,
            recipient_type, recipient_address,
            retry_count, next_retry_at, dispatch_sender_user_id, sent_at
     FROM notification_outbound_deliveries
     WHERE ${conds.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${i}`,
    vals,
  );
  return r.rows;
}

export type CatalogWithTenantStateRow = {
  event_key: string;
  module: string;
  description: string | null;
  default_channel: string;
  merge_fields: unknown;
  pref_enabled: boolean | null;
  pref_primary_channel: string | null;
  pref_recipient_policy: unknown;
  has_override: boolean;
  has_system_template: boolean;
};

export async function listCatalogWithTenantState(
  client: Pool | PoolClient,
  tenantId: string,
  locale: string,
): Promise<CatalogWithTenantStateRow[]> {
  const r = await client.query<CatalogWithTenantStateRow>(
    `SELECT c.event_key,
            c.module,
            c.description,
            c.default_channel,
            c.merge_fields,
            p.enabled AS pref_enabled,
            p.primary_channel AS pref_primary_channel,
            COALESCE(p.recipient_policy, '{}'::jsonb) AS pref_recipient_policy,
            (o.id IS NOT NULL) AS has_override,
            (ts.id IS NOT NULL) AS has_system_template
     FROM notification_event_catalog c
     LEFT JOIN tenant_notification_preferences p
       ON p.tenant_id = $1::uuid AND p.event_key = c.event_key
     LEFT JOIN tenant_notification_template_overrides o
       ON o.tenant_id = $1::uuid
      AND o.event_key = c.event_key
      AND o.locale = $2
      AND o.is_active = true
      AND o.channel = COALESCE(p.primary_channel, c.default_channel)
     LEFT JOIN notification_template_system ts
       ON ts.event_key = c.event_key
      AND ts.locale = $2
      AND ts.channel = COALESCE(p.primary_channel, c.default_channel)
      AND ts.is_active = true
     WHERE c.is_active = true
     ORDER BY c.module, c.event_key`,
    [tenantId, locale],
  );
  return r.rows;
}

export async function upsertTenantNotificationPreference(
  client: Pool | PoolClient,
  params: {
    tenantId: string;
    eventKey: string;
    enabled: boolean;
    /** Se omitido, mantém primary_channel existente no UPDATE. */
    primaryChannel?: string | null;
    /** Se definido, substitui recipient_policy (já mergeado pelo caller). */
    recipientPolicy?: Record<string, unknown> | null;
  },
): Promise<void> {
  const updateChannel = params.primaryChannel !== undefined;
  const updatePolicy = params.recipientPolicy !== undefined && params.recipientPolicy !== null;
  await client.query(
    `INSERT INTO tenant_notification_preferences (tenant_id, event_key, enabled, primary_channel, recipient_policy)
     VALUES ($1::uuid, $2, $3, $4, COALESCE($6::jsonb, '{}'::jsonb))
     ON CONFLICT (tenant_id, event_key)
     DO UPDATE SET
       enabled = EXCLUDED.enabled,
       primary_channel = CASE
         WHEN $5::boolean THEN COALESCE(EXCLUDED.primary_channel, tenant_notification_preferences.primary_channel)
         ELSE tenant_notification_preferences.primary_channel
       END,
       recipient_policy = CASE
         WHEN $7::boolean THEN EXCLUDED.recipient_policy
         ELSE tenant_notification_preferences.recipient_policy
       END,
       updated_at = now()`,
    [
      params.tenantId,
      params.eventKey,
      params.enabled,
      params.primaryChannel ?? null,
      updateChannel,
      updatePolicy ? JSON.stringify(params.recipientPolicy) : null,
      updatePolicy,
    ],
  );
}

export async function upsertTenantNotificationOverride(
  client: Pool | PoolClient,
  params: {
    tenantId: string;
    eventKey: string;
    channel: string;
    locale: string;
    bodyTemplate: string;
    subjectTemplate: string | null;
    systemTemplateId: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO tenant_notification_template_overrides (
       tenant_id, event_key, channel, locale, subject_template, body_template, is_active, system_template_id
     ) VALUES ($1::uuid, $2, $3, $4, $5, $6, true, $7::uuid)
     ON CONFLICT (tenant_id, event_key, channel, locale)
     DO UPDATE SET
       subject_template = EXCLUDED.subject_template,
       body_template = EXCLUDED.body_template,
       system_template_id = EXCLUDED.system_template_id,
       is_active = true,
       updated_at = now()`,
    [
      params.tenantId,
      params.eventKey,
      params.channel,
      params.locale,
      params.subjectTemplate,
      params.bodyTemplate,
      params.systemTemplateId,
    ],
  );
}

export async function deleteTenantNotificationOverride(
  client: Pool | PoolClient,
  params: { tenantId: string; eventKey: string; channel: string; locale: string },
): Promise<number> {
  const r = await client.query(
    `DELETE FROM tenant_notification_template_overrides
     WHERE tenant_id = $1::uuid AND event_key = $2 AND channel = $3 AND locale = $4`,
    [params.tenantId, params.eventKey, params.channel, params.locale],
  );
  return r.rowCount ?? 0;
}

/** Linhas de `notification_template_system` + catálogo — Super Admin (templates padrão globais). */
export type CrmSystemTemplateListRow = {
  id: string;
  event_key: string;
  module: string;
  description: string | null;
  default_channel: string;
  merge_fields: unknown;
  channel: string;
  locale: string;
  subject_template: string | null;
  body_template: string;
  version: number;
  is_active: boolean;
};

export async function listCrmSystemTemplatesJoined(
  client: Pool | PoolClient,
  filters: {
    module?: string | null;
    channel?: string | null;
    locale?: string | null;
    search?: string | null;
  },
): Promise<CrmSystemTemplateListRow[]> {
  const module = filters.module?.trim() || null;
  const channel = filters.channel?.trim() || null;
  const locale = filters.locale?.trim() || null;
  const search = filters.search?.trim() || null;
  const r = await client.query<CrmSystemTemplateListRow>(
    `
    SELECT ts.id, ts.event_key, c.module, c.description, c.default_channel, c.merge_fields,
           ts.channel, ts.locale, ts.subject_template, ts.body_template, ts.version, ts.is_active
    FROM notification_template_system ts
    INNER JOIN notification_event_catalog c ON c.event_key = ts.event_key
    WHERE c.is_active = true AND ts.is_active = true
      AND ($1::text IS NULL OR c.module = $1)
      AND ($2::text IS NULL OR ts.channel = $2)
      AND ($3::text IS NULL OR ts.locale = $3)
      AND (
        $4::text IS NULL
        OR ts.event_key ILIKE '%' || $4 || '%'
        OR COALESCE(c.description, '') ILIKE '%' || $4 || '%'
      )
    ORDER BY c.module, ts.event_key, ts.channel, ts.locale
    `,
    [module, channel, locale, search],
  );
  return r.rows;
}

export async function updateCrmSystemTemplate(
  client: Pool | PoolClient,
  params: {
    eventKey: string;
    channel: string;
    locale: string;
    bodyTemplate: string;
    subjectTemplate: string | null;
  },
): Promise<SystemTemplateRow | null> {
  const r = await client.query<SystemTemplateRow>(
    `
    UPDATE notification_template_system
    SET body_template = $1,
        subject_template = $2,
        version = version + 1,
        updated_at = now()
    WHERE event_key = $3 AND channel = $4 AND locale = $5 AND is_active = true
    RETURNING id, event_key, channel, locale, subject_template, body_template, version, is_active
    `,
    [params.bodyTemplate, params.subjectTemplate, params.eventKey, params.channel, params.locale],
  );
  return r.rows[0] ?? null;
}
