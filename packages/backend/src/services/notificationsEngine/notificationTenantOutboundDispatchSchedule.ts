/**
 * Calcula dispatch_not_before para notificações transacionais de fatura,
 * com base nas preferências de faturamento do tenant (Fase 4).
 */
import {
  getTenantBillingPreferences,
  resolveTenantBillingPreferences,
} from '../tenantBillingPreferencesService.js';

/** Nesta fase, apenas eventos transacionais diretos de fatura cliente. Digest permanece imediato. */
export const TENANT_SCHEDULED_INVOICE_NOTIFICATION_EVENT_KEYS = new Set<string>([
  'invoice.created',
  'invoice.paid',
]);

function localYmdAndHhmmInZone(date: Date, timeZone: string): { ymd: string; hhmm: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const ymd = `${m.year}-${m.month}-${m.day}`;
  const hhmm = `${m.hour}:${m.minute}`;
  return { ymd, hhmm };
}

/** Converte um relógio de parede (data local + HH:mm) no IANA tz para instante UTC. */
export function utcInstantForLocalWallClock(ymd: string, hhmm: string, timeZone: string): Date {
  const [y, mo, d] = ymd.split('-').map((x) => parseInt(x, 10));
  const [hh, mm] = hhmm.split(':').map((x) => parseInt(x, 10));
  const wantHh = String(hh).padStart(2, '0');
  const wantMm = String(mm).padStart(2, '0');
  const want = `${wantHh}:${wantMm}`;

  let lo = Date.UTC(y, mo - 1, d, 0, 0, 0, 0) - 48 * 3600 * 1000;
  let hi = Date.UTC(y, mo - 1, d, 0, 0, 0, 0) + 72 * 3600 * 1000;

  const cmp = (t: number): number => {
    const got = localYmdAndHhmmInZone(new Date(t), timeZone);
    const a = `${got.ymd}T${got.hhmm}`;
    const b = `${ymd}T${want}`;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  };

  for (let i = 0; i < 56 && lo <= hi; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const c = cmp(mid);
    if (c === 0) return new Date(mid);
    if (c < 0) lo = mid + 1;
    else hi = mid - 1;
  }

  const sweepLo = Date.UTC(y, mo - 1, d, 0, 0, 0, 0) - 36 * 3600 * 1000;
  const sweepHi = Date.UTC(y, mo - 1, d, 0, 0, 0, 0) + 60 * 3600 * 1000;
  for (let t = sweepLo; t <= sweepHi; t += 60 * 1000) {
    if (cmp(t) === 0) return new Date(t);
  }

  return new Date(Date.UTC(y, mo - 1, d, hh, mm, 0, 0));
}

export async function resolveInvoiceTransactionalDispatchNotBefore(params: {
  tenantId: string;
  eventKey: string;
  eventOccurredAt: Date | null;
}): Promise<Date | null> {
  if (!TENANT_SCHEDULED_INVOICE_NOTIFICATION_EVENT_KEYS.has(params.eventKey)) {
    return null;
  }

  const at = params.eventOccurredAt ?? new Date();
  const row = await getTenantBillingPreferences(params.tenantId);
  const resolved = resolveTenantBillingPreferences(row);

  if (resolved.invoice_notify_same_as_generation_effective) {
    return null;
  }

  const notifyHhmm = resolved.invoice_notify_time_local_effective;
  if (!notifyHhmm) {
    return null;
  }

  const { ymd } = localYmdAndHhmmInZone(at, resolved.timezone_effective);
  const targetUtc = utcInstantForLocalWallClock(ymd, notifyHhmm, resolved.timezone_effective);
  const nowMs = Date.now();
  if (targetUtc.getTime() <= nowMs) {
    return new Date(nowMs);
  }
  return targetUtc;
}
