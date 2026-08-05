/**
 * Preferências de timing do digest CRM (invoice.due_soon / invoice.overdue).
 * Persistidas em tenant_notification_preferences.recipient_policy (JSONB).
 * Default: ligado no painel (sem linha = enabled) + dias abaixo.
 */

export const INVOICE_DIGEST_SCHEDULE_DEFAULTS = {
  /** Dias antes do vencimento para o lembrete (0 = no dia). */
  days_before: 3,
  /** Dias após o vencimento para o 1.º aviso de atraso. */
  days_after: 1,
  /** Repetir avisos de atraso após o 1.º. */
  repeat_enabled: false,
  /** Intervalo em dias entre repetições. */
  repeat_every_days: 3,
  /** Quantas repetições além do 1.º aviso (total = 1 + max_extra). */
  repeat_max_extra: 2,
} as const;

export const INVOICE_DIGEST_DAYS_BEFORE_MIN = 0;
export const INVOICE_DIGEST_DAYS_BEFORE_MAX = 60;
export const INVOICE_DIGEST_DAYS_AFTER_MIN = 0;
export const INVOICE_DIGEST_DAYS_AFTER_MAX = 90;
export const INVOICE_DIGEST_REPEAT_EVERY_MIN = 1;
export const INVOICE_DIGEST_REPEAT_EVERY_MAX = 90;
export const INVOICE_DIGEST_REPEAT_MAX_EXTRA_MIN = 0;
export const INVOICE_DIGEST_REPEAT_MAX_EXTRA_MAX = 30;

export type InvoiceDueSoonSchedule = {
  days_before: number;
};

export type InvoiceOverdueSchedule = {
  days_after: number;
  repeat_enabled: boolean;
  repeat_every_days: number;
  repeat_max_extra: number;
};

export type InvoiceDigestScheduleUi = {
  days_before?: number;
  days_after?: number;
  repeat_enabled?: boolean;
  repeat_every_days?: number;
  repeat_max_extra?: number;
};

export type RecipientPolicyPatch = {
  days_before?: number;
  days_after?: number;
  repeat_enabled?: boolean;
  repeat_every_days?: number;
  repeat_max_extra?: number;
};

function asRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function clampInt(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

function readInt(raw: unknown, fallback: number, min: number, max: number): number {
  if (typeof raw === 'number') return clampInt(raw, min, max, fallback);
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    return clampInt(n, min, max, fallback);
  }
  return fallback;
}

export function parseInvoiceDueSoonSchedule(recipientPolicy: unknown): InvoiceDueSoonSchedule {
  const o = asRecord(recipientPolicy);
  return {
    days_before: readInt(
      o.days_before,
      INVOICE_DIGEST_SCHEDULE_DEFAULTS.days_before,
      INVOICE_DIGEST_DAYS_BEFORE_MIN,
      INVOICE_DIGEST_DAYS_BEFORE_MAX,
    ),
  };
}

export function parseInvoiceOverdueSchedule(recipientPolicy: unknown): InvoiceOverdueSchedule {
  const o = asRecord(recipientPolicy);
  return {
    days_after: readInt(
      o.days_after,
      INVOICE_DIGEST_SCHEDULE_DEFAULTS.days_after,
      INVOICE_DIGEST_DAYS_AFTER_MIN,
      INVOICE_DIGEST_DAYS_AFTER_MAX,
    ),
    repeat_enabled: o.repeat_enabled === true,
    repeat_every_days: readInt(
      o.repeat_every_days,
      INVOICE_DIGEST_SCHEDULE_DEFAULTS.repeat_every_days,
      INVOICE_DIGEST_REPEAT_EVERY_MIN,
      INVOICE_DIGEST_REPEAT_EVERY_MAX,
    ),
    repeat_max_extra: readInt(
      o.repeat_max_extra,
      INVOICE_DIGEST_SCHEDULE_DEFAULTS.repeat_max_extra,
      INVOICE_DIGEST_REPEAT_MAX_EXTRA_MIN,
      INVOICE_DIGEST_REPEAT_MAX_EXTRA_MAX,
    ),
  };
}

/** Soma dias a um YMD (calendário civil, sem DST). */
export function addCalendarDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function localYmdInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${m.year}-${m.month}-${m.day}`;
}

/**
 * Lembrete: envia no dia local em que due_date = today + days_before
 * (ex.: days_before=3 → 3 dias antes; days_before=0 → no dia do vencimento).
 */
export function isDueSoonEligibleOnLocalDay(params: {
  dueDateYmd: string;
  tenantTodayYmd: string;
  daysBefore: number;
}): boolean {
  const target = addCalendarDaysYmd(params.tenantTodayYmd, params.daysBefore);
  return params.dueDateYmd.slice(0, 10) === target;
}

/**
 * 1.º aviso de atraso: elegível quando today >= due_date + days_after.
 */
export function isOverdueFirstEligibleOnLocalDay(params: {
  dueDateYmd: string;
  tenantTodayYmd: string;
  daysAfter: number;
}): boolean {
  const firstDay = addCalendarDaysYmd(params.dueDateYmd.slice(0, 10), params.daysAfter);
  return params.tenantTodayYmd >= firstDay;
}

/**
 * Extrai nº de sequência de keys do digest de atraso.
 * - `…:seq:N` → N
 * - `…:first` (Sprint 1) → 1
 * - `…:YYYY-MM-DD` (legado diário) → 1
 */
export function parseOverdueDigestSeqFromIdempotencyKey(key: string): number | null {
  const seq = key.match(/:seq:(\d+)$/);
  if (seq) {
    const n = parseInt(seq[1], 10);
    return Number.isFinite(n) && n >= 1 ? n : null;
  }
  if (/:first$/.test(key)) return 1;
  if (/:\d{4}-\d{2}-\d{2}$/.test(key)) return 1;
  return null;
}

export function overdueDigestIdempotencySuffix(seq: number): string {
  return `seq:${Math.max(1, Math.trunc(seq))}`;
}

/**
 * Decide o próximo envio de atraso (1.º ou repetição).
 * `maxSeqAlready` = maior seq já usada (0 se nenhum).
 * `lastSendYmd` = dia local do último delivery relevante.
 */
export function resolveNextOverdueDigestSend(params: {
  schedule: InvoiceOverdueSchedule;
  dueDateYmd: string;
  tenantTodayYmd: string;
  maxSeqAlready: number;
  lastSendYmd: string | null;
}): { seq: number } | null {
  const { schedule, dueDateYmd, tenantTodayYmd, maxSeqAlready, lastSendYmd } = params;
  const maxTotal = 1 + (schedule.repeat_enabled ? schedule.repeat_max_extra : 0);

  if (
    !isOverdueFirstEligibleOnLocalDay({
      dueDateYmd,
      tenantTodayYmd,
      daysAfter: schedule.days_after,
    })
  ) {
    return null;
  }

  if (maxSeqAlready <= 0) {
    return { seq: 1 };
  }

  if (!schedule.repeat_enabled) {
    return null;
  }

  if (maxSeqAlready >= maxTotal) {
    return null;
  }

  if (!lastSendYmd) {
    return null;
  }

  const nextAllowed = addCalendarDaysYmd(lastSendYmd, schedule.repeat_every_days);
  if (tenantTodayYmd < nextAllowed) {
    return null;
  }

  return { seq: maxSeqAlready + 1 };
}

export function mergeRecipientPolicyPatch(
  existing: unknown,
  patch: RecipientPolicyPatch | null | undefined,
): Record<string, unknown> {
  const base = { ...asRecord(existing) };
  if (!patch) return base;
  if (patch.days_before !== undefined) {
    base.days_before = clampInt(
      patch.days_before,
      INVOICE_DIGEST_DAYS_BEFORE_MIN,
      INVOICE_DIGEST_DAYS_BEFORE_MAX,
      INVOICE_DIGEST_SCHEDULE_DEFAULTS.days_before,
    );
  }
  if (patch.days_after !== undefined) {
    base.days_after = clampInt(
      patch.days_after,
      INVOICE_DIGEST_DAYS_AFTER_MIN,
      INVOICE_DIGEST_DAYS_AFTER_MAX,
      INVOICE_DIGEST_SCHEDULE_DEFAULTS.days_after,
    );
  }
  if (patch.repeat_enabled !== undefined) {
    base.repeat_enabled = patch.repeat_enabled === true;
  }
  if (patch.repeat_every_days !== undefined) {
    base.repeat_every_days = clampInt(
      patch.repeat_every_days,
      INVOICE_DIGEST_REPEAT_EVERY_MIN,
      INVOICE_DIGEST_REPEAT_EVERY_MAX,
      INVOICE_DIGEST_SCHEDULE_DEFAULTS.repeat_every_days,
    );
  }
  if (patch.repeat_max_extra !== undefined) {
    base.repeat_max_extra = clampInt(
      patch.repeat_max_extra,
      INVOICE_DIGEST_REPEAT_MAX_EXTRA_MIN,
      INVOICE_DIGEST_REPEAT_MAX_EXTRA_MAX,
      INVOICE_DIGEST_SCHEDULE_DEFAULTS.repeat_max_extra,
    );
  }
  return base;
}

/** Campos efetivos para a UI do painel (sempre com defaults). */
export function scheduleFieldsForEventKey(
  eventKey: string,
  recipientPolicy: unknown,
): InvoiceDigestScheduleUi | null {
  if (eventKey === 'invoice.due_soon') {
    return { days_before: parseInvoiceDueSoonSchedule(recipientPolicy).days_before };
  }
  if (eventKey === 'invoice.overdue') {
    const s = parseInvoiceOverdueSchedule(recipientPolicy);
    return {
      days_after: s.days_after,
      repeat_enabled: s.repeat_enabled,
      repeat_every_days: s.repeat_every_days,
      repeat_max_extra: s.repeat_max_extra,
    };
  }
  return null;
}
