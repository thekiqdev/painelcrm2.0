/**
 * F5.5 — métricas de commands (shadow).
 */

import { isChatMigrationFlagEnabled } from '@/lib/chatMigrationFlagManager';

type CommandMetricsState = {
  commandExecutionMs: number;
  optimisticLatency: number;
  confirmLatency: number;
  rollbackLatency: number;
  commandFailures: number;
  commandRetries: number;
  commandRollbackCount: number;
  commandOptimisticCount: number;
};

const metrics: CommandMetricsState = {
  commandExecutionMs: 0,
  optimisticLatency: 0,
  confirmLatency: 0,
  rollbackLatency: 0,
  commandFailures: 0,
  commandRetries: 0,
  commandRollbackCount: 0,
  commandOptimisticCount: 0,
};

function metricsEnabled(): boolean {
  return isChatMigrationFlagEnabled('CHAT_CORE_METRICS');
}

function log(event: string, payload: Record<string, unknown>): void {
  if (!metricsEnabled()) return;
  console.info(`[chat-core-command-metrics] ${event}`, payload);
}

export function recordCommandExecutionMs(durationMs: number): void {
  metrics.commandExecutionMs += durationMs;
  log('command_execution', { durationMs, totalMs: metrics.commandExecutionMs });
}

export function recordCommandOptimisticLatency(durationMs: number): void {
  metrics.optimisticLatency += durationMs;
  log('optimistic_latency', { durationMs, totalMs: metrics.optimisticLatency });
}

export function recordCommandConfirmLatency(durationMs: number): void {
  metrics.confirmLatency += durationMs;
  log('confirm_latency', { durationMs, totalMs: metrics.confirmLatency });
}

export function recordCommandRollbackLatency(durationMs: number): void {
  metrics.rollbackLatency += durationMs;
  log('rollback_latency', { durationMs, totalMs: metrics.rollbackLatency });
}

export function recordCommandFailure(): void {
  metrics.commandFailures += 1;
  log('command_failure', { commandFailures: metrics.commandFailures });
}

export function recordCommandRetry(): void {
  metrics.commandRetries += 1;
  log('command_retry', { commandRetries: metrics.commandRetries });
}

export function recordCommandRollbackCount(): void {
  metrics.commandRollbackCount += 1;
  log('command_rollback', { commandRollbackCount: metrics.commandRollbackCount });
}

export function recordCommandOptimisticCount(): void {
  metrics.commandOptimisticCount += 1;
  log('command_optimistic', { commandOptimisticCount: metrics.commandOptimisticCount });
}

export function getCommandMetricsSnapshot(): Readonly<CommandMetricsState> {
  return { ...metrics };
}

export function resetCommandMetrics(): void {
  metrics.commandExecutionMs = 0;
  metrics.optimisticLatency = 0;
  metrics.confirmLatency = 0;
  metrics.rollbackLatency = 0;
  metrics.commandFailures = 0;
  metrics.commandRetries = 0;
  metrics.commandRollbackCount = 0;
  metrics.commandOptimisticCount = 0;
  log('command_metrics_reset', {});
}
