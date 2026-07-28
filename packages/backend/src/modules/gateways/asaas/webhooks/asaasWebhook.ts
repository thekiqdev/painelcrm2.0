/**
 * Handler do webhook Asaas (POST /webhooks/asaas).
 * Fase 3: delega para handleWebhook (webhookCore); mantém asaas_webhook_events para debug.
 */
import type { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { pool } from '../../../../utils/db.js';
import { upsertWebhookEvent } from '../../../../services/paymentWebhookEventsService.js';
import { isAsaasPaymentEvent, isAsaasPixAutomaticEvent } from '../asaasEvents.js';
import { handleWebhook, registerGatewayParser } from '../../../payments/webhook/webhookCore.js';
import { asaasWebhookParser } from './asaasWebhookParser.js';
import { handlePixAutomaticWebhookEvent } from '../../../../services/billing2/billingPixAutomaticService.js';


registerGatewayParser('asaas', asaasWebhookParser);

const GATEWAY_KEY = 'asaas';
const MAX_ATTEMPTS = 5;

async function loadConfiguredWebhookAuthTokens(): Promise<string[]> {
  const rows = await pool.query<{ token: string | null }>(
    `SELECT COALESCE(
              NULLIF(BTRIM(webhook_auth_token), ''),
              NULLIF(BTRIM(credentials->>'webhook_auth_token'), '')
            ) AS token
     FROM payment_gateway_configs
     WHERE gateway_key = $1
       AND is_active = true
       AND (
         NULLIF(BTRIM(webhook_auth_token), '') IS NOT NULL
         OR credentials ? 'webhook_auth_token'
       )`,
    [GATEWAY_KEY]
  );
  return rows.rows
    .map((row) => row.token ?? null)
    .filter((token): token is string => Boolean(token));
}

async function updateWebhookErrorByTokenOrReference(params: {
  incomingToken?: string | null;
  externalReference?: string | null;
  error: string | null;
}): Promise<void> {
  const token = (params.incomingToken || '').trim();
  const externalReference = (params.externalReference || '').trim();
  if (token) {
    await pool.query(
      `UPDATE payment_gateway_configs
       SET last_webhook_error = $2,
           updated_at = now()
       WHERE gateway_key = $1
         AND is_active = true
         AND (
           NULLIF(BTRIM(webhook_auth_token), '') = $3
           OR NULLIF(BTRIM(credentials->>'webhook_auth_token'), '') = $3
         )`,
      [GATEWAY_KEY, params.error, token]
    );
    return;
  }
  if (externalReference) {
    await pool.query(
      `UPDATE payment_gateway_configs
       SET last_webhook_error = $2,
           updated_at = now()
       WHERE gateway_key = $1
         AND scope = 'tenant'
         AND tenant_id::text = $3`,
      [GATEWAY_KEY, params.error, externalReference]
    );
  }
}

function payloadHash(body: object): string {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

/** Extrai externalReference do payload (payment ou customer) para resolver tenant no webhook. */
function getExternalReferenceFromPayload(body: Record<string, unknown>): string | null {
  const payment = body.payment as Record<string, unknown> | undefined;
  if (payment && typeof payment.externalReference === 'string') return payment.externalReference;
  const customer = body.customer as Record<string, unknown> | undefined;
  if (customer && typeof customer.externalReference === 'string') return customer.externalReference;
  return null;
}

function getEventPayload(body: Record<string, unknown>): {
  eventId: string;
  eventType: string;
  paymentId: string | null;
  externalReference: string | null;
} {
  const eventId = typeof body.id === 'string' ? body.id : '';
  const eventType = typeof body.event === 'string' ? body.event : '';
  const payment = body.payment as Record<string, unknown> | undefined;
  const paymentId =
    payment && typeof payment.id === 'string' ? payment.id : null;
  const externalReference = getExternalReferenceFromPayload(body);
  return { eventId, eventType, paymentId, externalReference };
}

function buildPayloadSummary(body: Record<string, unknown>, eventType: string, paymentId: string | null): Record<string, unknown> {
  const payment = body.payment as Record<string, unknown> | undefined;
  return {
    event: eventType,
    payment: paymentId ? { id: paymentId, status: payment?.status } : undefined,
  };
}

export async function asaasWebhookHandler(
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  try {
    const configuredTokens = await loadConfiguredWebhookAuthTokens();
    const incomingToken = req.header('asaas-access-token')?.trim() ?? '';
    if (configuredTokens.length > 0) {
      if (!incomingToken || !configuredTokens.includes(incomingToken)) {
        await updateWebhookErrorByTokenOrReference({
          incomingToken,
          externalReference: null,
          error: 'Token de webhook inválido',
        });
        res.status(401).json({ error: 'Webhook não autorizado: token inválido.' });
        return;
      }
    }

    const body = req.body as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      await updateWebhookErrorByTokenOrReference({
        incomingToken,
        externalReference: null,
        error: 'Payload inválido',
      });
      res.status(400).json({ error: 'Body inválido' });
      return;
    }
    const obj = body as Record<string, unknown>;
    const hash = payloadHash(obj);
    const { eventId, eventType, paymentId, externalReference } = getEventPayload(obj);

    if (!eventId || !eventType) {
      await updateWebhookErrorByTokenOrReference({
        incomingToken,
        externalReference,
        error: 'Payload sem id/event',
      });
      res.status(400).json({ error: 'Payload sem id ou event' });
      return;
    }

    if (incomingToken) {
      await pool.query(
        `UPDATE payment_gateway_configs
         SET last_webhook_received_at = now(),
             last_webhook_error = NULL,
             webhook_status = CASE
               WHEN webhook_status IS NULL THEN 'created'
               ELSE webhook_status
             END,
             updated_at = now()
         WHERE gateway_key = $1
           AND is_active = true
           AND (
             NULLIF(BTRIM(webhook_auth_token), '') = $2
             OR NULLIF(BTRIM(credentials->>'webhook_auth_token'), '') = $2
           )`,
        [GATEWAY_KEY, incomingToken]
      );
    }

    console.log('[ASAAS WEBHOOK RECEIVED]', {
      timestamp: new Date().toISOString(),
      eventType,
      paymentId,
      eventId,
      externalReference,
      payload: JSON.stringify(obj),
    });

    const hashRow = await pool.query<{ id: string }>(
      'SELECT id FROM asaas_webhook_events WHERE payload_hash = $1 LIMIT 1',
      [hash]
    );
    if (hashRow.rows.length > 0) {
      res.status(200).json({ received: true });
      return;
    }

    const existing = await pool.query<{ status: string; attempts: number }>(
      'SELECT status, attempts FROM asaas_webhook_events WHERE event_id = $1',
      [eventId]
    );
    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      if (row.status === 'processed') {
        res.status(200).json({ received: true });
        return;
      }
      if (row.attempts >= MAX_ATTEMPTS) {
        res.status(200).json({ received: true });
        return;
      }
    }

    await pool.query(
      `INSERT INTO asaas_webhook_events (event_id, event_type, payment_id, payload_hash, status, attempts)
       VALUES ($1, $2, $3, $4, 'pending', 1)
       ON CONFLICT (event_id) DO UPDATE SET
         event_type = EXCLUDED.event_type,
         payment_id = EXCLUDED.payment_id,
         payload_hash = EXCLUDED.payload_hash,
         attempts = asaas_webhook_events.attempts + 1,
         last_error = NULL`,
      [eventId, eventType, paymentId, hash]
    );

    const payloadSummary = buildPayloadSummary(obj, eventType, paymentId);
    await upsertWebhookEvent({
      gatewayKey: GATEWAY_KEY,
      eventId,
      payloadSummary,
      status: 'pending',
      externalReference,
    });

    // Sprint 10 — Pix Automático (antes do early-return de eventos sem payment_id).
    if (isAsaasPixAutomaticEvent(eventType)) {
      try {
        await handlePixAutomaticWebhookEvent({
          eventId,
          eventType,
          payload: obj,
        });
      } catch (e: unknown) {
        console.error('[asaasWebhook] pix automatic handler', e);
      }
      await pool.query(
        `UPDATE asaas_webhook_events SET status = 'processed', processed_at = now() WHERE event_id = $1`,
        [eventId]
      );
      await upsertWebhookEvent({
        gatewayKey: GATEWAY_KEY,
        eventId,
        payloadSummary: { ...payloadSummary, pix_automatic: true },
        status: 'processed',
        externalReference,
      });
      res.status(200).json({ received: true });
      return;
    }

    if (!paymentId || !isAsaasPaymentEvent(eventType)) {
      await pool.query(
        `UPDATE asaas_webhook_events SET status = 'processed', processed_at = now() WHERE event_id = $1`,
        [eventId]
      );
      await upsertWebhookEvent({
        gatewayKey: GATEWAY_KEY,
        eventId,
        payloadSummary,
        status: 'processed',
        externalReference,
      });
      res.status(200).json({ received: true });
      return;
    }

    const result = await handleWebhook(GATEWAY_KEY, body);
    if (result.status === 200) {
      await pool.query(
        `UPDATE asaas_webhook_events SET status = 'processed', processed_at = now() WHERE event_id = $1`,
        [eventId]
      );
      await upsertWebhookEvent({
        gatewayKey: GATEWAY_KEY,
        eventId,
        payloadSummary,
        status: 'processed',
        externalReference,
      });
    } else {
      const message = result.body?.error ?? 'Erro ao processar webhook';
      await updateWebhookErrorByTokenOrReference({
        incomingToken,
        externalReference,
        error: message,
      });
      await pool.query(
        `UPDATE asaas_webhook_events SET status = 'failed', last_error = $2 WHERE event_id = $1`,
        [eventId, message]
      );
      await upsertWebhookEvent({
        gatewayKey: GATEWAY_KEY,
        eventId,
        payloadSummary,
        status: 'failed',
        externalReference,
      });
      console.error('asaasWebhook handleWebhook:', message);
    }
    res.status(200).json({ received: true });
    return;

    res.status(200).json({ received: true });
  } catch (err: unknown) {
    console.error('asaasWebhook error:', err);
    await updateWebhookErrorByTokenOrReference({
      incomingToken: req.header('asaas-access-token')?.trim() ?? '',
      externalReference: null,
      error: err instanceof Error ? err.message : 'Erro ao processar webhook',
    });
    res
      .status(500)
      .json({
        error: err instanceof Error ? err.message : 'Erro ao processar webhook',
      });
  }
}
