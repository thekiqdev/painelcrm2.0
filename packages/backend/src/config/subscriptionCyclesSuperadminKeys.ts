/**
 * Feature flags globais (Etapa 1 — `141_subscription_cycles_phase1.sql`; defaults ativos + `143_*.sql`).
 * Valores em `superadmin_settings.value`: típicamente `'true'` | `'false'`.
 * Controlo: painel Super Admin (`subscriptionCyclesSuperadminSettingsService` + rota billing/subscription-cycles-flags).
 */
export const SUBSCRIPTION_CYCLES_SUPERADMIN_KEYS = {
  read: 'subscription_cycles_read',
  write: 'subscription_cycles_write',
} as const;
