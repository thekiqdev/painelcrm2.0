const mountMarks = new Map<string, number>();

/** Log de montagem — apenas em desenvolvimento (S0.1 instrumentação). */
export function logDevMount(label: string): void {
  if (!import.meta.env.DEV) return;
  if (mountMarks.has(label)) return;
  const at = performance.now();
  mountMarks.set(label, at);
  console.info(`[perf:mount] ${label} @ ${at.toFixed(1)}ms`);
}

export function getDevMountMarks(): ReadonlyMap<string, number> {
  return mountMarks;
}
