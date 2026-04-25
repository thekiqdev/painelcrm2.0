import type { Pool, PoolClient } from 'pg';

export type PlatformNotificationEventRow = {
  id: string;
  event_key: string;
  module: string;
  description: string | null;
  default_channel: string;
  merge_fields: unknown;
  is_active: boolean;
};

export type PlatformSystemTemplateRow = {
  id: string;
  event_key: string;
  channel: string;
  locale: string;
  subject_template: string | null;
  body_template: string;
  version: number;
  is_active: boolean;
  send_whatsapp_pix_copy_paste_button: boolean;
};

export type PlatformOverrideRow = {
  subject_template: string | null;
  body_template: string;
  system_template_id: string;
  send_whatsapp_pix_copy_paste_button: boolean;
};

export type PlatformDeliveryRow = {
  id: string;
  target_tenant_id: string;
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
};

export type PlatformOutboundDeliveryDispatchRow = {
  id: string;
  target_tenant_id: string;
  event_key: string;
  channel: string;
  recipient_type: string;
  recipient_address: string;
  rendered_body: string;
  rendered_subject: string | null;
  dispatch_sender_user_id: string | null;
  retry_count: number;
  next_retry_at: Date | null;
  dispatch_not_before: Date | null;
  metadata: Record<string, unknown>;
  entity_type: string;
  entity_id: string | null;
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

export async function getPlatformEventByKey(
  client: Pool | PoolClient,
  eventKey: string,
): Promise<(PlatformNotificationEventRow & { merge_field_list: string[] }) | null> {
  const r = await client.query<PlatformNotificationEventRow>(
    `SELECT id, event_key, module, description, default_channel, merge_fields, is_active
     FROM platform_notification_event_catalog
     WHERE event_key = $1
     LIMIT 1`,
    [eventKey],
  );
  const row = r.rows[0];
  if (!row) return null;
  return { ...row, merge_field_list: parseMergeFields(row.merge_fields) };
}

export async function listPlatformCatalog(
  client: Pool | PoolClient,
): Promise<(PlatformNotificationEventRow & { merge_field_list: string[] })[]> {
  const r = await client.query<PlatformNotificationEventRow>(
    `SELECT id, event_key, module, description, default_channel, merge_fields, is_active
     FROM platform_notification_event_catalog
     ORDER BY module, event_key`,
  );
  return r.rows.map((row) => ({ ...row, merge_field_list: parseMergeFields(row.merge_fields) }));
}

export async function setPlatformCatalogEventActive(
  client: Pool | PoolClient,
  eventKey: string,
  isActive: boolean,
): Promise<boolean> {
  const r = await client.query(`UPDATE platform_notification_event_catalog SET is_active = $2, updated_at = now() WHERE event_key = $1`, [
    eventKey,
    isActive,
  ]);
  return (r.rowCount ?? 0) > 0;
}

export async function getPlatformSystemTemplate(
  client: Pool | PoolClient,
  eventKey: string,
  channel: string,
  locale: string,
): Promise<PlatformSystemTemplateRow | null> {
  const r = await client.query<PlatformSystemTemplateRow>(
    `SELECT id, event_key, channel, locale, subject_template, body_template, version, is_active,
            COALESCE(send_whatsapp_pix_copy_paste_button, false) AS send_whatsapp_pix_copy_paste_button
     FROM platform_notification_template_system
     WHERE event_key = $1 AND channel = $2 AND locale = $3 AND is_active = true
     LIMIT 1`,
    [eventKey, channel, locale],
  );
  return r.rows[0] ?? null;
}

export async function getPlatformOverride(
  client: Pool | PoolClient,
  eventKey: string,
  channel: string,
  locale: string,
): Promise<PlatformOverrideRow | null> {
  const r = await client.query<PlatformOverrideRow>(
    `SELECT subject_template, body_template, system_template_id,
            COALESCE(send_whatsapp_pix_copy_paste_button, false) AS send_whatsapp_pix_copy_paste_button
     FROM platform_notification_template_overrides
     WHERE event_key = $1 AND channel = $2 AND locale = $3 AND is_active = true
     LIMIT 1`,
    [eventKey, channel, locale],
  );
  return r.rows[0] ?? null;
}

/** Regra: se existir override ativo, usa o flag do override; senão o do template sistema. */
export async function resolveEffectivePlatformSendPixCopyPasteButton(
  client: Pool | PoolClient,
  eventKey: string,
  channel: string,
  locale: string,
): Promise<boolean> {
  const sys = await getPlatformSystemTemplate(client, eventKey, channel, locale);
  if (!sys) return false;
  const ov = await getPlatformOverride(client, eventKey, channel, locale);
  if (ov) return Boolean(ov.send_whatsapp_pix_copy_paste_button);
  return Boolean(sys.send_whatsapp_pix_copy_paste_button);
}

export async function upsertPlatformTemplateOverride(
  client: Pool | PoolClient,
  params: {
    eventKey: string;
    channel: string;
    locale: string;
    bodyTemplate: string;
    subjectTemplate: string | null;
    systemTemplateId: string;
    updatedBy: string | null;
    sendWhatsappPixCopyPasteButton: boolean;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO platform_notification_template_overrides (
       event_key, channel, locale, subject_template, body_template, is_active, system_template_id, updated_by,
       send_whatsapp_pix_copy_paste_button
     ) VALUES ($1, $2, $3, $4, $5, true, $6::uuid, $7::uuid, $8)
     ON CONFLICT (event_key, channel, locale)
     DO UPDATE SET
       subject_template = EXCLUDED.subject_template,
       body_template = EXCLUDED.body_template,
       system_template_id = EXCLUDED.system_template_id,
       is_active = true,
       updated_by = EXCLUDED.updated_by,
       send_whatsapp_pix_copy_paste_button = EXCLUDED.send_whatsapp_pix_copy_paste_button,
       updated_at = now()`,
    [
      params.eventKey,
      params.channel,
      params.locale,
      params.subjectTemplate,
      params.bodyTemplate,
      params.systemTemplateId,
      params.updatedBy,
      params.sendWhatsappPixCopyPasteButton,
    ],
  );
}

export async function deletePlatformTemplateOverride(
  client: Pool | PoolClient,
  params: { eventKey: string; channel: string; locale: string },
): Promise<number> {
  const r = await client.query(
    `DELETE FROM platform_notification_template_overrides
     WHERE event_key = $1 AND channel = $2 AND locale = $3`,
    [params.eventKey, params.channel, params.locale],
  );
  return r.rowCount ?? 0;
}

export async function insertPlatformDelivery(
  client: Pool | PoolClient,
  params: {
    targetTenantId: string;
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
): Promise<{ created: boolean; row: PlatformDeliveryRow }> {
  const ins = await client.query<PlatformDeliveryRow>(
    `INSERT INTO platform_notification_deliveries (
       target_tenant_id, event_key, entity_type, entity_id, idempotency_key, channel,
       recipient_type, recipient_address, status, rendered_subject, rendered_body,
       error_message, provider_message_id, actor, metadata, event_occurred_at,
       retry_count, next_retry_at, dispatch_sender_user_id, dispatch_not_before
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16,
       0, NULL, $17, $18
     )
     ON CONFLICT (target_tenant_id, idempotency_key) DO NOTHING
     RETURNING id, target_tenant_id, event_key, entity_type, entity_id, status, rendered_body, rendered_subject,
       error_message, provider_message_id, idempotency_key, created_at, channel,
       recipient_type, recipient_address,
       retry_count, next_retry_at, dispatch_sender_user_id, dispatch_not_before`,
    [
      params.targetTenantId,
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
  const ex = await client.query<PlatformDeliveryRow>(
    `SELECT id, target_tenant_id, event_key, entity_type, entity_id, status, rendered_body, rendered_subject,
            error_message, provider_message_id, idempotency_key, created_at, channel,
            recipient_type, recipient_address,
            retry_count, next_retry_at, dispatch_sender_user_id, dispatch_not_before
     FROM platform_notification_deliveries
     WHERE target_tenant_id = $1 AND idempotency_key = $2
     LIMIT 1`,
    [params.targetTenantId, params.idempotencyKey],
  );
  return { created: false, row: ex.rows[0]! };
}

export async function updatePlatformDeliveryOutcome(
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
    `UPDATE platform_notification_deliveries
     SET status = $2,
         error_message = $3,
         provider_message_id = $4,
         sent_at = $5,
         updated_at = now()
     WHERE id = $1`,
    [deliveryId, params.status, params.errorMessage, params.providerMessageId, params.sentAt],
  );
}

export async function insertPlatformDeliveryAttempt(
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
    `INSERT INTO platform_notification_delivery_attempts (
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

export async function getNextPlatformDeliveryAttemptNumber(client: Pool | PoolClient, deliveryId: string): Promise<number> {
  const r = await client.query<{ m: string }>(
    `SELECT COALESCE(MAX(attempt_number), 0)::text AS m
     FROM platform_notification_delivery_attempts
     WHERE delivery_id = $1`,
    [deliveryId],
  );
  return (parseInt(r.rows[0]?.m ?? '0', 10) || 0) + 1;
}

export async function getPlatformOutboundDeliveryForDispatch(
  client: Pool | PoolClient,
  deliveryId: string,
): Promise<PlatformOutboundDeliveryDispatchRow | null> {
  const r = await client.query<
    PlatformOutboundDeliveryDispatchRow & {
      metadata: unknown;
      entity_type: string;
      entity_id: string | null;
    }
  >(
    `SELECT id, target_tenant_id, event_key, channel, recipient_type, recipient_address,
            rendered_body, rendered_subject, dispatch_sender_user_id, retry_count, next_retry_at,
            dispatch_not_before, metadata, entity_type, entity_id
     FROM platform_notification_deliveries
     WHERE id = $1
     LIMIT 1`,
    [deliveryId],
  );
  const row = r.rows[0];
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  return {
    id: row.id,
    target_tenant_id: row.target_tenant_id,
    event_key: row.event_key,
    channel: row.channel,
    recipient_type: row.recipient_type,
    recipient_address: row.recipient_address,
    rendered_body: row.rendered_body,
    rendered_subject: row.rendered_subject,
    dispatch_sender_user_id: row.dispatch_sender_user_id,
    retry_count: row.retry_count,
    next_retry_at: row.next_retry_at,
    dispatch_not_before: row.dispatch_not_before,
    metadata: meta,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
  };
}

export async function listPlatformDeliveriesDueForRetry(
  client: Pool | PoolClient,
  limit: number,
): Promise<{ id: string }[]> {
  const r = await client.query<{ id: string }>(
    `SELECT id::text AS id
     FROM platform_notification_deliveries
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

export async function schedulePlatformOutboundDeliveryRetry(
  client: Pool | PoolClient,
  params: {
    deliveryId: string;
    errorMessage: string;
    nextRetryAt: Date;
  },
): Promise<void> {
  await client.query(
    `UPDATE platform_notification_deliveries
     SET status = 'queued',
         error_message = $2,
         retry_count = retry_count + 1,
         next_retry_at = $3,
         updated_at = now()
     WHERE id = $1`,
    [params.deliveryId, params.errorMessage, params.nextRetryAt],
  );
}

export async function clearPlatformOutboundDeliveryRetrySchedule(
  client: Pool | PoolClient,
  deliveryId: string,
): Promise<void> {
  await client.query(
    `UPDATE platform_notification_deliveries
     SET next_retry_at = NULL,
         updated_at = now()
     WHERE id = $1`,
    [deliveryId],
  );
}

export async function setPlatformDispatchSenderIfNull(
  client: Pool | PoolClient,
  deliveryId: string,
  senderUserId: string,
): Promise<void> {
  await client.query(
    `UPDATE platform_notification_deliveries
     SET dispatch_sender_user_id = COALESCE(dispatch_sender_user_id, $2::uuid),
         updated_at = now()
     WHERE id = $1`,
    [deliveryId, senderUserId],
  );
}

export async function listRecentPlatformDeliveries(
  client: Pool | PoolClient,
  params: {
    limit: number;
    targetTenantId?: string | null;
    status?: string | null;
    eventKey?: string | null;
    hours: number;
  },
): Promise<PlatformDeliveryRow[]> {
  const lim = Math.min(500, Math.max(1, params.limit));
  const h = Math.min(168 * 4, Math.max(1, params.hours));
  const conds: string[] = [`created_at >= now() - ($1::int || ' hours')::interval`];
  const vals: unknown[] = [h];
  let i = 2;
  if (params.targetTenantId) {
    conds.push(`target_tenant_id = $${i++}`);
    vals.push(params.targetTenantId);
  }
  if (params.status) {
    conds.push(`status = $${i++}`);
    vals.push(params.status);
  }
  if (params.eventKey) {
    conds.push(`event_key = $${i++}`);
    vals.push(params.eventKey);
  }
  vals.push(lim);
  const r = await client.query<PlatformDeliveryRow>(
    `SELECT id, target_tenant_id, event_key, entity_type, entity_id, status, rendered_body, rendered_subject,
            error_message, provider_message_id, idempotency_key, created_at, channel,
            recipient_type, recipient_address,
            retry_count, next_retry_at, dispatch_sender_user_id, sent_at
     FROM platform_notification_deliveries
     WHERE ${conds.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${i}`,
    vals,
  );
  return r.rows;
}
