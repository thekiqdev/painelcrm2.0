import type { CommunicationProviderAdapter } from './communicationProviderAdapter.js';
import type { CommunicationProvider } from './communicationTypes.js';
import { DEFAULT_COMMUNICATION_PROVIDER } from './communicationTypes.js';
import { whatsappUazapiAdapter } from './whatsappUazapiAdapter.js';

export type CommunicationEngineDelegates = {
  /** Pipeline completo do webhook Uazapi (hoje: processWebhookEvent no chatController). */
  processWhatsappUazapiWebhook?: (instance: any, payload: unknown, event: string) => Promise<void>;
};

let delegates: CommunicationEngineDelegates = {};

export function registerCommunicationEngineDelegates(next: CommunicationEngineDelegates): void {
  delegates = { ...delegates, ...next };
}

export function resolveProviderAdapter(
  provider: CommunicationProvider
): CommunicationProviderAdapter | null {
  if (provider === DEFAULT_COMMUNICATION_PROVIDER) return whatsappUazapiAdapter;
  return null;
}

/**
 * Entrada unificada de webhook por provedor. WhatsApp/Uazapi delega ao pipeline legado registado.
 */
export async function processProviderWebhook(
  provider: CommunicationProvider,
  instance: any,
  payload: unknown,
  event: string
): Promise<void> {
  if (provider === DEFAULT_COMMUNICATION_PROVIDER) {
    const fn = delegates.processWhatsappUazapiWebhook;
    if (!fn) {
      console.error('[communicationEngine] processWhatsappUazapiWebhook not registered');
      return;
    }
    await fn(instance, payload, event);
    return;
  }
  console.warn('[communicationEngine] webhook ignored for provider', provider);
}

export async function syncProviderConversations(
  provider: CommunicationProvider,
  _channelId: string,
  _actorUserId: string
): Promise<{ ok: boolean; error?: string }> {
  if (provider !== DEFAULT_COMMUNICATION_PROVIDER) {
    return { ok: false, error: 'unsupported_provider' };
  }
  return {
    ok: false,
    error: 'use_http_sync_or_register_delegate',
  };
}

export async function sendProviderMessage(
  provider: CommunicationProvider,
  params: Parameters<CommunicationProviderAdapter['sendMessage']>[0]
): Promise<{ ok: boolean; error?: string }> {
  const adapter = resolveProviderAdapter(provider);
  if (!adapter) return { ok: false, error: 'no_adapter_for_provider' };
  return adapter.sendMessage(params);
}

export async function refreshProviderProfile(
  provider: CommunicationProvider,
  params: Parameters<CommunicationProviderAdapter['refreshProfile']>[0]
): Promise<{ ok: boolean; error?: string }> {
  const adapter = resolveProviderAdapter(provider);
  if (!adapter) return { ok: false, error: 'no_adapter_for_provider' };
  return adapter.refreshProfile(params);
}
