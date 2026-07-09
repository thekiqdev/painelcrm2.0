import type { ShadowCompareSample } from './types.js';
import { reductionPercent } from './request.js';
import { logChatAggregatedDev, isChatAggregatedDevLogEnabled } from './featureFlags.js';

const MAX_SHADOW_SAMPLES = 500;
const shadowSamples: ShadowCompareSample[] = [];

export function getChatAggregatedShadowSamples(limit = 20): ShadowCompareSample[] {
  return shadowSamples.slice(-limit);
}

export function resetChatAggregatedShadowSamples(): void {
  shadowSamples.length = 0;
}

export function recordShadowCompareSample(sample: ShadowCompareSample): void {
  shadowSamples.push(sample);
  if (shadowSamples.length > MAX_SHADOW_SAMPLES) {
    shadowSamples.splice(0, shadowSamples.length - MAX_SHADOW_SAMPLES);
  }
  if (isChatAggregatedDevLogEnabled()) {
    logChatAggregatedDev('shadow_compare', sample as unknown as Record<string, unknown>);
  }
}

export function buildShadowDiff(
  legacy: ShadowCompareSample['legacy'],
  aggregated: ShadowCompareSample['aggregated'],
): ShadowCompareSample['diff'] {
  const rowCountDelta = aggregated.rowCount - legacy.rowCount;
  const idMismatch =
    legacy.rowIds.length !== aggregated.rowIds.length ||
    legacy.rowIds.some((id, i) => aggregated.rowIds[i] !== id);
  const orderMismatch = idMismatch;
  return {
    rowCountDelta,
    idMismatch,
    orderMismatch,
    totalMsReductionPercent: reductionPercent(legacy.totalMs, aggregated.totalMs),
    sqlQueryMsReductionPercent: reductionPercent(legacy.sqlQueryMs, aggregated.sqlQueryMs),
    sqlCountReductionPercent: reductionPercent(legacy.sqlCount, aggregated.sqlCount),
    payloadReductionPercent: reductionPercent(legacy.payloadBytes, aggregated.payloadBytes),
    serializeMsReductionPercent: reductionPercent(legacy.serializeMs, aggregated.serializeMs),
    responseMsReductionPercent: reductionPercent(legacy.responseMs, aggregated.responseMs),
    memoryReductionPercent: reductionPercent(legacy.memoryBytesDelta, aggregated.memoryBytesDelta),
    cpuReductionPercent: reductionPercent(legacy.cpuMs, aggregated.cpuMs),
  };
}

export function measureCpuMs(): { start: () => void; end: () => number } {
  let startUsage = process.cpuUsage();
  let startAt = Date.now();
  return {
    start() {
      startUsage = process.cpuUsage();
      startAt = Date.now();
    },
    end() {
      const endUsage = process.cpuUsage(startUsage);
      const wall = Date.now() - startAt;
      const cpuMs = (endUsage.user + endUsage.system) / 1000;
      return Math.max(cpuMs, wall > 0 ? cpuMs : 0);
    },
  };
}

export function measureMemoryDelta(): { start: () => void; end: () => number } {
  let heap = process.memoryUsage().heapUsed;
  return {
    start() {
      heap = process.memoryUsage().heapUsed;
    },
    end() {
      return Math.max(0, process.memoryUsage().heapUsed - heap);
    },
  };
}

export function measureSerializeMs(payload: unknown): { bytes: number; ms: number } {
  const t0 = Date.now();
  const text = JSON.stringify(payload);
  return { bytes: Buffer.byteLength(text, 'utf8'), ms: Date.now() - t0 };
}
