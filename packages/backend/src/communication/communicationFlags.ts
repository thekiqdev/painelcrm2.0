import { featureFlagRegistry } from '../platform/featureFlagRegistry.js';

type FlagCtx = { tenantId?: string | null };

async function resolve(key: string, ctx: FlagCtx = {}) {
  return featureFlagRegistry.resolve(key, {
    tenantId: ctx.tenantId ?? undefined,
  });
}

export async function isCommunicationMasterOff(ctx: FlagCtx = {}): Promise<boolean> {
  const r = await resolve('communication.master_off', ctx);
  return r.enabled;
}

export async function getCommunicationGatewayFlag(ctx: FlagCtx = {}): Promise<{
  enabled: boolean;
  shadow: boolean;
}> {
  const master = await isCommunicationMasterOff(ctx);
  if (master) return { enabled: false, shadow: true };
  const r = await resolve('communication.gateway_v1', ctx);
  return { enabled: r.enabled, shadow: r.shadow };
}

export async function isCommunicationUazapiBridgeEnabled(ctx: FlagCtx = {}): Promise<boolean> {
  const r = await resolve('communication.uazapi_bridge_v1', ctx);
  return r.enabled;
}

export async function isCommunicationRoutingEnabled(ctx: FlagCtx = {}): Promise<boolean> {
  const r = await resolve('communication.routing_v1', ctx);
  return r.enabled;
}

export async function isCommunicationCapabilityRegistryEnabled(ctx: FlagCtx = {}): Promise<boolean> {
  const r = await resolve('communication.capability_registry_v1', ctx);
  return r.enabled;
}

export async function isCommunicationWebhookNormalizerEnabled(
  ctx: FlagCtx = {},
): Promise<{ enabled: boolean; shadow: boolean }> {
  const master = await isCommunicationMasterOff(ctx);
  if (master) return { enabled: false, shadow: true };
  const r = await resolve('communication.webhook_normalizer_v1', ctx);
  return { enabled: r.enabled, shadow: r.shadow };
}

export async function isCommunicationDualDispatchEnabled(ctx: FlagCtx = {}): Promise<boolean> {
  const r = await resolve('communication.bridge_dual_dispatch', ctx);
  return r.enabled;
}
