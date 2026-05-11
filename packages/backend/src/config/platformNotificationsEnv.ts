/**
 * Motor de Notificações da PLATAFORMA — env + cache DB (via platformNotificationsRuntimeFlags).
 *
 * Kill switches de emergência: se env definido explicitamente como false/0/no, força OFF
 * mesmo com Super Admin em ON (espelha o padrão do motor do tenant).
 */
import { getCachedPlatformNotificationsFlags } from '../services/platformNotifications/platformNotificationsRuntimeFlags.js';
import {
  getNotificationsEngineRetryBaseMs,
  getNotificationsEngineWhatsAppMaxSendAttempts,
} from './notificationsEngineEnv.js';

function envExplicitlyOff(raw: string | undefined): boolean {
  if (raw == null || String(raw).trim() === '') return false;
  const v = String(raw).trim().toLowerCase();
  return v === '0' || v === 'false' || v === 'no';
}

function isEnvTruthy(raw: string | undefined): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** API e orquestrador da plataforma (fonte: DB + cache; env só kill switch). */
export function isPlatformNotificationsEnabled(): boolean {
  if (envExplicitlyOff(process.env.PLATFORM_NOTIFICATIONS_ENABLED)) return false;
  return getCachedPlatformNotificationsFlags().enabled;
}

/** Eventos reais de negócio (Fase 3). Kill switch: PLATFORM_NOTIFICATIONS_BUSINESS_EVENTS_ENABLED=false */
export function isPlatformNotificationsBusinessEventsEnabled(): boolean {
  if (envExplicitlyOff(process.env.PLATFORM_NOTIFICATIONS_BUSINESS_EVENTS_ENABLED)) return false;
  return getCachedPlatformNotificationsFlags().businessEvents;
}

/** Envio WhatsApp real (sub-flag). */
export function isPlatformNotificationsWhatsAppSendEnabled(): boolean {
  if (envExplicitlyOff(process.env.PLATFORM_NOTIFICATIONS_WHATSAPP_SEND_ENABLED)) return false;
  return getCachedPlatformNotificationsFlags().whatsappSend;
}

/** Envio de e-mail transacional (SMTP Super Admin). Kill switch: PLATFORM_NOTIFICATIONS_EMAIL_SEND_ENABLED=false */
export function isPlatformNotificationsEmailSendEnabled(): boolean {
  if (envExplicitlyOff(process.env.PLATFORM_NOTIFICATIONS_EMAIL_SEND_ENABLED)) return false;
  return true;
}

/**
 * Log verboso: env PLATFORM_NOTIFICATIONS_VERBOSE_LOG=true OU flag em superadmin_settings
 * (cache já incorpora DB; env tem precedência para diagnóstico rápido).
 */
export function isPlatformNotificationsVerboseLog(): boolean {
  if (isEnvTruthy(process.env.PLATFORM_NOTIFICATIONS_VERBOSE_LOG)) return true;
  return getCachedPlatformNotificationsFlags().verboseLog;
}

/**
 * @deprecated O motor da plataforma usa `platform_notifications_whatsapp_chat_instance_id` (Super Admin).
 * Mantido só por compatibilidade documental; não é mais lido pelo orquestrador.
 */
export function getPlatformNotificationsDispatchTenantIdFromEnv(): string | null {
  const v = process.env.PLATFORM_NOTIFICATIONS_DISPATCH_TENANT_ID?.trim();
  return v || null;
}

/** @deprecated Ver `getPlatformNotificationsDispatchTenantIdFromEnv`. */
export function getPlatformNotificationsDispatchSenderUserIdFromEnv(): string | null {
  const v = process.env.PLATFORM_NOTIFICATIONS_DISPATCH_SENDER_USER_ID?.trim();
  return v || null;
}

/**
 * Retry/backoff: reutiliza os mesmos limites do motor do tenant por ora (env NOTIFICATIONS_ENGINE_*),
 * ou override PLATFORM_NOTIFICATIONS_WHATSAPP_MAX_SEND_ATTEMPTS / PLATFORM_NOTIFICATIONS_RETRY_BASE_MS.
 */
export function getPlatformNotificationsWhatsAppMaxSendAttempts(): number {
  const raw = process.env.PLATFORM_NOTIFICATIONS_WHATSAPP_MAX_SEND_ATTEMPTS;
  if (raw != null && String(raw).trim() !== '') {
    const n = parseInt(String(raw), 10);
    if (Number.isFinite(n) && n >= 1) return Math.min(12, n);
  }
  return getNotificationsEngineWhatsAppMaxSendAttempts();
}

export function getPlatformNotificationsRetryBaseMs(): number {
  const raw = process.env.PLATFORM_NOTIFICATIONS_RETRY_BASE_MS;
  if (raw != null && String(raw).trim() !== '') {
    const n = parseInt(String(raw), 10);
    if (Number.isFinite(n) && n >= 1000) return Math.min(600_000, n);
  }
  return getNotificationsEngineRetryBaseMs();
}

export function getPlatformNotificationsOutboundRetryPollMs(): number {
  const raw = process.env.PLATFORM_NOTIFICATIONS_OUTBOUND_RETRY_POLL_MS;
  const n = raw ? parseInt(String(raw), 10) : 30_000;
  return Math.min(600_000, Math.max(5000, Number.isFinite(n) ? n : 30_000));
}
