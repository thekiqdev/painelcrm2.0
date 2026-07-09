/**
 * Coordenador de reconcile F3 — HTTP somente em cenários explícitos.
 */

import type { ChatReconcileReason, ChatReconcileScope } from './types';

type ReconcileListener = (scope: ChatReconcileScope, reason: ChatReconcileReason) => void;

const listeners = new Set<ReconcileListener>();

let lastInstancesReconcileAt = 0;
let lastAttendanceReconcileAt = 0;
let lastInstancesReason: ChatReconcileReason | null = null;
let lastAttendanceReason: ChatReconcileReason | null = null;

export function subscribeChatReconcile(listener: ReconcileListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(scope: ChatReconcileScope, reason: ChatReconcileReason): void {
  for (const listener of listeners) {
    listener(scope, reason);
  }
}

export function requestChatReconcile(
  scope: ChatReconcileScope,
  reason: ChatReconcileReason,
): void {
  emit(scope, reason);
}

export function recordInstancesReconciled(reason: ChatReconcileReason): void {
  lastInstancesReconcileAt = Date.now();
  lastInstancesReason = reason;
}

export function recordAttendanceReconciled(reason: ChatReconcileReason): void {
  lastAttendanceReconcileAt = Date.now();
  lastAttendanceReason = reason;
}

export function getChatReconcileDiagnostics(): Readonly<{
  lastInstancesReconcileAt: number;
  lastAttendanceReconcileAt: number;
  lastInstancesReason: ChatReconcileReason | null;
  lastAttendanceReason: ChatReconcileReason | null;
}> {
  return {
    lastInstancesReconcileAt,
    lastAttendanceReconcileAt,
    lastInstancesReason,
    lastAttendanceReason,
  };
}

export function resetChatReconcileDiagnostics(): void {
  lastInstancesReconcileAt = 0;
  lastAttendanceReconcileAt = 0;
  lastInstancesReason = null;
  lastAttendanceReason = null;
}
