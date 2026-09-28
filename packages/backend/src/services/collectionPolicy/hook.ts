/**
 * Extension point Collection Policy (Sprint 3).
 *
 * Flag `collection_policy_engine_enabled` OFF (default) → no-op imediato (legado puro).
 * Flag ON → interpret + execute actions (destrutivas ainda OFF por flags/policy defaults).
 */
import { isBilling2FlagEnabled } from '../billing2/billingFeatureFlags.js';
import { billingLog } from '../billingLogger.js';
import { getActiveCollectionPolicy } from './reader.js';
import { interpretCollectionPolicy } from './interpret.js';
import { executeCollectionActions, type CollectionActionExecResult } from './execute.js';
import type { CollectionAction, CollectionEvent } from './types.js';

export type CollectionPolicyHookResult = {
  skipped: boolean;
  reason: 'engine_disabled' | 'executed' | 'interpreted_empty' | 'error';
  actions: CollectionAction[];
  results?: CollectionActionExecResult[];
};

/**
 * Hook seguro: nunca lança; falha de action individual é fail-open.
 */
export async function runCollectionPolicyExtensionPoint(
  event: CollectionEvent
): Promise<CollectionPolicyHookResult> {
  try {
    if (!(await isBilling2FlagEnabled('collection_policy_engine_enabled'))) {
      return { skipped: true, reason: 'engine_disabled', actions: [] };
    }

    const { policy } = await getActiveCollectionPolicy();
    const actions = interpretCollectionPolicy(event, policy, {
      engine_enabled: true,
      correlation_id: event.correlation_id,
    });

    if (actions.length === 0) {
      if (await isBilling2FlagEnabled('detailed_logs')) {
        billingLog('job', 'collection_policy_extension', {
          event_type: event.type,
          actions_count: 0,
          correlation_id: event.correlation_id ?? '',
          billing_id: event.billing_id ?? '',
          subscription_id: event.subscription_id ?? '',
        });
      }
      return { skipped: false, reason: 'interpreted_empty', actions: [] };
    }

    const exec = await executeCollectionActions(actions, event, policy);

    if (await isBilling2FlagEnabled('detailed_logs')) {
      billingLog('job', 'collection_policy_extension', {
        event_type: event.type,
        actions_count: actions.length,
        executed_count: exec.executed_count,
        skipped_count: exec.skipped_count,
        error_count: exec.error_count,
        correlation_id: event.correlation_id ?? '',
        billing_id: event.billing_id ?? '',
        subscription_id: event.subscription_id ?? '',
      });
    }

    return {
      skipped: false,
      reason: 'executed',
      actions,
      results: exec.results,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[collectionPolicy] extension point error (ignored)', msg);
    return { skipped: true, reason: 'error', actions: [] };
  }
}

/** Fire-and-forget para não atrasar renovação/webhook. */
export function scheduleCollectionPolicyExtensionPoint(event: CollectionEvent): void {
  void runCollectionPolicyExtensionPoint(event);
}

/**
 * True quando o engine deve assumir notify (evita dupla publicação com o caminho legado).
 * Com flag OFF, o legado continua responsável.
 */
export async function shouldCollectionPolicyOwnNotifications(): Promise<boolean> {
  return isBilling2FlagEnabled('collection_policy_engine_enabled');
}
