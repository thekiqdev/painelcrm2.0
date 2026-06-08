import type {
  CommunicationChannel,
  CommunicationMessageIntent,
  CommunicationProviderKey,
  RoutingDecision,
} from '../communicationTypes.js';
import { isCommunicationRoutingEnabled } from '../communicationFlags.js';
import { assertProviderCapabilities } from './providerCapabilityRegistry.js';
import { intentRequiresCapability } from './providerContracts.js';
import { getProviderAdapter } from './providerRegistry.js';
import { logCommunicationRouting } from '../communicationLogger.js';

const DEFAULT_PRIMARY: Record<CommunicationChannel, CommunicationProviderKey> = {
  whatsapp: 'uazapi',
  email: 'smtp',
  sms: 'meta_cloud',
  internal: 'internal',
  push: 'internal',
};

const FALLBACK: Partial<Record<CommunicationChannel, CommunicationProviderKey>> = {
  whatsapp: 'meta_cloud',
  email: 'smtp',
};

export async function resolveCommunicationRouting(input: {
  tenantId?: string | null;
  channel: CommunicationChannel;
  messageIntent: CommunicationMessageIntent;
}): Promise<RoutingDecision> {
  const routingOn = await isCommunicationRoutingEnabled();
  const primaryProvider = DEFAULT_PRIMARY[input.channel] ?? 'internal';
  const fallbackProvider = FALLBACK[input.channel];

  const decision: RoutingDecision = {
    primaryProvider,
    fallbackProvider,
    reason: routingOn ? 'routing_v1_default_map' : 'routing_flag_off_default',
    tenantId: input.tenantId ?? null,
    channel: input.channel,
    intent: input.messageIntent,
  };

  const required = intentRequiresCapability(input.messageIntent);
  const capCheck = await assertProviderCapabilities(primaryProvider, required);
  if (!capCheck.ok) {
    decision.reason = 'primary_missing_capabilities';
    if (fallbackProvider && getProviderAdapter(fallbackProvider)) {
      logCommunicationRouting('fallback_candidate', {
        tenant_id: input.tenantId ?? null,
        channel: input.channel,
        intent: input.messageIntent,
        primary: primaryProvider,
        fallback: fallbackProvider,
        missing: capCheck.missing,
      });
    }
  }

  logCommunicationRouting('resolved', {
    tenant_id: input.tenantId ?? null,
    channel: input.channel,
    intent: input.messageIntent,
    primary_provider: decision.primaryProvider,
    fallback_provider: decision.fallbackProvider ?? null,
    reason: decision.reason,
    routing_on: routingOn,
  });

  return decision;
}
