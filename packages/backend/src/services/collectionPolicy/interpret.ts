/**
 * Interpretador Collection Policy — Event → Actions (Sprint 3).
 * Determinístico: mesmos evento + policy + contexto → mesmas actions.
 * Feature flags de rollout são aplicadas nos executores (não aqui).
 */
import {
  buildCollectionActionIdempotencyKey,
  resolveCycleKey,
  resolveEntityForAction,
} from './idempotency.js';
import type {
  CollectionAction,
  CollectionActionType,
  CollectionEvent,
  CollectionFailAction,
  CollectionInterpretContext,
  CollectionPolicy,
} from './types.js';

function pushAction(
  out: CollectionAction[],
  event: CollectionEvent,
  type: CollectionActionType,
  reason: string,
  params?: CollectionAction['params']
): void {
  const { entityType, entityId } = resolveEntityForAction(event);
  const cycleKey = resolveCycleKey(event);
  const attempt = event.attempt != null && event.attempt > 0 ? Math.floor(event.attempt) : 1;
  out.push({
    type,
    reason,
    params,
    idempotency_key: buildCollectionActionIdempotencyKey({
      entityType,
      entityId,
      action: type,
      cycleKey,
      attempt,
    }),
  });
}

function failActionToCollection(a: CollectionFailAction): CollectionActionType | null {
  switch (a) {
    case 'create_pix':
      return 'create_pix';
    case 'notify_whatsapp':
      return 'notify_whatsapp';
    case 'notify_email':
      return 'notify_email';
    case 'charge_card':
      return 'charge_card';
    case 'create_pix_automatic_instruction':
      return 'create_pix_automatic_instruction';
    default:
      return null;
  }
}

function isFailActionAllowed(policy: CollectionPolicy, fail: CollectionFailAction): boolean {
  switch (fail) {
    case 'charge_card':
      return policy.renew_card_auto === true;
    case 'create_pix':
      return policy.generate_pix_auto === true || policy.generate_pix_after_failure === true;
    case 'create_pix_automatic_instruction':
      return policy.pix_automatic_enabled === true;
    case 'notify_whatsapp':
      return policy.notify_whatsapp === true;
    case 'notify_email':
      return policy.notify_email === true;
    default:
      return false;
  }
}

function appendNotifyActions(
  out: CollectionAction[],
  event: CollectionEvent,
  policy: CollectionPolicy,
  reason: string
): void {
  if (policy.notify_whatsapp) {
    pushAction(out, event, 'notify_whatsapp', reason);
  }
  if (policy.notify_email) {
    pushAction(out, event, 'notify_email', reason);
  }
}

/**
 * Interpreta evento + policy → lista de actions.
 */
export function interpretCollectionPolicy(
  event: CollectionEvent,
  policy: CollectionPolicy,
  context: CollectionInterpretContext
): CollectionAction[] {
  if (!context.engine_enabled) {
    return [];
  }

  const out: CollectionAction[] = [];
  const zeroSettlement = event.metadata?.zero_settlement === true;

  switch (event.type) {
    case 'renewal.due':
    case 'renewal.charge_created': {
      if (zeroSettlement) {
        pushAction(out, event, 'write_audit_log', 'zero_settlement_skip_charge');
        break;
      }
      // Policy “só WhatsApp+Email” → sem charge_card / sem pix se generate_pix_auto OFF
      if (policy.renew_card_auto) {
        pushAction(out, event, 'charge_card', 'renew_card_auto');
      }
      if (policy.generate_pix_auto) {
        pushAction(out, event, 'create_pix', 'generate_pix_auto');
      }
      if (policy.pix_automatic_enabled) {
        pushAction(out, event, 'create_pix_automatic_instruction', 'pix_automatic_enabled');
      }
      appendNotifyActions(out, event, policy, event.type);
      pushAction(out, event, 'write_audit_log', 'renewal_interpreted');
      break;
    }

    case 'payment.failed': {
      for (const fail of policy.actions_after_fail) {
        if (!isFailActionAllowed(policy, fail)) continue;
        const mapped = failActionToCollection(fail);
        if (!mapped) continue;
        pushAction(out, event, mapped, 'actions_after_fail');
      }
      pushAction(out, event, 'write_audit_log', 'payment_failed_interpreted');
      break;
    }

    case 'payment.overdue': {
      appendNotifyActions(out, event, policy, 'payment_overdue');
      pushAction(out, event, 'mark_subscription_past_due', 'payment_overdue');
      if (policy.auto_suspend_enabled) {
        pushAction(out, event, 'suspend_tenant', 'auto_suspend_enabled');
      }
      if (policy.auto_cancel_enabled) {
        pushAction(out, event, 'cancel_subscription', 'auto_cancel_enabled');
      }
      pushAction(out, event, 'write_audit_log', 'payment_overdue_interpreted');
      break;
    }

    case 'payment.paid': {
      if (policy.reactivate_on_paid) {
        pushAction(out, event, 'reactivate_tenant', 'reactivate_on_paid');
      }
      pushAction(out, event, 'write_audit_log', 'payment_paid_interpreted');
      break;
    }

    case 'grace.elapsed': {
      if (policy.auto_suspend_enabled) {
        pushAction(out, event, 'suspend_tenant', 'grace_elapsed');
      }
      appendNotifyActions(out, event, policy, 'grace_elapsed');
      pushAction(out, event, 'write_audit_log', 'grace_elapsed_interpreted');
      break;
    }

    case 'cancel.threshold_elapsed': {
      if (policy.auto_cancel_enabled) {
        pushAction(out, event, 'cancel_subscription', 'cancel_threshold_elapsed');
      }
      pushAction(out, event, 'write_audit_log', 'cancel_threshold_interpreted');
      break;
    }

    case 'pix_automatic.instruction_refused':
    case 'pix_automatic.authorization_lost': {
      if (policy.generate_pix_after_failure || policy.generate_pix_auto) {
        pushAction(out, event, 'create_pix', 'pix_automatic_fallback');
      }
      appendNotifyActions(out, event, policy, event.type);
      pushAction(out, event, 'write_audit_log', 'pix_automatic_event');
      break;
    }

    default:
      pushAction(out, event, 'write_audit_log', 'unknown_event');
      break;
  }

  return out;
}
