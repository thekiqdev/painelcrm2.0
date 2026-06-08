import type { CommunicationProviderKey, ProviderCapability } from '../communicationTypes.js';
import { isCommunicationCapabilityRegistryEnabled } from '../communicationFlags.js';
import { logProvider } from '../communicationLogger.js';

const REGISTRY: Record<CommunicationProviderKey, ProviderCapability[]> = {  uazapi: [
    'media_support',
    'typing_support',
    'read_receipt',
    'reactions',
    'session_window',
    'transactional_allowed',
    'marketing_allowed',
  ],
  smtp: ['template_support', 'transactional_allowed'],
  meta_cloud: [
    'template_support',
    'media_support',
    'read_receipt',
    'official_api',
    'transactional_allowed',
    'marketing_allowed',
  ],
  internal: ['transactional_allowed'],
};

export function getProviderCapabilities(provider: CommunicationProviderKey): ProviderCapability[] {
  return [...(REGISTRY[provider] ?? [])];
}

export function providerSupportsCapability(
  provider: CommunicationProviderKey,
  capability: ProviderCapability,
): boolean {
  return getProviderCapabilities(provider).includes(capability);
}

export async function resolveCapabilitiesForProvider(
  provider: CommunicationProviderKey,
): Promise<ProviderCapability[]> {
  const enabled = await isCommunicationCapabilityRegistryEnabled();
  const caps = getProviderCapabilities(provider);
  if (enabled) {
    logProvider('capabilities_resolved', { provider, capabilities: caps });
  }
  return caps;
}

export async function assertProviderCapabilities(
  provider: CommunicationProviderKey,
  required: ProviderCapability[],
): Promise<{ ok: boolean; missing: ProviderCapability[] }> {
  const caps = await resolveCapabilitiesForProvider(provider);
  const missing = required.filter((c) => !caps.includes(c));
  if (missing.length > 0) {
    logProvider('capability_missing', { provider, missing, required });
  }
  return { ok: missing.length === 0, missing };
}
