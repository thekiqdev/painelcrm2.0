/**
 * S24 — guardrails de início: cooldown, horário, instância, prioridade.
 */

export type StartGuardConfig = {
  cooldownMinutes: number;
  scheduleEnabled: boolean;
  scheduleStartHm: string | null;
  scheduleEndHm: string | null;
  instanceIds: string[];
  priority: number;
};

const HM_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function parseHmToMinutes(hm: string): number | null {
  const m = HM_RE.exec(String(hm || '').trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function parseStartGuardConfig(
  startData: Record<string, unknown> | undefined
): StartGuardConfig {
  const d = startData || {};
  const cooldown = Number(d.cooldown_minutes);
  const priority = Number(d.priority);
  const ids = Array.isArray(d.instance_ids)
    ? d.instance_ids.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  return {
    cooldownMinutes: Number.isFinite(cooldown) && cooldown > 0 ? Math.min(10080, Math.floor(cooldown)) : 0,
    scheduleEnabled: d.schedule_enabled === true,
    scheduleStartHm:
      typeof d.schedule_start === 'string' && d.schedule_start.trim()
        ? d.schedule_start.trim()
        : null,
    scheduleEndHm:
      typeof d.schedule_end === 'string' && d.schedule_end.trim() ? d.schedule_end.trim() : null,
    instanceIds: ids,
    priority: Number.isFinite(priority) ? priority : 0,
  };
}

/** Minutos desde meia-noite no fuso (0–1439). */
export function minutesNowInTimezone(now: Date, timeZone: string): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: timeZone || 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const parts = fmt.formatToParts(now);
    let h = Number(parts.find((p) => p.type === 'hour')?.value);
    const m = Number(parts.find((p) => p.type === 'minute')?.value);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
    if (h === 24) h = 0;
    return h * 60 + m;
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
}

/**
 * Janela [start, end). Se start > end, cruza meia-noite.
 * Sem start/end válidos com schedule ligado → trata como fora (fail-closed).
 */
export function isWithinScheduleWindow(opts: {
  now?: Date;
  timeZone: string;
  startHm: string | null;
  endHm: string | null;
}): boolean {
  const start = opts.startHm ? parseHmToMinutes(opts.startHm) : null;
  const end = opts.endHm ? parseHmToMinutes(opts.endHm) : null;
  if (start == null || end == null) return false;
  if (start === end) return true; // 24h
  const nowM = minutesNowInTimezone(opts.now ?? new Date(), opts.timeZone);
  if (start < end) return nowM >= start && nowM < end;
  return nowM >= start || nowM < end;
}

export function isInstanceAllowed(
  allowedIds: string[],
  conversationInstanceId: string | null | undefined
): boolean {
  if (!allowedIds.length) return true;
  const id = String(conversationInstanceId || '').trim();
  if (!id) return false;
  return allowedIds.includes(id);
}

export function isCooldownActive(opts: {
  cooldownMinutes: number;
  lastEndedAt: Date | string | null | undefined;
  now?: Date;
}): boolean {
  if (!opts.cooldownMinutes || opts.cooldownMinutes <= 0) return false;
  if (!opts.lastEndedAt) return false;
  const ended = new Date(opts.lastEndedAt).getTime();
  if (!Number.isFinite(ended)) return false;
  const elapsedMs = (opts.now ?? new Date()).getTime() - ended;
  return elapsedMs < opts.cooldownMinutes * 60 * 1000;
}

export type FlowMatchCandidate = {
  flowId: string;
  versionId: string;
  priority: number;
  publishedAt: string | Date | null;
  reason: 'keyword' | 'first_message' | 'tag' | 'kanban_column';
};

/** Maior priority primeiro; empate = published_at mais recente. */
export function sortFlowMatchCandidates<T extends FlowMatchCandidate>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return tb - ta;
  });
}

export type StartSkipReason =
  | 'feature_off'
  | 'human_busy'
  | 'dm_only_group'
  | 'instance_mismatch'
  | 'outside_schedule'
  | 'cooldown'
  | 'no_trigger_match'
  | 'session_alive_ignore'
  | 'flow_not_found';

export function logStartSkip(fields: {
  conversationId: string;
  flowId?: string | null;
  reason: StartSkipReason | string;
  detail?: string;
}): void {
  console.log(
    JSON.stringify({
      event: 'chatbot_flows_runtime',
      phase: 'start_skipped',
      conversationId: fields.conversationId,
      flowId: fields.flowId || null,
      reason: fields.reason,
      detail: fields.detail || null,
    })
  );
}
