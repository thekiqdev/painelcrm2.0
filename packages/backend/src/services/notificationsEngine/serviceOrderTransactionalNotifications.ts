/**
 * OS — Notificações transacionais de Ordem de Serviço (shared / sent / signed).
 */
import type { Pool } from 'pg';
import {
  isBusinessNotificationEventKeyAllowed,
  isBusinessNotificationPilotTenantAllowed,
  isNotificationsEngineBusinessEventsEnabled,
  isNotificationsEngineEnabled,
} from '../../config/notificationsEngineEnv.js';
import { neLogWarn as neLogWarnEngine } from './notificationEngineLog.js';
import { runTransactionalNotification } from './notificationEngineOrchestrator.js';
import { scheduleBillingNotificationSideEffect } from './billingNotificationFlush.js';
import { resolveWhatsAppSenderUserIdForTenant } from './whatsappSenderResolve.js';
import { resolveWhatsAppRoutingForEventKey } from './whatsappInstanceRoutingService.js';
import { formatBrazilPhoneDigitsForDisplay } from '../../utils/brPhoneDisplay.js';
import { sendTransactionalEmail } from '../email/emailDeliveryService.js';
import { getEventByKey, getSystemTemplate } from './notificationEngineRepository.js';
import { renderStrictTemplates } from './strictMergeRenderer.js';
import { decryptServiceOrderTokenFromStorage } from '../serviceOrderTokenCrypto.js';

function resolveFrontendBaseUrl(): string {
  const raw = (process.env.FRONTEND_URL || process.env.PUBLIC_APP_URL || '').split(',')[0]?.trim() ?? '';
  return raw.replace(/\/$/, '');
}

function normalizeWhatsappPhone(raw: string | null | undefined): string | null {
  if (!raw || !String(raw).trim()) return null;
  const d = String(raw).replace(/\D/g, '');
  if (d.length < 10) return null;
  return d;
}

function enqueue(label: string, fn: () => Promise<void>): void {
  scheduleBillingNotificationSideEffect(label, fn);
}

async function gateAndPublish(
  pool: Pool,
  input: {
    eventKey: string;
    tenantId: string;
    preferredSenderUserId: string | null | undefined;
    entityId: string;
    idempotencyKey: string;
    recipientPhone: string | null;
    mergeContext: Record<string, string>;
  },
): Promise<void> {
  if (!isNotificationsEngineEnabled()) return;
  if (!isNotificationsEngineBusinessEventsEnabled()) return;
  if (!isBusinessNotificationPilotTenantAllowed(input.tenantId)) {
    neLogWarnEngine('business_pilot_skip', { tenant_id: input.tenantId, event_key: input.eventKey });
    return;
  }
  if (!isBusinessNotificationEventKeyAllowed(input.eventKey)) {
    neLogWarnEngine('business_event_key_allowlist_skip', {
      tenant_id: input.tenantId,
      event_key: input.eventKey,
    });
    return;
  }

  const phone = normalizeWhatsappPhone(input.recipientPhone);
  if (!phone) return;

  let senderUserId: string | null = null;
  let chatInstanceId: string | null = null;
  const routed = await resolveWhatsAppRoutingForEventKey(pool, input.tenantId, input.eventKey);
  if (routed) {
    senderUserId = routed.sender_user_id;
    chatInstanceId = routed.chat_instance_id;
  }
  if (!senderUserId) {
    senderUserId = await resolveWhatsAppSenderUserIdForTenant(
      pool,
      input.tenantId,
      input.preferredSenderUserId,
    );
  }
  if (!senderUserId) {
    console.warn(`[notifications-engine/os] skip ${input.eventKey}: sem sender WhatsApp`);
    return;
  }

  await runTransactionalNotification({
    pool,
    tenantId: input.tenantId,
    senderUserId,
    eventKey: input.eventKey,
    entityType: 'service_order',
    entityId: input.entityId,
    idempotencyKey: input.idempotencyKey,
    recipientPhone: phone,
    recipientType: 'client',
    mergeContext: input.mergeContext,
    eventOccurredAt: new Date(),
    actor: { user_id: input.preferredSenderUserId ?? null },
    metadata: {
      module: 'service_orders',
      ...(chatInstanceId ? { whatsapp_routed_chat_instance_id: chatInstanceId } : {}),
    },
    chatInstanceId,
  });
}

/** Envio da OS ao cliente (link de visualização) — e-mail + WhatsApp. */
export function publishServiceOrderSharedNotifications(params: {
  pool: Pool;
  tenantId: string;
  serviceOrderId: string;
  actorUserId: string;
  viewPath: string;
}): void {
  enqueue('service_order.shared', async () => {
    const base = resolveFrontendBaseUrl();
    const viewUrl = base ? `${base}${params.viewPath}` : params.viewPath;

    const head = await params.pool.query<{
      service_order_number: number;
      tenant_name: string;
      client_name: string | null;
      client_phone: string | null;
      client_email: string | null;
    }>(
      `SELECT so.service_order_number, t.name AS tenant_name,
              COALESCE(NULLIF(trim(so.client_snapshot->>'name'), ''), cl.name) AS client_name,
              COALESCE(NULLIF(trim(so.client_snapshot->>'phone'), ''), cl.phone) AS client_phone,
              COALESCE(NULLIF(trim(so.client_snapshot->>'email'), ''), cl.email) AS client_email
       FROM public.service_orders so
       INNER JOIN public.tenants t ON t.id = so.tenant_id
       LEFT JOIN public.clients cl ON cl.id = so.client_id
       WHERE so.id = $1 AND so.tenant_id = $2
       LIMIT 1`,
      [params.serviceOrderId, params.tenantId],
    );
    const row = head.rows[0];
    if (!row) return;

    const mergeCtx: Record<string, string> = {
      'tenant.name': row.tenant_name,
      'client.name': row.client_name?.trim() || 'Cliente',
      'service_order.number': String(row.service_order_number),
      'service_order.public_view_link': viewUrl,
    };

    const event = await getEventByKey(params.pool, 'service_order.shared');
    const emailTpl =
      event?.is_active
        ? await getSystemTemplate(params.pool, 'service_order.shared', 'email', 'pt-BR')
        : null;

    const email = row.client_email?.trim();
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && emailTpl) {
      const rendered = renderStrictTemplates({
        subjectTemplate: emailTpl.subject_template ?? 'Ordem de serviço',
        bodyTemplate: emailTpl.body_template,
        context: mergeCtx,
        allowedMergeFields: event?.merge_field_list ?? [],
      });
      if (rendered.ok && rendered.body.trim()) {
        await sendTransactionalEmail({
          to: email,
          subject: rendered.subject?.trim() || `OS Nº ${row.service_order_number}`,
          html: rendered.body,
          eventKey: 'service_order.shared',
          tenantId: params.tenantId,
        });
      }
    }

    if (row.client_phone) {
      await gateAndPublish(params.pool, {
        eventKey: 'service_order.shared',
        tenantId: params.tenantId,
        preferredSenderUserId: params.actorUserId,
        entityId: params.serviceOrderId,
        idempotencyKey: `service_order.shared:${params.serviceOrderId}:${Date.now()}`,
        recipientPhone: row.client_phone,
        mergeContext: mergeCtx,
      });
    }
  });
}

export function publishServiceOrderSentNotifications(params: {
  pool: Pool;
  tenantId: string;
  serviceOrderId: string;
  actorUserId: string;
  viewPath: string;
  invites: Array<{ signer_id: string; token: string; frontend_path: string }>;
}): void {
  enqueue('service_order.sent', async () => {
    const base = resolveFrontendBaseUrl();
    const viewUrl = base ? `${base}${params.viewPath}` : params.viewPath;

    const head = await params.pool.query<{
      service_order_number: number;
      tenant_name: string;
      client_name: string | null;
      client_phone: string | null;
    }>(
      `SELECT so.service_order_number, t.name AS tenant_name,
              COALESCE(NULLIF(trim(so.client_snapshot->>'name'), ''), cl.name) AS client_name,
              COALESCE(NULLIF(trim(so.client_snapshot->>'phone'), ''), cl.phone) AS client_phone
       FROM public.service_orders so
       INNER JOIN public.tenants t ON t.id = so.tenant_id
       LEFT JOIN public.clients cl ON cl.id = so.client_id
       WHERE so.id = $1 AND so.tenant_id = $2
       LIMIT 1`,
      [params.serviceOrderId, params.tenantId],
    );
    const row = head.rows[0];
    if (!row) return;

    const signersRes = await params.pool.query<{
      id: string;
      name: string;
      email: string | null;
      whatsapp_phone: string | null;
    }>(
      `SELECT id::text AS id, name, email, whatsapp_phone
       FROM public.service_order_signers
       WHERE service_order_id = $1
       ORDER BY signing_order, created_at`,
      [params.serviceOrderId],
    );
    const byId = new Map(signersRes.rows.map((s) => [s.id, s]));

    const event = await getEventByKey(params.pool, 'service_order.sent');
    const emailTpl =
      event?.is_active
        ? await getSystemTemplate(params.pool, 'service_order.sent', 'email', 'pt-BR')
        : null;

    let anyWa = false;

    for (const item of params.invites) {
      const signer = byId.get(item.signer_id);
      if (!signer) continue;
      const signUrl = base ? `${base}${item.frontend_path}` : item.frontend_path;
      const waDigits = String(signer.whatsapp_phone ?? '').replace(/\D/g, '');
      const mergeCtx: Record<string, string> = {
        'tenant.name': row.tenant_name,
        'client.name': row.client_name?.trim() || 'Cliente',
        'service_order.number': String(row.service_order_number),
        'service_order.sign_link': signUrl,
        'service_order.public_view_link': viewUrl,
        'signer.name': signer.name?.trim() || 'Assinante',
        'signer.email': signer.email?.trim() || '',
        'signer.whatsapp': waDigits ? formatBrazilPhoneDigitsForDisplay(waDigits) : '',
      };

      const email = signer.email?.trim();
      if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && emailTpl) {
        const rendered = renderStrictTemplates({
          subjectTemplate: emailTpl.subject_template ?? 'Convite para assinar ordem de serviço',
          bodyTemplate: emailTpl.body_template,
          context: mergeCtx,
          allowedMergeFields: event?.merge_field_list ?? [],
        });
        if (rendered.ok && rendered.body.trim()) {
          await sendTransactionalEmail({
            to: email,
            subject: rendered.subject?.trim() || `Assinar OS Nº ${row.service_order_number}`,
            html: rendered.body,
            eventKey: 'service_order.sent',
            tenantId: params.tenantId,
          });
        }
      }

      if (waDigits) {
        anyWa = true;
        await gateAndPublish(params.pool, {
          eventKey: 'service_order.sent',
          tenantId: params.tenantId,
          preferredSenderUserId: params.actorUserId,
          entityId: params.serviceOrderId,
          idempotencyKey: `service_order.sent:${params.serviceOrderId}:${item.signer_id}`,
          recipientPhone: waDigits,
          mergeContext: mergeCtx,
        });
      }
    }

    if (!anyWa && row.client_phone && params.invites[0]) {
      const first = params.invites[0];
      const signUrl = base ? `${base}${first.frontend_path}` : first.frontend_path;
      await gateAndPublish(params.pool, {
        eventKey: 'service_order.sent',
        tenantId: params.tenantId,
        preferredSenderUserId: params.actorUserId,
        entityId: params.serviceOrderId,
        idempotencyKey: `service_order.sent:${params.serviceOrderId}`,
        recipientPhone: row.client_phone,
        mergeContext: {
          'tenant.name': row.tenant_name,
          'client.name': row.client_name?.trim() || 'Cliente',
          'service_order.number': String(row.service_order_number),
          'service_order.sign_link': signUrl,
          'service_order.public_view_link': viewUrl,
          'signer.name': row.client_name?.trim() || 'Cliente',
          'signer.email': '',
          'signer.whatsapp': '',
        },
      });
    }
  });
}

export function publishServiceOrderSignedNotification(params: {
  pool: Pool;
  tenantId: string;
  serviceOrderId: string;
  actorUserId: string | null;
}): void {
  enqueue('service_order.signed', async () => {
    const base = resolveFrontendBaseUrl();
    const head = await params.pool.query<{
      service_order_number: number;
      tenant_name: string;
      client_name: string | null;
      client_phone: string | null;
      token_ciphertext: string | null;
    }>(
      `SELECT so.service_order_number, t.name AS tenant_name,
              COALESCE(NULLIF(trim(so.client_snapshot->>'name'), ''), cl.name) AS client_name,
              COALESCE(NULLIF(trim(so.client_snapshot->>'phone'), ''), cl.phone) AS client_phone,
              tok.token_ciphertext
       FROM public.service_orders so
       INNER JOIN public.tenants t ON t.id = so.tenant_id
       LEFT JOIN public.clients cl ON cl.id = so.client_id
       LEFT JOIN public.service_order_public_view_tokens tok
         ON tok.service_order_id = so.id AND tok.revoked_at IS NULL
       WHERE so.id = $1 AND so.tenant_id = $2
       LIMIT 1`,
      [params.serviceOrderId, params.tenantId],
    );
    const row = head.rows[0];
    if (!row) return;

    const raw = decryptServiceOrderTokenFromStorage(row.token_ciphertext);
    const viewPath = raw ? `/service-order-view/${raw}` : '';
    const viewUrl = viewPath && base ? `${base}${viewPath}` : viewPath;

    await gateAndPublish(params.pool, {
      eventKey: 'service_order.signed',
      tenantId: params.tenantId,
      preferredSenderUserId: params.actorUserId,
      entityId: params.serviceOrderId,
      idempotencyKey: `service_order.signed:${params.serviceOrderId}`,
      recipientPhone: row.client_phone,
      mergeContext: {
        'tenant.name': row.tenant_name,
        'client.name': row.client_name?.trim() || 'Cliente',
        'service_order.number': String(row.service_order_number),
        'service_order.public_view_link': viewUrl,
      },
    });
  });
}
