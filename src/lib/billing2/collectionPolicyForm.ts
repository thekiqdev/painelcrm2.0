/**
 * Helpers da UI Cobrança Automática (Billing 2.0 Sprint 4).
 * Alinhado a PRD §7 / §18 e ao assertValidCollectionPolicyShape do backend.
 */

export type CollectionFailAction =
  | 'create_pix'
  | 'notify_whatsapp'
  | 'notify_email'
  | 'charge_card'
  | 'create_pix_automatic_instruction';

export type CollectionPolicyFormValues = {
  schema_version: 1;
  renew_card_auto: boolean;
  generate_pix_auto: boolean;
  pix_automatic_enabled: boolean;
  max_attempts: number;
  attempt_interval_days: number;
  suspend_after_days: number;
  cancel_after_days: number;
  notify_whatsapp: boolean;
  notify_email: boolean;
  generate_pix_after_failure: boolean;
  reactivate_on_paid: boolean;
  auto_suspend_enabled: boolean;
  auto_cancel_enabled: boolean;
  grace_period_days: number;
  actions_after_fail: CollectionFailAction[];
};

/** Defaults PRD §18 / buildDefaultCollectionPolicy */
export const DEFAULT_COLLECTION_POLICY_FORM: CollectionPolicyFormValues = {
  schema_version: 1,
  renew_card_auto: false,
  generate_pix_auto: true,
  pix_automatic_enabled: false,
  max_attempts: 3,
  attempt_interval_days: 2,
  suspend_after_days: 10,
  cancel_after_days: 30,
  notify_whatsapp: true,
  notify_email: true,
  generate_pix_after_failure: true,
  reactivate_on_paid: true,
  auto_suspend_enabled: false,
  auto_cancel_enabled: false,
  grace_period_days: 3,
  actions_after_fail: ['create_pix', 'notify_whatsapp', 'notify_email'],
};

export function buildActionsAfterFail(policy: CollectionPolicyFormValues): CollectionFailAction[] {
  const out: CollectionFailAction[] = [];
  if (policy.renew_card_auto) out.push('charge_card');
  if (policy.generate_pix_after_failure || policy.generate_pix_auto) out.push('create_pix');
  if (policy.pix_automatic_enabled) out.push('create_pix_automatic_instruction');
  if (policy.notify_whatsapp) out.push('notify_whatsapp');
  if (policy.notify_email) out.push('notify_email');
  return out.length > 0 ? out : ['notify_email'];
}

export function validateCollectionPolicyForm(
  policy: CollectionPolicyFormValues
): { ok: true } | { ok: false; error: string } {
  if (!Number.isFinite(policy.max_attempts) || policy.max_attempts < 1) {
    return { ok: false, error: 'Tentativas máximas deve ser ≥ 1' };
  }
  if (policy.max_attempts > 20) {
    return { ok: false, error: 'Tentativas máximas deve ser ≤ 20' };
  }
  if (!Number.isFinite(policy.attempt_interval_days) || policy.attempt_interval_days < 1) {
    return { ok: false, error: 'Intervalo entre tentativas deve ser ≥ 1 dia' };
  }
  if (policy.suspend_after_days > policy.cancel_after_days) {
    return {
      ok: false,
      error: 'Dias para suspender não pode ser maior que dias para cancelar',
    };
  }
  if (policy.grace_period_days < 0 || policy.grace_period_days > 90) {
    return { ok: false, error: 'Grace period inválido (0–90)' };
  }
  return { ok: true };
}

/** Preview textual (PRD §7) — uma frase legível para Financeiro. */
export function buildCollectionPolicyPreview(policy: CollectionPolicyFormValues): string {
  const parts: string[] = [];

  if (policy.renew_card_auto) {
    parts.push('na renovação tentamos cartão automaticamente');
  } else {
    parts.push('não renovamos cartão automaticamente');
  }

  if (policy.generate_pix_auto) {
    parts.push('geramos PIX na renovação');
  }

  if (policy.pix_automatic_enabled) {
    parts.push('Pix Automático (recorrente) está habilitado quando o gateway permitir');
  }

  const afterFail: string[] = [];
  if (policy.generate_pix_after_failure) afterFail.push('PIX');
  if (policy.notify_whatsapp) afterFail.push('WhatsApp');
  if (policy.notify_email) afterFail.push('e-mail');
  if (afterFail.length > 0) {
    parts.push(
      `após falha de cobrança (${policy.max_attempts} tentativas, a cada ${policy.attempt_interval_days} dia(s)) acionamos ${afterFail.join(' + ')}`
    );
  }

  if (policy.auto_suspend_enabled) {
    parts.push(`suspendemos o tenant após ${policy.suspend_after_days} dia(s) de inadimplência`);
  } else {
    parts.push('suspensão automática desligada');
  }

  if (policy.auto_cancel_enabled) {
    parts.push(`cancelamos a assinatura após ${policy.cancel_after_days} dia(s)`);
  } else {
    parts.push('cancelamento automático desligado');
  }

  if (policy.reactivate_on_paid) {
    parts.push('reativamos automaticamente após pagamento');
  }

  const body = parts.join('; ');
  return `Com esta config, ${body}.`;
}

export function normalizePolicyFromApi(raw: Partial<CollectionPolicyFormValues> | null | undefined): CollectionPolicyFormValues {
  const base = { ...DEFAULT_COLLECTION_POLICY_FORM };
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    schema_version: 1,
    actions_after_fail:
      Array.isArray(raw.actions_after_fail) && raw.actions_after_fail.length > 0
        ? (raw.actions_after_fail as CollectionFailAction[])
        : base.actions_after_fail,
  };
}
