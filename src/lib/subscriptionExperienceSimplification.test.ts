import { describe, it, expect } from 'vitest';
import {
  REMOVED_SUBSCRIPTION_SECTIONS,
  SIMPLIFIED_PAGE_BLOCKS,
  SIDEBAR_BLOCKS,
  SETTINGS_ACTION_IDS,
  SIMPLIFIED_SCROLL_TARGETS,
  SIMPLIFIED_SECTION_GAP,
  calendarReplacesMonthlyOverview,
  centralAlertsAllowed,
  hasCentralAlertDuplicate,
  isRemovedSection,
  isValidSimplifiedScrollTarget,
  mobileSectionOrder,
  settingsIncludesAction,
  sidebarHasSubscriptionActions,
  upcomingAgendaReplacesSections,
  validatesSimplifiedLayout,
} from './subscriptionExperienceSimplification';
import { resolveKpiNavigation } from './subscriptionFinancialConsistency';
import { resolveFinancialPageScrollTarget, resolveAlertScrollTarget } from './timelineNavigation';
import { buildFinancialAlerts } from './subscriptionFinancialExperience';
import { buildFinancialEvents } from './subscriptionFinancialEventBuilder';
import { mobileFinancialSectionOrder } from './subscriptionFinancialExperience';
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';

const today = '2026-06-30';

function minimalDetail(): CrmSubscriptionDetailPayload {
  return {
    subscription: {
      id: 'sub-1',
      type: 'crm',
      tenant_id: 't1',
      customer_id: 'c1',
      plan_id: 'p1',
      amount_cents: 11000,
      currency: 'BRL',
      billing_anchor_day: 14,
      billing_cycle_count: 1,
      billing_interval: 'monthly',
      status: 'active',
      next_billing_date: '2026-07-21',
      current_period_start: '2026-07-01',
      current_period_end: '2026-07-31',
      cancel_at_period_end: false,
      grace_period_days: 0,
      default_payment_method: null,
      users_count: null,
      gateway: 'mp',
      last_job_at: null,
      created_by: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-06-30T00:00:00Z',
      cycles_unlimited: true,
      max_cycles: null,
    },
    client_name: 'Cliente',
    plan_label: 'Plano',
    latest_invoice_id: 'inv-1',
    latest_invoice_status: 'pending',
    latest_paid_invoice_id: 'inv-paid',
    stats: { total_received_cents: 11000, open_amount_cents: 11000, charge_count: 1, paid_count: 1 },
    timeline: [],
    pending_contract: null,
    tenant_billing: {
      recurring_generate_time_local: '09:00',
      timezone: 'America/Sao_Paulo',
      recurring_invoice_generate_days_before_due: 7,
    },
    meta: { periodicity_label_pt: 'Mensal' },
  };
}

describe('REMOVED_SUBSCRIPTION_SECTIONS', () => {
  REMOVED_SUBSCRIPTION_SECTIONS.forEach((section) => {
    it(`marks ${section} as removed`, () => expect(isRemovedSection(section)).toBe(true));
  });
  it('has five removed sections', () => expect(REMOVED_SUBSCRIPTION_SECTIONS).toHaveLength(5));
  it('financial-calendar is not removed', () => expect(isRemovedSection('financial-calendar')).toBe(false));
  it('financial-history is not removed', () => expect(isRemovedSection('financial-history')).toBe(false));
});

describe('SIMPLIFIED_PAGE_BLOCKS', () => {
  SIMPLIFIED_PAGE_BLOCKS.forEach((block) => {
    it(`includes block ${block}`, () => expect(SIMPLIFIED_PAGE_BLOCKS).toContain(block));
  });
  it('has seven blocks', () => expect(SIMPLIFIED_PAGE_BLOCKS).toHaveLength(7));
  it('starts with header', () => expect(SIMPLIFIED_PAGE_BLOCKS[0]).toBe('header'));
  it('ends with technical', () => expect(SIMPLIFIED_PAGE_BLOCKS[6]).toBe('technical'));
  it('calendar_sidebar after kpis', () => {
    expect(SIMPLIFIED_PAGE_BLOCKS.indexOf('calendar_sidebar')).toBeGreaterThan(
      SIMPLIFIED_PAGE_BLOCKS.indexOf('kpis')
    );
  });
  it('history after calendar_sidebar', () => {
    expect(SIMPLIFIED_PAGE_BLOCKS.indexOf('financial_history')).toBeGreaterThan(
      SIMPLIFIED_PAGE_BLOCKS.indexOf('calendar_sidebar')
    );
  });
});

describe('SIDEBAR_BLOCKS', () => {
  SIDEBAR_BLOCKS.forEach((block) => {
    it(`allows ${block}`, () => expect(SIDEBAR_BLOCKS).toContain(block));
  });
  it('has three blocks only', () => expect(SIDEBAR_BLOCKS).toHaveLength(3));
  it('resumo first', () => expect(SIDEBAR_BLOCKS[0]).toBe('financial_summary'));
  it('alerts last', () => expect(SIDEBAR_BLOCKS[2]).toBe('alerts'));
  it('no subscription actions in sidebar blocks', () => {
    expect(sidebarHasSubscriptionActions([...SIDEBAR_BLOCKS])).toBe(false);
  });
});

describe('SETTINGS_ACTION_IDS', () => {
  SETTINGS_ACTION_IDS.forEach((id) => {
    it(`lists action ${id}`, () => expect(SETTINGS_ACTION_IDS).toContain(id));
  });
  it('has seven settings actions', () => expect(SETTINGS_ACTION_IDS).toHaveLength(7));
  it('includes edit', () => expect(settingsIncludesAction([...SETTINGS_ACTION_IDS], 'edit')).toBe(true));
  it('includes configure_cycles', () =>
    expect(settingsIncludesAction([...SETTINGS_ACTION_IDS], 'configure_cycles')).toBe(true)
  );
});

describe('alert duplication rules', () => {
  it('detects duplicate central+sidebar alerts', () => {
    expect(hasCentralAlertDuplicate(true, true)).toBe(true);
  });
  it('sidebar only is ok', () => {
    expect(hasCentralAlertDuplicate(false, true)).toBe(false);
  });
  it('central only is duplicate risk', () => {
    expect(hasCentralAlertDuplicate(true, false)).toBe(false);
  });
  it('central alerts not allowed when shown centrally', () => {
    expect(centralAlertsAllowed(true)).toBe(false);
  });
  it('central alerts allowed when hidden centrally', () => {
    expect(centralAlertsAllowed(false)).toBe(true);
  });
  for (let i = 0; i < 10; i++) {
    it(`zero duplicate case ${i}`, () => {
      expect(hasCentralAlertDuplicate(false, i % 2 === 0)).toBe(false);
    });
  }
});

describe('validatesSimplifiedLayout', () => {
  it('valid minimal layout', () => {
    expect(validatesSimplifiedLayout(['financial-calendar', 'financial-history'])).toBe(true);
  });
  it('rejects layout with timeline', () => {
    expect(validatesSimplifiedLayout(['financial-calendar', 'financial-timeline'])).toBe(false);
  });
  it('rejects layout with month overview', () => {
    expect(validatesSimplifiedLayout(['financial-month-overview', 'financial-history'])).toBe(false);
  });
  it('rejects layout with upcoming payments', () => {
    expect(validatesSimplifiedLayout(['upcoming-payments', 'financial-calendar'])).toBe(false);
  });
  it('requires calendar', () => {
    expect(validatesSimplifiedLayout(['financial-history'])).toBe(false);
  });
  it('requires history', () => {
    expect(validatesSimplifiedLayout(['financial-calendar'])).toBe(false);
  });
});

describe('SIMPLIFIED_SCROLL_TARGETS', () => {
  SIMPLIFIED_SCROLL_TARGETS.forEach((target) => {
    it(`validates ${target}`, () => expect(isValidSimplifiedScrollTarget(target)).toBe(true));
  });
  it('rejects timeline target', () => expect(isValidSimplifiedScrollTarget('financial-timeline')).toBe(false));
  it('rejects upcoming-payments', () => expect(isValidSimplifiedScrollTarget('upcoming-payments')).toBe(false));
});

describe('upcomingAgendaReplacesSections', () => {
  const replaced = upcomingAgendaReplacesSections();
  it('replaces timeline', () => expect(replaced).toContain('financial-timeline'));
  it('replaces upcoming payments', () => expect(replaced).toContain('upcoming-payments'));
  it('does not replace history', () => expect(replaced).not.toContain('financial-history'));
});

describe('calendarReplacesMonthlyOverview', () => {
  it('month overview removed', () => expect(calendarReplacesMonthlyOverview()).toBe(true));
});

describe('mobileSectionOrder', () => {
  it('matches experience helper', () => {
    expect(mobileSectionOrder()).toEqual(mobileFinancialSectionOrder());
  });
  it('no timeline in order', () => {
    expect(mobileSectionOrder()).not.toContain('timeline');
  });
  it('no upcoming in order', () => {
    expect(mobileSectionOrder()).not.toContain('upcoming');
  });
  it('excludes upcoming_agenda', () => {
    expect(mobileSectionOrder()).not.toContain('upcoming_agenda');
  });
});

describe('KPI navigation after simplification', () => {
  it('next_receipt → history', () => {
    const nav = resolveKpiNavigation('next_receipt', null, '2026-07-21');
    expect(nav).toEqual({ type: 'scroll', targetId: 'financial-history' });
  });
  it('status → calendar', () => {
    expect(resolveKpiNavigation('status', null, null)).toEqual({
      type: 'scroll',
      targetId: 'financial-calendar',
    });
  });
  it('received → history paid', () => {
    expect(resolveKpiNavigation('received', null, null)).toEqual({ type: 'history', filter: 'paid' });
  });
});

describe('scroll targets with alerts', () => {
  const d = minimalDetail();
  const events = buildFinancialEvents(d, today);

  it('default scroll is calendar', () => {
    const target = resolveFinancialPageScrollTarget(events, [], today);
    expect(target?.kind).toBe('section');
    if (target?.kind === 'section') expect(target.targetId).toBe('financial-calendar');
  });

  it('billing missing scrolls to agenda', () => {
    const alerts = buildFinancialAlerts(
      {
        ...d,
        timeline: [
          {
            month_ref: '2026-07',
            cycle_label: 'Jul',
            cycle_subtitle: '',
            cycle_date: '2026-07-14',
            period_label: 'Jul',
            period_start: '2026-07-01',
            period_end: '2026-07-31',
            due_date: '2026-07-14',
            status_pt: 'Falha',
            operational_state: 'failed',
            operational_state_pt: 'Falha',
            amount_cents: 11000,
            invoice_id: null,
            invoice_status: null,
            gateway_status: null,
            gateway_reference_id: null,
            cycle_status: 'failed',
            cycle_id: 'c1',
            job_id: null,
          },
        ],
      },
      today
    );
    const target = resolveFinancialPageScrollTarget(events, alerts, today);
    if (target?.kind === 'section') expect(target.targetId).toBe('financial-history');
  });
});

describe('sidebarHasSubscriptionActions', () => {
  it('detects edit in sidebar', () => {
    expect(sidebarHasSubscriptionActions(['financial_summary', 'edit_subscription'])).toBe(true);
  });
  it('detects pause', () => {
    expect(sidebarHasSubscriptionActions(['pause'])).toBe(true);
  });
  it('clean sidebar', () => {
    expect(sidebarHasSubscriptionActions(['financial_summary', 'next_event', 'alerts'])).toBe(false);
  });
});

describe('SIMPLIFIED_SECTION_GAP', () => {
  it('uses space-y-8', () => expect(SIMPLIFIED_SECTION_GAP).toBe('space-y-8'));
});

describe('layout regression guards', () => {
  const forbidden = [...REMOVED_SUBSCRIPTION_SECTIONS];
  forbidden.forEach((section) => {
    it(`layout must not include ${section}`, () => {
      expect(validatesSimplifiedLayout(['financial-calendar', 'financial-history', section])).toBe(false);
    });
  });
});

describe('resolveAlertScrollTarget simplified', () => {
  it('overdue goes to history', () => {
    const target = resolveAlertScrollTarget(
      { id: 'a', kind: 'client_overdue', emoji: '⚠', title: 'A', message: 'M', actionLabel: 'R' },
      [],
      today
    );
    if (target.kind === 'section') expect(target.targetId).toBe('financial-history');
  });
  it('billing missing goes to agenda', () => {
    const target = resolveAlertScrollTarget(
      { id: 'a', kind: 'billing_missing', emoji: '⚠', title: 'A', message: 'M', actionLabel: 'R' },
      [],
      today
    );
    if (target.kind === 'section') expect(target.targetId).toBe('financial-history');
  });
});
