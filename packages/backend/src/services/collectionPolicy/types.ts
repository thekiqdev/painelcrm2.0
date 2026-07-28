/**
 * Billing 2.0 — Collection Policy contracts (Sprint 1).
 * @see docs/architecture/commercial/PRD_BILLING_2_SUPERADMIN.md §6–§7
 * @see docs/architecture/commercial/IMPLEMENTATION_PLAN_BILLING_2.md Sprint 1
 */

/** Versão do schema JSON da policy (bump em mudanças incompatíveis). */
export const COLLECTION_POLICY_SCHEMA_VERSION = 1 as const;

export type CollectionFailAction =
  | 'create_pix'
  | 'notify_whatsapp'
  | 'notify_email'
  | 'charge_card'
  | 'create_pix_automatic_instruction';

/**
 * Política global de cobrança automática (PRD §7).
 * Persistência em Sprint 2; Sprint 1 = defaults em memória.
 */
export type CollectionPolicy = {
  schema_version: typeof COLLECTION_POLICY_SCHEMA_VERSION;
  /** Renovar cartão automaticamente (token) — default OFF */
  renew_card_auto: boolean;
  /** Gerar PIX avulso automaticamente — default ON (fluxo atual) */
  generate_pix_auto: boolean;
  /** PIX Recorrente / Pix Automático Asaas — default OFF */
  pix_automatic_enabled: boolean;
  max_attempts: number;
  attempt_interval_days: number;
  suspend_after_days: number;
  cancel_after_days: number;
  notify_whatsapp: boolean;
  notify_email: boolean;
  /** Gerar novo PIX após falha de cartão/instrução */
  generate_pix_after_failure: boolean;
  reactivate_on_paid: boolean;
  /**
   * Suspensão automática por inadimplência (Billing 2.0).
   * Default OFF (PRD §18). Independente do setting legado `billing_auto_suspend_enabled`.
   */
  auto_suspend_enabled: boolean;
  /** Cancelamento automático — default OFF */
  auto_cancel_enabled: boolean;
  /** Grace copiado de billing settings / subscription (informativo até S8) */
  grace_period_days: number;
  /** Ações sugeridas após falha (ordenadas) */
  actions_after_fail: CollectionFailAction[];
};

export type CollectionEventType =
  | 'renewal.due'
  | 'renewal.charge_created'
  | 'payment.failed'
  | 'payment.overdue'
  | 'payment.paid'
  | 'pix_automatic.instruction_refused'
  | 'pix_automatic.authorization_lost'
  | 'grace.elapsed'
  | 'cancel.threshold_elapsed';

export type CollectionEvent = {
  type: CollectionEventType;
  occurred_at: string;
  tenant_id?: string;
  subscription_id?: string;
  billing_id?: string;
  job_id?: string;
  correlation_id?: string;
  attempt?: number;
  metadata?: Record<string, string | number | boolean | null>;
};

export type CollectionActionType =
  | 'charge_card'
  | 'create_pix'
  | 'create_pix_automatic_instruction'
  | 'notify_whatsapp'
  | 'notify_email'
  | 'suspend_tenant'
  | 'mark_subscription_past_due'
  | 'cancel_subscription'
  | 'reactivate_tenant'
  | 'write_audit_log';

export type CollectionAction = {
  type: CollectionActionType;
  /** Idempotency hint: entity + action + cycle + attempt (Sprint 3+) */
  idempotency_key?: string;
  reason?: string;
  params?: Record<string, string | number | boolean | null>;
};

export type CollectionInterpretContext = {
  correlation_id?: string;
  /** Quando false, interpretador retorna [] (engine desligado). */
  engine_enabled: boolean;
};
