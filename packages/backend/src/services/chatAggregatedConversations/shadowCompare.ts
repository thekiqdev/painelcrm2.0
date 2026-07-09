import type { AggregatedConversationsRequest } from './types.js';
import type { ShadowCompareSample } from './types.js';
import { listAggregatedConversations } from './listService.js';
import { extractRowIds } from './rowMapper.js';
import {
  buildShadowDiff,
  measureCpuMs,
  measureMemoryDelta,
  measureSerializeMs,
  recordShadowCompareSample,
} from './shadowMetrics.js';
import { logChatAggregatedDev } from './featureFlags.js';

export type LegacyShadowInput = {
  rows: Record<string, unknown>[];
  metrics: {
    totalMs: number;
    sqlQueryMs: number;
    sqlCount: number;
    responseMs: number;
  };
};

export async function runAggregatedShadowCompare(
  request: AggregatedConversationsRequest,
  legacy: LegacyShadowInput,
): Promise<void> {
  if (request.instanceIds.length === 0 && !request.singleInstanceId) {
    return;
  }

  const mem = measureMemoryDelta();
  const cpu = measureCpuMs();
  mem.start();
  cpu.start();
  const aggStart = Date.now();

  try {
    const aggregated = await listAggregatedConversations(
      { ...request, view: 'full', limit: request.limit || 200 },
      { parityMode: true },
    );
    const aggTotalMs = Date.now() - aggStart;
    const memoryBytesDelta = mem.end();
    const cpuMs = cpu.end();

    const legacySerialize = measureSerializeMs(legacy.rows);
    const aggSerialize = measureSerializeMs(aggregated.legacyItems);

    const legacySide = {
      totalMs: legacy.metrics.totalMs,
      sqlQueryMs: legacy.metrics.sqlQueryMs,
      sqlCount: legacy.metrics.sqlCount,
      payloadBytes: legacySerialize.bytes,
      serializeMs: legacySerialize.ms,
      responseMs: legacy.metrics.responseMs,
      memoryBytesDelta: 0,
      cpuMs: 0,
      rowCount: legacy.rows.length,
      rowIds: extractRowIds(legacy.rows),
    };

    const aggregatedSide = {
      totalMs: aggTotalMs,
      sqlQueryMs: aggregated.metrics.queryMs,
      sqlCount: aggregated.metrics.sqlCount,
      payloadBytes: aggregated.metrics.payloadBytes,
      serializeMs: aggregated.metrics.serializeMs,
      responseMs: aggregated.metrics.responseMs,
      memoryBytesDelta,
      cpuMs,
      rowCount: aggregated.legacyItems.length,
      rowIds: extractRowIds(aggregated.legacyItems),
    };

    const sample: ShadowCompareSample = {
      at: new Date().toISOString(),
      userId: request.userId,
      instanceCount: request.instanceIds.length,
      filters: {
        inboxScope: request.inboxScope,
        attendanceFilter: request.attendanceFilter,
        channelOrigin: request.channelOrigin,
        search: request.search,
        sort: request.sort,
      },
      legacy: legacySide,
      aggregated: aggregatedSide,
      diff: buildShadowDiff(legacySide, aggregatedSide),
    };

    recordShadowCompareSample(sample);

    if (sample.diff.idMismatch || sample.diff.rowCountDelta !== 0) {
      logChatAggregatedDev('shadow_divergence', {
        userId: request.userId,
        rowCountDelta: sample.diff.rowCountDelta,
        legacyCount: legacySide.rowCount,
        aggregatedCount: aggregatedSide.rowCount,
        legacyIds: legacySide.rowIds.slice(0, 20),
        aggregatedIds: aggregatedSide.rowIds.slice(0, 20),
      });
    }
  } catch (err) {
    logChatAggregatedDev('shadow_error', {
      userId: request.userId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
