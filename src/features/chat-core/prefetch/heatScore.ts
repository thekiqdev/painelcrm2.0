/**
 * F6.6 — Conversation Heat Score (recência, frequência, atividade).
 * Puro: sem side-effects / sem store.
 */

export type HeatConversationInput = {
  id: string;
  unreadCount?: number | null;
  lastMessageAt?: string | null;
  /** Aberturas registadas no Warm Window (frequência). */
  openCount?: number;
  /** Timestamp ms da última abertura. */
  lastOpenedAt?: number | null;
};

export type HeatScoreWeights = {
  unread: number;
  recency: number;
  frequency: number;
  lastOpen: number;
};

export const DEFAULT_HEAT_WEIGHTS: HeatScoreWeights = {
  unread: 40,
  recency: 30,
  frequency: 20,
  lastOpen: 10,
};

const MS_DAY = 86_400_000;

function clamp01(n: number): number {
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

/** Recência da última mensagem: 1 = agora, 0 = >7 dias / ausente. */
export function activityRecencyScore(lastMessageAt: string | null | undefined, nowMs = Date.now()): number {
  if (!lastMessageAt) return 0;
  const t = new Date(lastMessageAt).getTime();
  if (!Number.isFinite(t)) return 0;
  const age = Math.max(0, nowMs - t);
  return clamp01(1 - age / (7 * MS_DAY));
}

/** Recência da última abertura pelo utilizador. */
export function openRecencyScore(lastOpenedAt: number | null | undefined, nowMs = Date.now()): number {
  if (lastOpenedAt == null || !Number.isFinite(lastOpenedAt)) return 0;
  const age = Math.max(0, nowMs - lastOpenedAt);
  return clamp01(1 - age / (2 * MS_DAY));
}

/**
 * Score 0–100. Maior = mais provável de ser aberta.
 */
export function computeHeatScore(
  input: HeatConversationInput,
  options?: { nowMs?: number; weights?: Partial<HeatScoreWeights> },
): number {
  const w = { ...DEFAULT_HEAT_WEIGHTS, ...options?.weights };
  const now = options?.nowMs ?? Date.now();
  const unread = Math.min(1, Math.max(0, (input.unreadCount ?? 0) > 0 ? 1 : 0));
  const activity = activityRecencyScore(input.lastMessageAt, now);
  const frequency = clamp01((input.openCount ?? 0) / 10);
  const lastOpen = openRecencyScore(input.lastOpenedAt ?? null, now);

  const raw =
    unread * w.unread +
    activity * w.recency +
    frequency * w.frequency +
    lastOpen * w.lastOpen;

  return Math.round(raw * 10) / 10;
}

export function rankByHeatScore(
  conversations: readonly HeatConversationInput[],
  options?: { nowMs?: number; weights?: Partial<HeatScoreWeights> },
): Array<HeatConversationInput & { heatScore: number }> {
  return conversations
    .map((c) => ({ ...c, heatScore: computeHeatScore(c, options) }))
    .sort((a, b) => b.heatScore - a.heatScore || a.id.localeCompare(b.id));
}
