/** Fuso padrão para exibição de compromissos (mensagens de chat, confirmações). */
export const APPOINTMENT_DISPLAY_TZ = 'America/Sao_Paulo';

export function formatAppointmentDateLabelBr(iso: string, timeZone = APPOINTMENT_DISPLAY_TZ): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatAppointmentTimeLabelBr(iso: string, timeZone = APPOINTMENT_DISPLAY_TZ): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatAppointmentTimeRangeBr(
  startIso: string,
  endIso: string,
  timeZone = APPOINTMENT_DISPLAY_TZ,
): string {
  const a = formatAppointmentTimeLabelBr(startIso, timeZone);
  const b = formatAppointmentTimeLabelBr(endIso, timeZone);
  return `${a} – ${b}`;
}

/** `dateTime` para Google Calendar API com `timeZone` explícito (parede em SP). */
export function googleCalendarDateTimeFromIso(iso: string, timeZone = APPOINTMENT_DISPLAY_TZ): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.replace(/\.\d{3}Z$/, '').replace(/Z$/, '');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '00';
  const y = pick('year');
  const mo = pick('month');
  const da = pick('day');
  const h = pick('hour');
  const mi = pick('minute');
  const s = pick('second');
  return `${y}-${mo}-${da}T${h}:${mi}:${s}`;
}
