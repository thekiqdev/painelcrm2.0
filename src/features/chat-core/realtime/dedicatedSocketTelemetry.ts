/**
 * MB-030 / MB-038 — telemetria de socket dedicado residual (F1 OFF).
 * Não remove path legado; apenas inventaria.
 */

type Surface = string;

const dedicatedOpens = new Map<Surface, number>();

export function recordDedicatedChatSocketOpen(surface: Surface): void {
  dedicatedOpens.set(surface, (dedicatedOpens.get(surface) ?? 0) + 1);
  if (import.meta.env.DEV) {
    console.info(`[chat-socket] dedicated socket opened surface=${surface}`);
  }
}

export function getDedicatedChatSocketOpenCounts(): Readonly<Record<string, number>> {
  return Object.fromEntries(dedicatedOpens.entries());
}

export function resetDedicatedChatSocketOpenCountsForTests(): void {
  dedicatedOpens.clear();
}
