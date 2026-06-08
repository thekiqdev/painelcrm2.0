import { featureFlagRegistry } from '../../platform/featureFlagRegistry.js';

type FlagCtx = { tenantId?: string | null };

async function resolve(key: string, ctx: FlagCtx = {}) {
  return featureFlagRegistry.resolve(key, {
    tenantId: ctx.tenantId ?? undefined,
  });
}

export async function isWorkflowMasterOff(ctx: FlagCtx = {}): Promise<boolean> {
  const r = await resolve('workflow.master_off', ctx);
  return r.enabled;
}

export async function isWorkflowRuntimeEnabled(ctx: FlagCtx = {}): Promise<boolean> {
  if (await isWorkflowMasterOff(ctx)) return false;
  const r = await resolve('workflow.runtime_v1', ctx);
  return r.enabled;
}

export async function getWorkflowShadowExecutionFlag(ctx: FlagCtx = {}): Promise<{
  enabled: boolean;
  shadow: boolean;
}> {
  if (await isWorkflowMasterOff(ctx)) return { enabled: false, shadow: true };
  const r = await resolve('workflow.shadow_execution_v1', ctx);
  return { enabled: r.enabled, shadow: r.shadow };
}

export async function isWorkflowPassiveConsumersEnabled(ctx: FlagCtx = {}): Promise<boolean> {
  if (await isWorkflowMasterOff(ctx)) return false;
  const r = await resolve('workflow.passive_consumers_v1', ctx);
  return r.enabled;
}

export async function isWorkflowOrchestrationEnabled(ctx: FlagCtx = {}): Promise<boolean> {
  if (await isWorkflowMasterOff(ctx)) return false;
  const r = await resolve('workflow.orchestration_v1', ctx);
  return r.enabled;
}

export async function isWorkflowSagaFoundationEnabled(ctx: FlagCtx = {}): Promise<boolean> {
  if (await isWorkflowMasterOff(ctx)) return false;
  const r = await resolve('workflow.saga_foundation_v1', ctx);
  return r.enabled;
}

export async function isWorkflowBridgeEnabled(ctx: FlagCtx = {}): Promise<boolean> {
  if (await isWorkflowMasterOff(ctx)) return false;
  const r = await resolve('workflow.bridge_v1', ctx);
  return r.enabled;
}
