import type { FinancialEvent } from './financialEventTypes';
import type { FinancialAlert } from './subscriptionFinancialExperience';
import { resolveFocusEventId } from './timelineFinancialSections';

export type FinancialScrollTarget =
  | { kind: 'timeline_event'; eventId: string; elementId: string }
  | { kind: 'section'; targetId: string }
  | { kind: 'month'; monthKey: string; elementId: string };

export function timelineEventElementId(eventId: string): string {
  return `timeline-event-${eventId}`;
}

export function timelineMonthElementId(monthKey: string): string {
  return `timeline-month-${monthKey}`;
}

export function resolveTimelineScrollTarget(
  events: FinancialEvent[],
  todayYmd: string
): FinancialScrollTarget | null {
  const eventId = resolveFocusEventId(events, todayYmd);
  if (eventId) {
    return { kind: 'timeline_event', eventId, elementId: timelineEventElementId(eventId) };
  }
  const currentMonth = todayYmd.slice(0, 7);
  return { kind: 'month', monthKey: currentMonth, elementId: timelineMonthElementId(currentMonth) };
}

export function resolveFinancialPageScrollTarget(
  events: FinancialEvent[],
  alerts: FinancialAlert[],
  todayYmd: string
): FinancialScrollTarget | null {
  if (alerts.some((a) => a.kind === 'billing_missing' || a.kind === 'gateway_failed')) {
    return { kind: 'section', targetId: 'financial-history' };
  }
  if (alerts.some((a) => a.kind === 'client_overdue')) {
    return { kind: 'section', targetId: 'financial-history' };
  }
  const failed = events.find((e) => e.type === 'invoice_failed' && e.ymd >= todayYmd);
  if (failed) {
    return { kind: 'section', targetId: 'financial-history' };
  }
  return { kind: 'section', targetId: 'financial-calendar' };
}

export function scrollToFinancialTarget(
  target: FinancialScrollTarget,
  behavior: ScrollBehavior = 'smooth'
): boolean {
  if (typeof document === 'undefined') return false;
  if (target.kind === 'section') {
    const el = document.getElementById(target.targetId);
    if (!el) return false;
    el.scrollIntoView({ behavior, block: 'start' });
    return true;
  }
  const el = document.getElementById(target.elementId);
  if (!el) return false;
  el.scrollIntoView({ behavior, block: 'center' });
  return true;
}

export function resolveAlertScrollTarget(
  alert: FinancialAlert,
  events: FinancialEvent[],
  todayYmd: string
): FinancialScrollTarget {
  if (alert.kind === 'client_overdue') {
    return { kind: 'section', targetId: 'financial-history' };
  }
  const failed = events.find((e) => e.type === 'invoice_failed');
  if (failed) {
    return { kind: 'section', targetId: 'financial-history' };
  }
  if (alert.kind === 'billing_missing' || alert.kind === 'gateway_failed') {
    return { kind: 'section', targetId: 'financial-history' };
  }
  return { kind: 'section', targetId: 'financial-calendar' };
}

export function alertOpensTimeline(alert: FinancialAlert): boolean {
  return alert.kind !== 'client_overdue';
}
