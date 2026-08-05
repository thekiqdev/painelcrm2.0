/**
 * Timeout / inatividade em wait_input e menu_choice (S18) — espelho BE.
 */

export type TimeoutUnit = 'seconds' | 'minutes' | 'hours' | 'days';

export function isInputTimeoutEnabled(data: Record<string, unknown> | null | undefined): boolean {
  if (!data) return false;
  return data.timeout_enabled === true;
}

export function readTimeoutSchedule(data: Record<string, unknown> | null | undefined): {
  amount: number;
  unit: TimeoutUnit;
} {
  const amount = Math.max(1, Math.min(99999, Math.round(Number(data?.timeout_amount) || 5)));
  const unitRaw = String(data?.timeout_unit || 'minutes');
  const unit: TimeoutUnit =
    unitRaw === 'seconds' || unitRaw === 'hours' || unitRaw === 'days' ? unitRaw : 'minutes';
  return { amount, unit };
}

/** ISO resume_at a partir de agora. */
export function computeInputTimeoutResumeAt(
  data: Record<string, unknown> | null | undefined,
  from: Date = new Date()
): string | null {
  if (!isInputTimeoutEnabled(data)) return null;
  const { amount, unit } = readTimeoutSchedule(data);
  const mult =
    unit === 'seconds'
      ? 1000
      : unit === 'hours'
        ? 3600_000
        : unit === 'days'
          ? 86400_000
          : 60_000;
  return new Date(from.getTime() + amount * mult).toISOString();
}

export function formatTimeoutHint(data: Record<string, unknown> | null | undefined): string | null {
  if (!isInputTimeoutEnabled(data)) return null;
  const { amount, unit } = readTimeoutSchedule(data);
  const unitLabel =
    unit === 'seconds'
      ? 's'
      : unit === 'hours'
        ? 'h'
        : unit === 'days'
          ? 'd'
          : 'min';
  return `timeout ${amount}${unitLabel}`;
}
