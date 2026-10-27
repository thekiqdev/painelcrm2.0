import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import commonPt from '@/locales/pt-BR/common.json';
import commonEn from '@/locales/en/common.json';
import commonEs from '@/locales/es/common.json';
import landingPt from '@/locales/pt-BR/landing.json';
import landingEn from '@/locales/en/landing.json';
import landingEs from '@/locales/es/landing.json';
import authPt from '@/locales/pt-BR/auth.json';
import authEn from '@/locales/en/auth.json';
import authEs from '@/locales/es/auth.json';
import checkoutPt from '@/locales/pt-BR/checkout.json';
import checkoutEn from '@/locales/en/checkout.json';
import checkoutEs from '@/locales/es/checkout.json';
import legalPt from '@/locales/pt-BR/legal.json';
import legalEn from '@/locales/en/legal.json';
import legalEs from '@/locales/es/legal.json';
import navPt from '@/locales/pt-BR/nav.json';
import navEn from '@/locales/en/nav.json';
import navEs from '@/locales/es/nav.json';
import dashboardPt from '@/locales/pt-BR/dashboard.json';
import dashboardEn from '@/locales/en/dashboard.json';
import dashboardEs from '@/locales/es/dashboard.json';
import crmPt from '@/locales/pt-BR/crm.json';
import crmEn from '@/locales/en/crm.json';
import crmEs from '@/locales/es/crm.json';
import chatPt from '@/locales/pt-BR/chat.json';
import chatEn from '@/locales/en/chat.json';
import chatEs from '@/locales/es/chat.json';
import agendaPt from '@/locales/pt-BR/agenda.json';
import agendaEn from '@/locales/en/agenda.json';
import agendaEs from '@/locales/es/agenda.json';
import ticketsPt from '@/locales/pt-BR/tickets.json';
import ticketsEn from '@/locales/en/tickets.json';
import ticketsEs from '@/locales/es/tickets.json';
import settingsPt from '@/locales/pt-BR/settings.json';
import settingsEn from '@/locales/en/settings.json';
import settingsEs from '@/locales/es/settings.json';
import financePt from '@/locales/pt-BR/finance.json';
import financeEn from '@/locales/en/finance.json';
import financeEs from '@/locales/es/finance.json';
import contractsPt from '@/locales/pt-BR/contracts.json';
import contractsEn from '@/locales/en/contracts.json';
import contractsEs from '@/locales/es/contracts.json';
import proposalsPt from '@/locales/pt-BR/proposals.json';
import proposalsEn from '@/locales/en/proposals.json';
import proposalsEs from '@/locales/es/proposals.json';
import storePt from '@/locales/pt-BR/store.json';
import storeEn from '@/locales/en/store.json';
import storeEs from '@/locales/es/store.json';
import automationPt from '@/locales/pt-BR/automation.json';
import automationEn from '@/locales/en/automation.json';
import automationEs from '@/locales/es/automation.json';
import superadminPt from '@/locales/pt-BR/superadmin.json';
import superadminEn from '@/locales/en/superadmin.json';
import superadminEs from '@/locales/es/superadmin.json';
import partnerPt from '@/locales/pt-BR/partner.json';
import partnerEn from '@/locales/en/partner.json';
import partnerEs from '@/locales/es/partner.json';

const NS = ['common', 'landing', 'auth', 'checkout', 'legal', 'nav', 'dashboard', 'crm', 'chat', 'agenda', 'tickets', 'settings', 'finance', 'contracts', 'proposals', 'store', 'automation', 'superadmin', 'partner'] as const;

void i18n.use(initReactI18next).init({
  resources: {
    'pt-BR': {
      common: commonPt, landing: landingPt, auth: authPt, checkout: checkoutPt, legal: legalPt,
      nav: navPt, dashboard: dashboardPt, crm: crmPt, chat: chatPt, agenda: agendaPt, tickets: ticketsPt, settings: settingsPt,
      finance: financePt, contracts: contractsPt, proposals: proposalsPt, store: storePt, automation: automationPt,
      superadmin: superadminPt, partner: partnerPt,
    },
    en: {
      common: commonEn, landing: landingEn, auth: authEn, checkout: checkoutEn, legal: legalEn,
      nav: navEn, dashboard: dashboardEn, crm: crmEn, chat: chatEn, agenda: agendaEn, tickets: ticketsEn, settings: settingsEn,
      finance: financeEn, contracts: contractsEn, proposals: proposalsEn, store: storeEn, automation: automationEn,
      superadmin: superadminEn, partner: partnerEn,
    },
    es: {
      common: commonEs, landing: landingEs, auth: authEs, checkout: checkoutEs, legal: legalEs,
      nav: navEs, dashboard: dashboardEs, crm: crmEs, chat: chatEs, agenda: agendaEs, tickets: ticketsEs, settings: settingsEs,
      finance: financeEs, contracts: contractsEs, proposals: proposalsEs, store: storeEs, automation: automationEs,
      superadmin: superadminEs, partner: partnerEs,
    },
  },
  lng: 'pt-BR',
  fallbackLng: 'pt-BR',
  supportedLngs: ['pt-BR', 'en', 'es'],
  ns: [...NS],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
});

export default i18n;
