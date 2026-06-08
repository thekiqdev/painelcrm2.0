import { featureFlagRegistry } from '../platform/featureFlagRegistry.js';

export async function isWorkerRuntimeEnabled(): Promise<boolean> {
  const r = await featureFlagRegistry.resolve('worker.runtime_v1', {});
  return r.enabled;
}

export async function isWorkerHeartbeatEnabled(): Promise<boolean> {
  const r = await featureFlagRegistry.resolve('worker.heartbeat_v1', {});
  return r.enabled;
}

export async function isWorkerHealthEnabled(): Promise<boolean> {
  const r = await featureFlagRegistry.resolve('worker.health_v1', {});
  return r.enabled;
}

export async function isWorkerReclaimEnabled(): Promise<boolean> {
  const r = await featureFlagRegistry.resolve('worker.reclaim_v1', {});
  return r.enabled;
}
