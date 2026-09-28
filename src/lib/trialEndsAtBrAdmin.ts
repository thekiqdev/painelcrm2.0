import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/** Fuso usado no Super Admin para exibir/editar o fim do trial (regra de negócio). */
export const ADMIN_TRIAL_ENDS_TZ = 'America/Sao_Paulo';

/**
 * Converte instante UTC (string ISO do backend) para o formato `datetime-local`,
 * sempre em horário de Brasília — independente do fuso do navegador do admin.
 */
export function trialEndsAtToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return formatInTimeZone(d, ADMIN_TRIAL_ENDS_TZ, "yyyy-MM-dd'T'HH:mm");
}

/**
 * Interpreta o valor do `datetime-local` como relógio em `America/Sao_Paulo` e devolve ISO UTC
 * para persistência (TIMESTAMPTZ / comparações com `now()` no servidor).
 */
export function datetimeLocalToTrialEndsAtIso(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const v = value.trim();
  const normalized = v.length === 16 ? `${v}:00` : v;
  const utcDate = fromZonedTime(normalized, ADMIN_TRIAL_ENDS_TZ);
  if (Number.isNaN(utcDate.getTime())) return null;
  return utcDate.toISOString();
}
