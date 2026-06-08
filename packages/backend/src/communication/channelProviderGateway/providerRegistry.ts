import type { CommunicationProviderKey } from '../communicationTypes.js';
import type { ICommunicationProviderAdapter } from './providerContracts.js';
import { uazapiBridgeAdapter } from '../adapters/uazapiBridgeAdapter.js';
import { logProvider } from '../communicationLogger.js';

const adapters = new Map<CommunicationProviderKey, ICommunicationProviderAdapter>();

function register(adapter: ICommunicationProviderAdapter): void {
  adapters.set(adapter.providerKey, adapter);
}

register(uazapiBridgeAdapter);

/** Stubs registered for Meta readiness — no real send in P0 */
const stubAdapter = (key: CommunicationProviderKey, name: string): ICommunicationProviderAdapter => ({
  providerKey: key,
  displayName: name,
  supportsChannel: (ch) => ch === 'email' || ch === 'whatsapp',
  getCapabilities: () => [],
  healthCheck: async () => ({
    provider: key,
    status: 'unknown',
    checkedAt: new Date().toISOString(),
    details: { stub: true },
  }),
  sendMessage: async () => ({ ok: false, error: 'provider_not_implemented_p0' }),
});

register(stubAdapter('smtp', 'SMTP (stub)'));
register(stubAdapter('meta_cloud', 'Meta Cloud (stub)'));
register(stubAdapter('internal', 'Internal (stub)'));

export function getProviderAdapter(provider: CommunicationProviderKey): ICommunicationProviderAdapter | undefined {
  return adapters.get(provider);
}

export function listRegisteredProviders(): CommunicationProviderKey[] {
  return [...adapters.keys()];
}

export function getAdapterOrThrow(provider: CommunicationProviderKey): ICommunicationProviderAdapter {
  const adapter = adapters.get(provider);
  if (!adapter) {
    logProvider('adapter_not_found', { provider });
    throw new Error(`communication_provider_not_registered:${provider}`);
  }
  return adapter;
}
