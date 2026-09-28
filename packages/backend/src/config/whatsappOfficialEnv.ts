/**
 * WhatsApp Cloud API (Meta) — versão Graph e feature flags.
 * WHATSAPP_OFFICIAL_GRAPH_VERSION ex.: v21.0 (sem barra inicial no valor).
 */
import { getSystemFlag } from '../services/systemFeatureFlagsService.js';

export function getWhatsappOfficialGraphVersion(): string {
  const v = (process.env.WHATSAPP_OFFICIAL_GRAPH_VERSION || 'v21.0').trim();
  return v.replace(/^\/+/, '');
}

export function getWhatsappOfficialGraphBaseUrl(): string {
  const v = getWhatsappOfficialGraphVersion();
  return `https://graph.facebook.com/${v}`;
}

/** Globais em `system_feature_flags` (cache). */
export function isWhatsappOfficialSuperadminEnabled(): boolean {
  return getSystemFlag('whatsapp_official_enabled');
}

export function isWhatsappOfficialTenantEnabled(): boolean {
  return getSystemFlag('whatsapp_official_tenant_enabled');
}

export function shouldVerifyWhatsappOfficialWebhookSignature(): boolean {
  return (process.env.WHATSAPP_OFFICIAL_WEBHOOK_VERIFY_SIGNATURE || 'true').toLowerCase() === 'true';
}
