/**
 * Sprint 3 — finishDate Asaas + contagem de ciclos restantes.
 */
import { calculateNextBillingDate } from '../subscriptionService.js';
import type { BillingInterval } from '../billingService.js';

export function computePixAutomaticFinishDateYmd(opts: {
  startDateYmd: string;
  billingInterval: string;
  maxCycles: number | null | undefined;
  cyclesUnlimited: boolean;
  /** Ciclos já emitidos (invoice_id) antes desta autorização / cobrança imediata. */
  consumedBeforeAuth: number;
}): string | null {
  if (opts.cyclesUnlimited) return null;
  const max =
    opts.maxCycles != null && Number.isFinite(Number(opts.maxCycles))
      ? Math.trunc(Number(opts.maxCycles))
      : null;
  if (max == null || max < 1) return null;

  const consumed = Math.max(0, Math.trunc(opts.consumedBeforeAuth));
  const remaining = max - consumed;
  if (remaining <= 0) return opts.startDateYmd;

  const interval = (opts.billingInterval || 'monthly') as BillingInterval;
  let due = opts.startDateYmd;
  for (let i = 1; i < remaining; i += 1) {
    due = calculateNextBillingDate(due, interval, null);
  }
  return due;
}

export function remainingChargeSlots(opts: {
  cyclesUnlimited: boolean;
  maxCycles: number | null | undefined;
  emitted: number;
}): number | null {
  if (opts.cyclesUnlimited) return null;
  const max =
    opts.maxCycles != null && Number.isFinite(Number(opts.maxCycles))
      ? Math.trunc(Number(opts.maxCycles))
      : null;
  if (max == null || max < 1) return null;
  return Math.max(0, max - Math.max(0, opts.emitted));
}
