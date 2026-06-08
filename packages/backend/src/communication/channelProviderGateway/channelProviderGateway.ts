import { randomUUID } from 'crypto';
import { requireCorrelationId } from '../../context/requestContext.js';
import {
  getCommunicationGatewayFlag,
  isCommunicationDualDispatchEnabled,
  isCommunicationUazapiBridgeEnabled,
} from '../communicationFlags.js';
import {
  logCommunication,
  logCommunicationBridge,
  logCommunicationRouting,
} from '../communicationLogger.js';
import type {
  CommunicationDispatchResult,
  SendCommunicationInput,
  StartConversationInput,
  StartConversationResult,
} from '../communicationTypes.js';
import { resolveCommunicationRouting } from './communicationRoutingService.js';
import {
  insertCommunicationMessage,
  updateCommunicationMessageState,
} from './communicationMessageRepository.js';
import { getAdapterOrThrow } from './providerRegistry.js';
import { intentRequiresCapability } from './providerContracts.js';
import { assertProviderCapabilities } from './providerCapabilityRegistry.js';

async function persistShadowMessage(
  input: SendCommunicationInput,
  routing: Awaited<ReturnType<typeof resolveCommunicationRouting>>,
  correlationId: string,
  shadow: boolean,
): Promise<string | undefined> {
  const { row } = await insertCommunicationMessage({
    tenantId: input.tenantId ?? null,
    channel: input.channel,
    provider: routing.primaryProvider,
    messageIntent: input.messageIntent,
    deliveryState: shadow ? 'queued' : 'accepted',
    correlationId,
    idempotencyKey: input.idempotencyKey,
    recipient: input.recipient,
    routingJson: routing as unknown as Record<string, unknown>,
    metadataJson: { ...(input.metadata ?? {}), template_key: input.templateKey ?? null },
    shadowMode: shadow,
  });
  return row?.id;
}

async function executeBridgeSend(
  input: SendCommunicationInput,
  provider: Awaited<ReturnType<typeof resolveCommunicationRouting>>['primaryProvider'],
): Promise<CommunicationDispatchResult> {
  const bridgeOn = await isCommunicationUazapiBridgeEnabled({ tenantId: input.tenantId ?? null });
  if (!bridgeOn) {
    return { outcome: 'skipped', reason: 'uazapi_bridge_v1_off', provider };
  }

  const adapter = getAdapterOrThrow(provider);
  const required = intentRequiresCapability(input.messageIntent);
  const caps = await assertProviderCapabilities(provider, required);
  if (!caps.ok) {
    return { outcome: 'failed', provider, error: `missing_capabilities:${caps.missing.join(',')}` };
  }

  logCommunicationBridge('dispatch_real', {
    provider,
    intent: input.messageIntent,
    channel: input.channel,
    correlation_id: input.correlationId,
  });

  const sendFn = input.templateKey && adapter.sendTemplate
    ? () =>
        adapter.sendTemplate!({
          ...input,
          templateKey: input.templateKey!,
          templateVariables: input.templateVariables ?? {},
        })
    : () => adapter.sendMessage(input);

  const result = await sendFn();
  if (result.ok) {
    return {
      outcome: 'sent',
      provider,
      externalMessageId: result.externalMessageId ?? null,
    };
  }
  return { outcome: 'failed', provider, error: result.error };
}

/**
 * Único ponto oficial futuro para envio de comunicação.
 * Flag OFF: no-op (100% legado permanece nos callers atuais).
 * Shadow: persiste/loga sem envio real via gateway.
 */
export async function sendMessage(input: SendCommunicationInput): Promise<CommunicationDispatchResult> {
  const flag = await getCommunicationGatewayFlag({ tenantId: input.tenantId ?? null });
  const correlationId = input.correlationId?.trim() || requireCorrelationId();

  if (!flag.enabled) {
    logCommunication('send_skipped', {
      reason: 'gateway_v1_off',
      intent: input.messageIntent,
      channel: input.channel,
      correlation_id: correlationId,
    });
    return { outcome: 'skipped', reason: 'gateway_v1_off' };
  }

  const routing = await resolveCommunicationRouting({
    tenantId: input.tenantId ?? null,
    channel: input.channel,
    messageIntent: input.messageIntent,
  });

  logCommunication('send_request', {
    intent: input.messageIntent,
    channel: input.channel,
    tenant_id: input.tenantId ?? null,
    correlation_id: correlationId,
    idempotency_key: input.idempotencyKey,
    shadow: flag.shadow,
    primary_provider: routing.primaryProvider,
  });

  const messageId = await persistShadowMessage(input, routing, correlationId, flag.shadow);

  if (flag.shadow) {
    logCommunication('shadow_dispatch', {
      communication_message_id: messageId ?? null,
      intent: input.messageIntent,
      provider: routing.primaryProvider,
      correlation_id: correlationId,
    });
    return {
      outcome: 'shadow_logged',
      communicationMessageId: messageId,
      provider: routing.primaryProvider,
      shadow: true,
    };
  }

  const dual = await isCommunicationDualDispatchEnabled({ tenantId: input.tenantId ?? null });
  if (dual) {
    logCommunicationRouting('dual_dispatch_blocked_prod', {
      correlation_id: correlationId,
      note: 'dual_dispatch must stay OFF in prod P0',
    });
  }

  const dispatch = await executeBridgeSend(input, routing.primaryProvider);

  if (messageId) {
    await updateCommunicationMessageState(messageId, {
      deliveryState: dispatch.outcome === 'sent' ? 'sent' : 'failed',
      providerMessageId: dispatch.externalMessageId ?? null,
      lastError: dispatch.error ?? null,
    });
  }

  return {
    ...dispatch,
    communicationMessageId: messageId,
    shadow: false,
  };
}

export async function sendTemplate(input: SendCommunicationInput & {
  templateKey: string;
  templateVariables?: Record<string, string>;
}): Promise<CommunicationDispatchResult> {
  return sendMessage(input);
}

export async function sendTransactionalMessage(
  input: SendCommunicationInput,
): Promise<CommunicationDispatchResult> {
  return sendMessage({
    ...input,
    messageIntent: input.messageIntent ?? 'transactional',
  });
}

export async function startConversation(input: StartConversationInput): Promise<StartConversationResult> {
  const flag = await getCommunicationGatewayFlag({ tenantId: input.tenantId ?? null });
  const correlationId = input.correlationId?.trim() || requireCorrelationId();

  if (!flag.enabled) {
    return { outcome: 'skipped' };
  }

  const conversationId = randomUUID();
  logCommunication('start_conversation', {
    conversation_id: conversationId,
    channel: input.channel,
    intent: input.messageIntent,
    correlation_id: correlationId,
    shadow: flag.shadow,
  });

  if (flag.shadow) {
    return { outcome: 'shadow_logged', conversationId, shadow: true };
  }

  return { outcome: 'started', conversationId, shadow: false };
}

export async function getProviderHealth(provider: Parameters<typeof getAdapterOrThrow>[0]) {
  const adapter = getAdapterOrThrow(provider);
  return adapter.healthCheck();
}
