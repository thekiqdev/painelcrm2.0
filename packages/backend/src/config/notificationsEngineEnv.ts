/**
 * Configuração do Motor Central de Notificações.
 *
 * Toggles operacionais globais (motor ligado, eventos de negócio, envio WhatsApp real)
 * vêm de `superadmin_settings` com cache em memória — ver `notificationsEngineRuntimeFlags`.
 *
 * Variáveis de ambiente homónimas (`NOTIFICATIONS_ENGINE_*`) funcionam apenas como
 * kill switch de emergência: se definidas explicitamente como false/0/no, forçam OFF
 * mesmo que o painel Super Admin esteja em ON.
 */
import { getCachedNotificationsEngineFlags } from '../services/notificationsEngine/notificationsEngineRuntimeFlags.js';

function isEnvTruthy(raw: string | undefined): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Kill switch: apenas quando o env está explicitamente desativado. */
function envExplicitlyOff(raw: string | undefined): boolean {
  if (raw == null || String(raw).trim() === '') return false;
  const v = String(raw).trim().toLowerCase();
  return v === '0' || v === 'false' || v === 'no';
}

/** Liga API e orquestrador do motor (fonte: DB + cache; env só kill switch). */
export function isNotificationsEngineEnabled(): boolean {
  if (envExplicitlyOff(process.env.NOTIFICATIONS_ENGINE_ENABLED)) return false;
  return getCachedNotificationsEngineFlags().enabled;
}

/**
 * Liga publicação automática a partir de módulos de negócio (Fase 3+).
 * Requer também `isNotificationsEngineEnabled()` no call site.
 */
export function isNotificationsEngineBusinessEventsEnabled(): boolean {
  if (envExplicitlyOff(process.env.NOTIFICATIONS_ENGINE_BUSINESS_EVENTS_ENABLED)) return false;
  return getCachedNotificationsEngineFlags().businessEvents;
}

/**
 * Subconjunto opcional de event_keys permitidos para publicação de negócio.
 * Se vazio ou ausente, todos os eventos do catálogo podem ser publicados (sujeitos a preferência por tenant).
 */
export function isBusinessNotificationEventKeyAllowed(eventKey: string): boolean {
  const raw = process.env.NOTIFICATIONS_ENGINE_BUSINESS_EVENTS_KEYS?.trim();
  if (!raw) return true;
  const allowed = new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return allowed.has(eventKey);
}

/**
 * Permite envio real via WhatsApp (UazAPI). Se false, entregas ficam `skipped` após render.
 */
export function isNotificationsEngineWhatsAppSendEnabled(): boolean {
  if (envExplicitlyOff(process.env.NOTIFICATIONS_ENGINE_WHATSAPP_SEND_ENABLED)) return false;
  return getCachedNotificationsEngineFlags().whatsappSend;
}

/** Logs estruturados adicionais do motor (diagnóstico). */
export function isNotificationsEngineVerboseLog(): boolean {
  return isEnvTruthy(process.env.NOTIFICATIONS_ENGINE_VERBOSE_LOG);
}

/**
 * Número máximo de tentativas de envio WhatsApp por entrega (inclui a primeira).
 * Default 4 (= 1 inicial + até 3 reprocessamentos).
 */
export function getNotificationsEngineWhatsAppMaxSendAttempts(): number {
  const raw = process.env.NOTIFICATIONS_ENGINE_WHATSAPP_MAX_SEND_ATTEMPTS;
  const n = raw ? parseInt(String(raw), 10) : 4;
  if (!Number.isFinite(n) || n < 1) return 4;
  return Math.min(12, Math.max(1, n));
}

/** Base de backoff em ms antes do primeiro retry (exponencial por retry_count). */
export function getNotificationsEngineRetryBaseMs(): number {
  const raw = process.env.NOTIFICATIONS_ENGINE_RETRY_BASE_MS;
  const n = raw ? parseInt(String(raw), 10) : 15_000;
  if (!Number.isFinite(n) || n < 1000) return 15_000;
  return Math.min(600_000, Math.max(1000, n));
}

/**
 * Piloto: se definido (CSV de UUIDs de tenant), apenas estes tenants recebem eventos de negócio.
 * Vazio = todos os tenants (sujeito a flag global de business events).
 */
export function isBusinessNotificationPilotTenantAllowed(tenantId: string): boolean {
  const raw = process.env.NOTIFICATIONS_ENGINE_BUSINESS_EVENTS_TENANT_IDS?.trim();
  if (!raw) return true;
  const allowed = new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  return allowed.has(tenantId.toLowerCase());
}

/** Liga worker de digest invoice.due_soon / invoice.overdue (opt-in; default off). */
export function isNotificationsEngineInvoiceDigestEnabled(): boolean {
  return isEnvTruthy(process.env.NOTIFICATIONS_ENGINE_INVOICE_DIGEST_ENABLED);
}

export function getNotificationsEngineInvoiceDigestPollMs(): number {
  const raw = process.env.NOTIFICATIONS_ENGINE_INVOICE_DIGEST_POLL_MS;
  const n = raw ? parseInt(String(raw), 10) : 3_600_000;
  return Math.min(24 * 3_600_000, Math.max(60_000, Number.isFinite(n) ? n : 3_600_000));
}

export function getNotificationsEngineDueSoonLookaheadDays(): number {
  const raw = process.env.NOTIFICATIONS_ENGINE_DUE_SOON_LOOKAHEAD_DAYS;
  const n = raw ? parseInt(String(raw), 10) : 3;
  return Math.min(30, Math.max(1, Number.isFinite(n) ? n : 3));
}

export function getNotificationsEngineOutboundRetryPollMs(): number {
  const raw = process.env.NOTIFICATIONS_ENGINE_OUTBOUND_RETRY_POLL_MS;
  const n = raw ? parseInt(String(raw), 10) : 30_000;
  return Math.min(600_000, Math.max(5000, Number.isFinite(n) ? n : 30_000));
}
