import { endOfWeek, parseISO, startOfWeek, startOfDay, endOfDay } from 'date-fns';
import type { Appointment } from '@/services/appointments';
import type { AvailabilityBlock } from '@/services/appointmentAvailabilityBlocks';
import { WEEK_VIEW_FALLBACK_HOUR_END, WEEK_VIEW_FALLBACK_HOUR_START } from './agendaConstants';

const MIN_VISIBLE_HOURS = 6;

export function parseHHmmToMinutes(hhmm: string): number {
  const s = hhmm.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return 9 * 60;
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return h * 60 + min;
}

function floorToHourStart(minutes: number): number {
  return Math.floor(minutes / 60) * 60;
}

/** Próximo limite de hora cheia estritamente depois do minuto indicado (fim da grelha). */
function exclusiveEndAfterMinute(minutes: number): number {
  if (minutes <= 0) return 60;
  const rem = minutes % 60;
  if (rem === 0) return minutes + 60;
  return Math.ceil(minutes / 60) * 60;
}

export type GetWeekVisibleHoursParams = {
  workStartTime: string;
  workEndTime: string;
  weekAnchor: Date;
  appointments: Appointment[];
  blocks: AvailabilityBlock[];
};

export type WeekVisibleHoursResult = {
  startHour: number;
  endHourInclusive: number;
  viewStartMin: number;
  viewEndMinExclusive: number;
  expandedBeyondAvailability: boolean;
  officeDisplayStart: string;
  officeDisplayEnd: string;
};

function formatMinutesAsHHmm(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Expediente (work_start / work_end) como base; expande para incluir compromissos e bloqueios
 * fora desse intervalo. Fallback interno 07–22 apenas se o expediente for inválido.
 */
export function getWeekVisibleHours(params: GetWeekVisibleHoursParams): WeekVisibleHoursResult {
  const ws = startOfWeek(params.weekAnchor, { weekStartsOn: 1 });
  const we = endOfWeek(params.weekAnchor, { weekStartsOn: 1 });
  const weekFromIso = startOfDay(ws).toISOString();
  const weekToIso = endOfDay(we).toISOString();

  let officeStartMin = parseHHmmToMinutes(params.workStartTime);
  let officeEndMin = parseHHmmToMinutes(params.workEndTime);

  if (!Number.isFinite(officeStartMin) || !Number.isFinite(officeEndMin)) {
    officeStartMin = WEEK_VIEW_FALLBACK_HOUR_START * 60;
    officeEndMin = WEEK_VIEW_FALLBACK_HOUR_END * 60;
  }
  if (officeEndMin <= officeStartMin) {
    officeEndMin = officeStartMin + 8 * 60;
  }

  const officeGridStartMin = floorToHourStart(officeStartMin);
  const officeGridEndExclusive = exclusiveEndAfterMinute(officeEndMin);

  const officeDisplayStart = formatMinutesAsHHmm(officeStartMin);
  const officeDisplayEnd = formatMinutesAsHHmm(officeEndMin);

  let expandStart = officeGridStartMin;
  let expandEndExclusive = officeGridEndExclusive;

  for (const ap of params.appointments) {
    const s = parseISO(ap.starts_at);
    const e = parseISO(ap.ends_at);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) continue;
    if (ap.starts_at > weekToIso || ap.ends_at < weekFromIso) continue;
    expandStart = Math.min(expandStart, floorToHourStart(s.getHours() * 60 + s.getMinutes()));
    expandEndExclusive = Math.max(
      expandEndExclusive,
      exclusiveEndAfterMinute(e.getHours() * 60 + e.getMinutes()),
    );
  }

  for (const b of params.blocks) {
    if (b.all_day) continue;
    const bs = parseISO(b.starts_at);
    const be = parseISO(b.ends_at);
    if (Number.isNaN(bs.getTime()) || Number.isNaN(be.getTime())) continue;
    if (b.starts_at > weekToIso || b.ends_at < weekFromIso) continue;
    expandStart = Math.min(expandStart, floorToHourStart(bs.getHours() * 60 + bs.getMinutes()));
    expandEndExclusive = Math.max(
      expandEndExclusive,
      exclusiveEndAfterMinute(be.getHours() * 60 + be.getMinutes()),
    );
  }

  expandStart = Math.max(0, expandStart);
  expandEndExclusive = Math.min(24 * 60, expandEndExclusive);
  if (expandEndExclusive <= expandStart) {
    expandEndExclusive = Math.min(24 * 60, expandStart + MIN_VISIBLE_HOURS * 60);
  }

  let dur = expandEndExclusive - expandStart;
  if (dur < MIN_VISIBLE_HOURS * 60) {
    const need = MIN_VISIBLE_HOURS * 60 - dur;
    const padLow = Math.floor(need / 2);
    const padHigh = need - padLow;
    expandStart = Math.max(0, expandStart - padLow);
    expandEndExclusive = Math.min(24 * 60, expandEndExclusive + padHigh);
    dur = expandEndExclusive - expandStart;
    if (dur < MIN_VISIBLE_HOURS * 60) {
      expandEndExclusive = Math.min(24 * 60, expandStart + MIN_VISIBLE_HOURS * 60);
    }
  }

  const startHour = Math.floor(expandStart / 60);
  const endHourInclusive = Math.min(23, Math.max(startHour, Math.ceil(expandEndExclusive / 60) - 1));

  const expandedBeyondAvailability =
    expandStart + 0.5 < officeGridStartMin || expandEndExclusive > officeGridEndExclusive + 0.5;

  return {
    startHour,
    endHourInclusive,
    viewStartMin: expandStart,
    viewEndMinExclusive: expandEndExclusive,
    expandedBeyondAvailability,
    officeDisplayStart,
    officeDisplayEnd,
  };
}
