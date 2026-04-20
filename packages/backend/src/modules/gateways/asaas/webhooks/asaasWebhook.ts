/**
 * Handler do webhook Asaas (POST /webhooks/asaas).
 * Fase 3: delega para handleWebhook (webhookCore); mantém asaas_webhook_events para debug.
 */
import type { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { pool } from '../../../../utils/db.js';
import { upsertWebhookEvent } from '../../../../services/paymentWebhookEventsService.js';
import { isAsaasPaymentEvent } from '../asaasEvents.js';
import { handleWebhook, registerGatewayParser } from '../../../payments/webhook/webhookCore.js';
import { asaasWebhookParser } from './asaasWebhookParser.js';

registerGatewayParser('asaas', asaasWebhookParser);

const GATEWAY_KEY = 'asaas';
const MAX_ATTEMPTS = 5;

async function loadConfiguredWebhookAuthTokens(): Promise<string[]> {
  const rows = await pool.query<{ token: string | null }>(
    `SELECT NULLIF(BTRIM(credentials->>'webhook_auth_token'), '') AS token
     FROM payment_gateway_configs
     WHERE gateway_key = $1
       AND is_active = true
       AND credentials ? 'webhook_auth_token'`,
    [GATEWAY_KEY]
  );
  return rows.rows
    .map((row) => row.token ?? null)
    .filter((token): token is string => Boolean(token));
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
    if (configuredTokens.length > 0) {
      const incomingToken = req.header('asaas-access-token')?.trim() ?? '';
      if (!incomingToken || !configuredTokens.includes(incomingToken)) {
        res.status(401).json({ error: 'Webhook não autorizado: token inválido.' });
        return;
      }
    }

    const body = req.body as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({ error: 'Body inválido' });
      return;
    }
    const obj = body as Record<string, unknown>;
    const hash = payloadHash(obj);
    const { eventId, eventType, paymentId, externalReference } = getEventPayload(obj);

    if (!eventId || !eventType) {
      res.status(400).json({ error: 'Payload sem id ou event' });
      return;
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
    res
      .status(500)
      .json({
        error: err instanceof Error ? err.message : 'Erro ao processar webhook',
      });
  }
}
