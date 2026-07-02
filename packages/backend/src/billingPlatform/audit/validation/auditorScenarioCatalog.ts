/**
 * Sprint 4.2A — Catálogo de cenários de validação do auditor.
 * Mapeia injeções propositais → códigos de detecção → reparos esperados.
 */

export type AuditorScenarioId =
  | 'missing_billing_plan'
  | 'missing_billing_items'
  | 'missing_next_billing_date'
  | 'duplicated_cycles'
  | 'invoice_orphan'
  | 'worker_processing_forever'
  | 'recoverable_failed_cycle'
  | 'timezone'
  | 'financial_integrity';

export type AuditorScenarioDefinition = {
  id: AuditorScenarioId;
  name: string;
  inject: string;
  detection_codes: string[];
  repair_actions: string[];
  audit_modules: string[];
  auto_repairable: boolean;
};

export const AUDITOR_SCENARIOS: AuditorScenarioDefinition[] = [
  {
    id: 'missing_billing_plan',
    name: 'Missing Billing Plan',
    inject: 'Assinatura ativa sem billing plan ativo',
    detection_codes: ['missing_billing_plan', 'legacy_missing_billing_plan'],
    repair_actions: ['billing_plan_provisioned', 'provisioned:'],
    audit_modules: ['migration', 'productionSubscriptions', 'runtime'],
    auto_repairable: true,
  },
  {
    id: 'missing_billing_items',
    name: 'Missing Billing Items',
    inject: 'Billing plan ativo sem billing_plan_items',
    detection_codes: ['plan_without_items', 'legacy_missing_billing_plan'],
    repair_actions: ['billing_plan_provisioned', 'provisioned:'],
    audit_modules: ['migration', 'runtime'],
    auto_repairable: true,
  },
  {
    id: 'missing_next_billing_date',
    name: 'Missing Next Billing Date',
    inject: 'next_billing_date = NULL em assinatura ativa',
    detection_codes: ['missing_next_billing_date', 'active_without_next_charge'],
    repair_actions: ['billing_plan_provisioned', 'normalized_invalid_next_billing_date'],
    audit_modules: ['productionSubscriptions', 'calendar', 'runtime'],
    auto_repairable: true,
  },
  {
    id: 'duplicated_cycles',
    name: 'Duplicated Cycles',
    inject: 'Dois subscription_cycles com a mesma cycle_date',
    detection_codes: ['duplicate_cycle', 'cycles_reconciliation_mismatch'],
    repair_actions: ['cycles_failed_to_pending:'],
    audit_modules: ['calendar', 'runtime'],
    auto_repairable: false,
  },
  {
    id: 'invoice_orphan',
    name: 'Invoice Orphan',
    inject: 'Invoice de assinatura sem subscription correspondente',
    detection_codes: ['orphan_subscription_invoices', 'orphan_invoice'],
    repair_actions: [],
    audit_modules: ['financial', 'runtime'],
    auto_repairable: false,
  },
  {
    id: 'worker_processing_forever',
    name: 'Worker Processing Forever',
    inject: 'Job em processing há mais de 30 minutos',
    detection_codes: ['stuck_processing_jobs'],
    repair_actions: ['stuck_retry_reset:'],
    audit_modules: ['worker', 'runtime'],
    auto_repairable: true,
  },
  {
    id: 'recoverable_failed_cycle',
    name: 'Recoverable Failed Cycle',
    inject: 'Cycle failed recuperável com competência futura',
    detection_codes: ['recoverable_failed_with_invoice'],
    repair_actions: ['cycles_failed_to_pending:', 'jobs_failed_to_pending:'],
    audit_modules: ['runtime'],
    auto_repairable: true,
  },
  {
    id: 'timezone',
    name: 'Timezone',
    inject: 'Matriz America/Sao_Paulo, UTC, UTC-4, UTC+2, viradas',
    detection_codes: ['sp_boundary_failed', 'utc_boundary_failed', 'invalid_timezone', 'ymd_normalize_mismatch'],
    repair_actions: [],
    audit_modules: ['timezone'],
    auto_repairable: false,
  },
  {
    id: 'financial_integrity',
    name: 'Financial Integrity',
    inject: 'Agregados MRR, receita e paridade invoices×cycles',
    detection_codes: ['orphan_subscription_invoices', 'cycles_reconciliation_mismatch'],
    repair_actions: [],
    audit_modules: ['financial', 'calendar', 'productionSubscriptions'],
    auto_repairable: false,
  },
];

export const STRESS_DATASET_TARGETS = [100, 1000, 5000] as const;

export const STRESS_OPERATIONS = [
  'generate_manual',
  'generate_automatic',
  'worker',
  'retry',
  'pause',
  'resume',
  'upgrade',
  'downgrade',
  'alterar_vencimento',
  'confirmar_pagamento',
  'advance_cycle',
] as const;
