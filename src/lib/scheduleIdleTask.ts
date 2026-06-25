export type ScheduleIdleOptions = {
  /** Máximo de espera antes de executar mesmo sem idle (ms). */
  timeout?: number;
  /** Fallback quando requestIdleCallback não existe (ms). */
  fallbackDelay?: number;
};

/**
 * Agenda trabalho de baixa prioridade após o shell estar interativo.
 * Usa requestIdleCallback com timeout; fallback para setTimeout.
 */
export function scheduleIdleTask(run: () => void, options: ScheduleIdleOptions = {}): () => void {
  const { timeout = 4000, fallbackDelay = 1200 } = options;
  let cancelled = false;
  const safeRun = () => {
    if (!cancelled) run();
  };

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    const idleId = window.requestIdleCallback(safeRun, { timeout });
    return () => {
      cancelled = true;
      if (typeof cancelIdleCallback !== 'undefined') {
        cancelIdleCallback(idleId);
      }
    };
  }

  const timeoutId = window.setTimeout(safeRun, fallbackDelay);
  return () => {
    cancelled = true;
    window.clearTimeout(timeoutId);
  };
}
