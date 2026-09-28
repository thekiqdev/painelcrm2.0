/**
 * Classificação de erros do worker de renovação (B0.1).
 */
import { isAsaasInvalidCustomerError } from '../modules/gateways/asaas/asaasErrors.js';

export type RenewalErrorCategory =
  | 'CONFIGURATION_ERROR'
  | 'DATA_INCONSISTENCY'
  | 'TRANSIENT'
  | 'GATEWAY_ERROR'
  | 'PROGRAMMING_ERROR';

export type ClassifiedRenewalError = {
  category: RenewalErrorCategory;
  /** Erro permanente: não consumir retries — falha imediata. */
  permanent: boolean;
  message: string;
  reason_code: string;
  /** Retry normal quando não permanente. */
  should_retry: boolean;
  /** Log crítico (PROGRAMMING_ERROR). */
  critical_log: boolean;
};

export class RenewalHardeningError extends Error {
  readonly classification: ClassifiedRenewalError;

  constructor(classification: ClassifiedRenewalError) {
    super(classification.message);
    this.name = 'RenewalHardeningError';
    this.classification = classification;
  }
}

export function renewalHardeningError(
  message: string,
  reason_code: string,
  category: RenewalErrorCategory,
  permanent = category === 'CONFIGURATION_ERROR' || category === 'DATA_INCONSISTENCY'
): RenewalHardeningError {
  return new RenewalHardeningError({
    category,
    permanent,
    message,
    reason_code,
    should_retry: !permanent && (category === 'TRANSIENT' || category === 'GATEWAY_ERROR' || category === 'PROGRAMMING_ERROR'),
    critical_log: category === 'PROGRAMMING_ERROR',
  });
}

const PERMANENT_PATTERNS: { pattern: RegExp; reason_code: string; category: RenewalErrorCategory }[] = [
  {
    pattern: /customer_id|sem customer_id|client_id/i,
    reason_code: 'missing_customer_id',
    category: 'CONFIGURATION_ERROR',
  },
  {
    pattern: /fatura anterior|no_prior_invoice|template/i,
    reason_code: 'missing_previous_invoice_template',
    category: 'DATA_INCONSISTENCY',
  },
  {
    pattern: /current_period_start ausente|missing_current_period_start/i,
    reason_code: 'missing_current_period_start',
    category: 'DATA_INCONSISTENCY',
  },
  {
    pattern: /ciclo do job inválido|invalid.*date|invalid time value/i,
    reason_code: 'invalid_cycle_date',
    category: 'DATA_INCONSISTENCY',
  },
  {
    pattern: /subscription_not_active|sem plan_id|type_unsupported/i,
    reason_code: 'subscription_configuration',
    category: 'CONFIGURATION_ERROR',
  },
  {
    pattern: /tenant.*not found|subscription_not_found/i,
    reason_code: 'missing_tenant_or_subscription',
    category: 'CONFIGURATION_ERROR',
  },
];

const TRANSIENT_PATTERNS: RegExp[] = [
  /connection|timeout|ECONNRESET|ETIMEDOUT|deadlock|too many clients|503|502|504/i,
  /lock timeout|could not obtain lock/i,
];

export function classifyRenewalError(err: unknown): ClassifiedRenewalError {
  if (err instanceof RenewalHardeningError) {
    return err.classification;
  }

  const message = err instanceof Error ? err.message : String(err);

  if (isAsaasInvalidCustomerError(err)) {
    return {
      category: 'GATEWAY_ERROR',
      permanent: false,
      message,
      reason_code: 'gateway_invalid_customer',
      should_retry: true,
      critical_log: false,
    };
  }

  if (/gateway|createCharge|payment.*fail/i.test(message)) {
    return {
      category: 'GATEWAY_ERROR',
      permanent: false,
      message,
      reason_code: 'gateway_charge_failed',
      should_retry: true,
      critical_log: false,
    };
  }

  for (const p of PERMANENT_PATTERNS) {
    if (p.pattern.test(message)) {
      return {
        category: p.category,
        permanent: true,
        message,
        reason_code: p.reason_code,
        should_retry: false,
        critical_log: false,
      };
    }
  }

  for (const p of TRANSIENT_PATTERNS) {
    if (p.test(message)) {
      return {
        category: 'TRANSIENT',
        permanent: false,
        message,
        reason_code: 'transient_infrastructure',
        should_retry: true,
        critical_log: false,
      };
    }
  }

  if (err instanceof TypeError || err instanceof ReferenceError) {
    return {
      category: 'PROGRAMMING_ERROR',
      permanent: false,
      message,
      reason_code: 'programming_exception',
      should_retry: true,
      critical_log: true,
    };
  }

  return {
    category: 'TRANSIENT',
    permanent: false,
    message,
    reason_code: 'unknown_error',
    should_retry: true,
    critical_log: false,
  };
}

export function isPermanentRenewalError(err: unknown): boolean {
  return classifyRenewalError(err).permanent;
}

export function shouldRetryRenewalError(err: unknown, attempts: number, maxAttempts: number): boolean {
  const c = classifyRenewalError(err);
  if (c.permanent) return false;
  if (!c.should_retry) return false;
  return attempts < maxAttempts;
}
