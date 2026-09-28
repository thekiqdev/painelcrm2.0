/**
 * F6.5 — useStableSelector: useSyncExternalStore com equality (skip notify).
 *
 * Contrato crítico do React: getSnapshot DEVE devolver a mesma referência
 * (Object.is) entre chamadas consecutivas se o store não mudou. Caso contrário
 * ocorre "Maximum update depth exceeded".
 */

import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { ChatDomainState } from '../types';
import { shouldUseChatDomainStore } from '../flags';
import { ensureChatDomainStoreSession, getChatDomainStoreSession } from '../session';
import { EMPTY_CHAT_DOMAIN_STATE } from '../state';
import {
  recordSelectorHit,
  recordSelectorMiss,
  recordSubscriptionSkip,
} from '../../metrics/renderOptimizationMetrics';
import { recordConversationSelectorUpdate } from '../../metrics/conversationRuntimeMetrics';
import { recordStoreSubscription } from '../consolidatedMetrics';
import {
  recordSubscriptionAttach,
  recordSubscriptionNotify,
} from '../../metrics/subscriptionMetrics';
import { recordSocketUiFlush } from '../../metrics/socketMetrics';
import type { EqualityFn } from '../selectorMemo';

export type UseStableSelectorOptions<T> = {
  enabled?: boolean;
  equalityFn?: EqualityFn<T>;
  /** Nome para telemetria / attach. */
  name?: string;
  /** Quando false, não registra métricas de subscription socket/UI. */
  trackSubscription?: boolean;
};

type SnapshotCache<T> = {
  state: ChatDomainState | null;
  value: T;
  primed: boolean;
};

/**
 * Assina o Domain Store e só notifica React quando o valor selecionado muda
 * segundo `equalityFn` (default: Object.is).
 */
export function useStableSelector<T>(
  selector: (state: ChatDomainState) => T,
  options?: UseStableSelectorOptions<T>,
): T {
  const enabled = (options?.enabled ?? true) && shouldUseChatDomainStore();
  const equalityFn = options?.equalityFn ?? (Object.is as EqualityFn<T>);
  const name = options?.name ?? 'useStableSelector';
  const trackSubscription = options?.trackSubscription ?? true;

  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const equalityRef = useRef(equalityFn);
  equalityRef.current = equalityFn;

  const cacheRef = useRef<SnapshotCache<T>>({
    state: null,
    value: undefined as T,
    primed: false,
  });

  const readState = useCallback((): ChatDomainState => {
    return getChatDomainStoreSession()?.getState() ?? EMPTY_CHAT_DOMAIN_STATE;
  }, []);

  const resolveSnapshot = useCallback((): T => {
    const state = readState();
    const cache = cacheRef.current;

    // Mesmo state root → mesma referência de valor (obrigatório para useSyncExternalStore).
    if (cache.primed && Object.is(cache.state, state)) {
      return cache.value;
    }

    const next = selectorRef.current(state);
    if (cache.primed && equalityRef.current(cache.value, next)) {
      recordSelectorHit(name);
      cacheRef.current = { state, value: cache.value, primed: true };
      return cache.value;
    }

    if (cache.primed) {
      recordSelectorMiss(name);
    }
    cacheRef.current = { state, value: next, primed: true };
    return next;
  }, [name, readState]);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!enabled) return () => undefined;
      const store = ensureChatDomainStoreSession();
      if (!store) return () => undefined;
      const detach = trackSubscription ? recordSubscriptionAttach(name) : () => undefined;
      const unsub = store.subscribe(() => {
        const state = store.getState();
        const cache = cacheRef.current;
        const next = selectorRef.current(state);

        if (cache.primed && equalityRef.current(cache.value, next)) {
          // State mudou, selector equal → atualiza âncora de state sem acordar React.
          cacheRef.current = { state, value: cache.value, primed: true };
          recordSubscriptionSkip(name);
          recordSelectorHit(name);
          return;
        }

        cacheRef.current = { state, value: next, primed: true };
        recordSelectorMiss(name);
        if (
          name === 'useChatConversationList' ||
          name === 'useChatSelection' ||
          name === 'useFloatingConversationListData'
        ) {
          recordConversationSelectorUpdate();
        }
        if (trackSubscription) {
          recordStoreSubscription();
          recordSubscriptionNotify(name);
          recordSocketUiFlush();
        }
        onStoreChange();
      });
      return () => {
        detach();
        unsub();
      };
    },
    [enabled, name, trackSubscription],
  );

  const getServerSnapshot = useCallback((): T => {
    // Snapshot estável para SSR — deriva de EMPTY e cacheia no módulo via ref local.
    const next = selectorRef.current(EMPTY_CHAT_DOMAIN_STATE);
    if (cacheRef.current.primed && equalityRef.current(cacheRef.current.value, next)) {
      return cacheRef.current.value;
    }
    cacheRef.current = { state: EMPTY_CHAT_DOMAIN_STATE, value: next, primed: true };
    return next;
  }, []);

  const offlineSnapshot = useCallback((): T => {
    return resolveSnapshot();
  }, [resolveSnapshot]);

  return useSyncExternalStore(
    enabled ? subscribe : () => () => undefined,
    enabled ? resolveSnapshot : offlineSnapshot,
    getServerSnapshot,
  );
}
