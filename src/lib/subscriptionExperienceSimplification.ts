/**
 * Sprint 4.1F — layout simplificado do Centro Financeiro da assinatura.
 * Apenas metadados de IA / validação; sem lógica de billing.
 */

/** Seções removidas da página principal. */
export const REMOVED_SUBSCRIPTION_SECTIONS = [
  'financial-timeline',
  'financial-month-overview',
  'upcoming-payments',
  'central-financial-alerts',
  'financial-upcoming-agenda',
] as const;

export type RemovedSubscriptionSection = (typeof REMOVED_SUBSCRIPTION_SECTIONS)[number];

/** Blocos visíveis na nova hierarquia. */
export const SIMPLIFIED_PAGE_BLOCKS = [
  'header',
  'kpis',
  'calendar_sidebar',
  'financial_history',
  'insights',
  'settings',
  'technical',
] as const;

export type SimplifiedPageBlock = (typeof SIMPLIFIED_PAGE_BLOCKS)[number];

/** Conteúdo permitido na sidebar. */
export const SIDEBAR_BLOCKS = [
  'financial_summary',
  'next_event',
  'alerts',
] as const;

export type SidebarBlock = (typeof SIDEBAR_BLOCKS)[number];

/** Ações que pertencem ao accordion de configurações. */
export const SETTINGS_ACTION_IDS = [
  'edit',
  'pause',
  'cancel',
  'upgrade',
  'downgrade',
  'change_next_billing',
  'configure_cycles',
] as const;

export type SettingsActionId = (typeof SETTINGS_ACTION_IDS)[number];

/** IDs de scroll válidos após simplificação. */
export const SIMPLIFIED_SCROLL_TARGETS = [
  'financial-calendar',
  'financial-history',
  'financial-technical',
] as const;

export const SIMPLIFIED_SECTION_GAP = 'space-y-8';

export function isRemovedSection(sectionId: string): sectionId is RemovedSubscriptionSection {
  return (REMOVED_SUBSCRIPTION_SECTIONS as readonly string[]).includes(sectionId);
}

export function isValidSimplifiedScrollTarget(targetId: string): boolean {
  return (SIMPLIFIED_SCROLL_TARGETS as readonly string[]).includes(targetId);
}

export function validatesSimplifiedLayout(visibleSectionIds: string[]): boolean {
  const removed = visibleSectionIds.filter(isRemovedSection);
  if (removed.length > 0) return false;
  return visibleSectionIds.includes('financial-calendar') && visibleSectionIds.includes('financial-history');
}

export function sidebarHasSubscriptionActions(blocks: string[]): boolean {
  const forbidden = ['edit_subscription', 'pause', 'cancel', 'subscription_actions'];
  return blocks.some((b) => forbidden.includes(b));
}

export function hasCentralAlertDuplicate(showCentralAlerts: boolean, showSidebarAlerts: boolean): boolean {
  return showCentralAlerts && showSidebarAlerts;
}

export function centralAlertsAllowed(showCentralAlerts: boolean): boolean {
  return !showCentralAlerts;
}

export function mobileSectionOrder(): string[] {
  return [
    'header',
    'kpis',
    'calendar',
    'sidebar',
    'history',
    'insights',
    'settings',
    'technical',
  ];
}

export function settingsIncludesAction(
  enabledActions: SettingsActionId[],
  actionId: SettingsActionId
): boolean {
  return enabledActions.includes(actionId);
}

export function upcomingAgendaReplacesSections(): RemovedSubscriptionSection[] {
  return ['financial-timeline', 'upcoming-payments', 'financial-upcoming-agenda'];
}

export function calendarReplacesMonthlyOverview(): boolean {
  return isRemovedSection('financial-month-overview');
}
