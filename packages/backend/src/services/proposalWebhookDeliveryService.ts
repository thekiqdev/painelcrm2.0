/**
 * Fila outbound de webhooks de propostas: HMAC, retries com backoff, não bloqueia fluxo principal.
 */
import { createHmac } from 'crypto';
import { pool } from '../utils/db.js';
import { loadTenantWebhookSecretForDelivery } from './proposalWebhookSettingsService.js';

const DEFAULT_MAX_ATTEMPTS = 5;
/** Minutos até a próxima tentativa após falha (tentativa 1→2 usa índice 0, etc.) */
const BACKOFF_MINUTES = [1, 5, 15, 60, 360];

export interface ProposalWebhookDeliveryRow {
  id: string;
  tenant_id: string;
  integration_event_id: string;
  status: string;
  attempts: number;
  max_attempts: number;
  last_http_status: number | null;
  last_error: string | null;
  response_snippet: string | null;
  attempt_log: unknown;
  next_retry_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

async function buildSignedPayload(integrationEventId: string): Promise<Record<string, unknown> | null> {
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    proposal_id: string;
    event_key: string;
    payload: Record<string, unknown>;
    created_at: string;
  }>(
    `SELECT id::text, tenant_id::text, proposal_id::text, event_key, payload, created_at::text AS created_at
     FROM proposal_integration_events WHERE id = $1`,
    [integrationEventId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    event_id: row.id,
    event_key: row.event_key,
    tenant_id: row.tenant_id,
    proposal_id: row.proposal_id,
    occurred_at: row.created_at,
    payload: row.payload,
  };
}

function signBody(rawBody: string, secret: string, ts: number): string {
  return createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
}

/** Enfileira entrega se o tenant tem webhook ativo e evento inscrito. Idempotente por integration_event_id. */
export async function enqueueProposalWebhookDelivery(params: {
  tenantId: string;
  integrationEventId: string;
  eventKey: string;
}): Promise<void> {
  try {
    const cfg = await loadTenantWebhookSecretForDelivery(params.tenantId);
    if (!cfg || !cfg.event_keys.includes(params.eventKey)) return;

    await pool.query(
      `INSERT INTO proposal_webhook_deliveries (
         tenant_id, integration_event_id, status, attempts, max_attempts, next_retry_at
       ) VALUES ($1, $2, 'pending', 0, $3, now())
       ON CONFLICT (integration_event_id) DO NOTHING`,
      [params.tenantId, params.integrationEventId, DEFAULT_MAX_ATTEMPTS]
    );
  } catch (e: unknown) {
    const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: string }).code) : '';
    if (code === '42P01') return;
    console.error('[enqueueProposalWebhookDelivery]', e);
  }
}

async function processOneDelivery(row: ProposalWebhookDeliveryRow): Promise<void> {
  const cfg = await loadTenantWebhookSecretForDelivery(row.tenant_id);
  const ev = await pool.query<{ event_key: string }>(
    `SELECT event_key FROM proposal_integration_events WHERE id = $1`,
    [row.integration_event_id]
  );
  const eventKey = ev.rows[0]?.event_key ?? '';

  const attemptLogEntry = {
    at: new Date().toISOString(),
    http: null as number | null,
    error: null as string | null,
    snippet: null as string | null,
  };

  if (!cfg) {
    attemptLogEntry.error = 'Webhook desativado ou secret indisponível';
    await appendDeliveryResult(row.id, {
      success: false,
      httpStatus: null,
      error: attemptLogEntry.error,
      snippet: null,
      attemptLogEntry,
      row,
    });
    return;
  }

  if (!eventKey || !cfg.event_keys.includes(eventKey)) {
    attemptLogEntry.error = 'Evento não inscrito na configuração';
    await appendDeliveryResult(row.id, {
      success: false,
      httpStatus: null,
      error: attemptLogEntry.error,
      snippet: null,
      attemptLogEntry,
      row,
    });
    return;
  }

  const bodyObj = await buildSignedPayload(row.integration_event_id);
  if (!bodyObj) {
    attemptLogEntry.error = 'Evento de integração não encontrado';
    await appendDeliveryResult(row.id, {
      success: false,
      httpStatus: null,
      error: attemptLogEntry.error,
      snippet: null,
      attemptLogEntry,
      row,
    });
    return;
  }

  const rawBody = JSON.stringify(bodyObj);
  const ts = Math.floor(Date.now() / 1000);
  const sig = signBody(rawBody, cfg.secret, ts);

  let httpStatus: number | null = null;
  let errMsg: string | null = null;
  let snippet: string | null = null;

  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 12_000);
    const res = await fetch(cfg.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PainelCRM-Timestamp': String(ts),
        'X-PainelCRM-Signature': `v1=${sig}`,
        'X-PainelCRM-Event': eventKey,
      },
      body: rawBody,
      signal: ac.signal,
    });
    clearTimeout(to);
    httpStatus = res.status;
    const text = await res.text();
    snippet = text.slice(0, 500);
    if (!res.ok) {
      errMsg = `HTTP ${res.status}`;
    }
  } catch (e) {
    errMsg = e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500);
  }

  attemptLogEntry.http = httpStatus;
  attemptLogEntry.error = errMsg;
  attemptLogEntry.snippet = snippet?.slice(0, 400) ?? null;

  const success = !errMsg && httpStatus != null && httpStatus >= 200 && httpStatus < 300;
  await appendDeliveryResult(row.id, {
    success,
    httpStatus,
    error: errMsg,
    snippet,
    attemptLogEntry,
    row,
  });
}

async function appendDeliveryResult(
  deliveryId: string,
  params: {
    success: boolean;
    httpStatus: number | null;
    error: string | null;
    snippet: string | null;
    attemptLogEntry: Record<string, unknown>;
    row: ProposalWebhookDeliveryRow;
  }
): Promise<void> {
  const newAttempts = params.row.attempts + 1;
  const logJson = JSON.stringify(params.attemptLogEntry);

  if (params.success) {
    await pool.query(
      `UPDATE proposal_webhook_deliveries SET
        status = 'success',
        attempts = $2,
        last_http_status = $3,
        last_error = NULL,
        response_snippet = $4,
        attempt_log = COALESCE(attempt_log, '[]'::jsonb) || jsonb_build_array($5::jsonb),
        delivered_at = now(),
        next_retry_at = NULL,
        updated_at = now()
      WHERE id = $1`,
      [deliveryId, newAttempts, params.httpStatus, params.snippet, logJson]
    );
    return;
  }

  const canRetry = newAttempts < params.row.max_attempts;
  const backoffIdx = Math.min(Math.max(newAttempts - 1, 0), BACKOFF_MINUTES.length - 1);
  const backoffMin = BACKOFF_MINUTES[backoffIdx] ?? 360;
  const nextRetry = canRetry ? new Date(Date.now() + backoffMin * 60_000) : null;

  await pool.query(
    `UPDATE proposal_webhook_deliveries SET
      status = $2,
      attempts = $3,
      last_http_status = $4,
      last_error = $5,
      response_snippet = $6,
      attempt_log = COALESCE(attempt_log, '[]'::jsonb) || jsonb_build_array($7::jsonb),
      next_retry_at = $8,
      updated_at = now()
    WHERE id = $1`,
    [
      deliveryId,
      canRetry ? 'pending' : 'failed',
      newAttempts,
      params.httpStatus,
      params.error,
      params.snippet,
      logJson,
      canRetry ? nextRetry?.toISOString() ?? null : null,
    ]
  );
}

/** Processa até `limit` entregas pendentes (cron / intervalo). */
export async function processProposalWebhookDeliveriesBatch(limit = 15): Promise<number> {
  const r = await pool.query<ProposalWebhookDeliveryRow>(
    `SELECT id, tenant_id::text AS tenant_id, integration_event_id::text AS integration_event_id,
            status, attempts, max_attempts, last_http_status, last_error, response_snippet,
            attempt_log, next_retry_at::text AS next_retry_at, delivered_at::text AS delivered_at,
            created_at::text AS created_at, updated_at::text AS updated_at
     FROM proposal_webhook_deliveries
     WHERE status = 'pending'
       AND attempts < max_attempts
       AND (next_retry_at IS NULL OR next_retry_at <= now())
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit]
  );

  let done = 0;
  for (const row of r.rows) {
    try {
      await processOneDelivery(row);
      done++;
    } catch (e) {
      console.error('[processProposalWebhookDeliveriesBatch] delivery', row.id, e);
    }
  }
  return done;
}

export async function listWebhookDeliveriesForProposal(
  proposalId: string,
  tenantId: string,
  limit = 50
): Promise<
  Array<
    ProposalWebhookDeliveryRow & {
      event_key: string;
      event_created_at: string;
    }
  >
> {
  const r = await pool.query<
    ProposalWebhookDeliveryRow & { event_key: string; event_created_at: string }
  >(
    `SELECT d.id, d.tenant_id::text AS tenant_id, d.integration_event_id::text AS integration_event_id,
            d.status, d.attempts, d.max_attempts, d.last_http_status, d.last_error, d.response_snippet,
            d.attempt_log, d.next_retry_at::text AS next_retry_at, d.delivered_at::text AS delivered_at,
            d.created_at::text AS created_at, d.updated_at::text AS updated_at,
            e.event_key, e.created_at::text AS event_created_at
     FROM proposal_webhook_deliveries d
     INNER JOIN proposal_integration_events e ON e.id = d.integration_event_id
     INNER JOIN proposals p ON p.id = e.proposal_id
     INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $2
     WHERE e.proposal_id = $1 AND d.tenant_id = $2
     ORDER BY d.created_at DESC
     LIMIT $3`,
    [proposalId, tenantId, Math.min(Math.max(limit, 1), 100)]
  );
  return r.rows;
}

/** Reenfileira entrega (manual). */
export async function retryWebhookDeliveryById(
  deliveryId: string,
  tenantId: string
): Promise<{ ok: boolean; error?: string }> {
  const u = await pool.query(
    `UPDATE proposal_webhook_deliveries d
     SET status = 'pending', next_retry_at = now(), attempts = 0, last_error = NULL, updated_at = now()
     FROM proposal_integration_events e
     WHERE d.id = $1 AND d.tenant_id = $2 AND e.id = d.integration_event_id
     RETURNING d.id`,
    [deliveryId, tenantId]
  );
  if ((u.rowCount ?? 0) === 0) {
    return { ok: false, error: 'Entrega não encontrada' };
  }
  return { ok: true };
}
