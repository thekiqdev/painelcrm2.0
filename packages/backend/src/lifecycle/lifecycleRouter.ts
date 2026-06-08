import { getDefaultLifecycleRoute } from './lifecycleDefaultRoutes.js';
import { isKnownLifecycleBoard, isKnownLifecycleColumn } from './lifecycleBoardCatalog.js';
import {
  LIFECYCLE_EVENT_TYPES,
  type LifecycleContext,
  type LifecycleEventType,
  type LifecycleResolution,
} from './lifecycleTypes.js';

const FALLBACK_BOARD = 'Aquisição';
const FALLBACK_COLUMN = 'Novo lead';

function isLifecycleEventType(value: string): value is LifecycleEventType {
  return (LIFECYCLE_EVENT_TYPES as readonly string[]).includes(value);
}

function buildResolution(input: {
  eventType: LifecycleEventType | null;
  boardName: string;
  columnName: string;
  reason: string;
  matched: boolean;
  fallback: boolean;
}): LifecycleResolution {
  const boardKnown = isKnownLifecycleBoard(input.boardName);
  const columnKnown = isKnownLifecycleColumn(input.boardName, input.columnName);
  let reason = input.reason;
  if (!boardKnown) {
    reason = `${reason};board_not_in_catalog:${input.boardName}`;
  }
  if (!columnKnown) {
    reason = `${reason};column_not_in_catalog:${input.boardName}/${input.columnName}`;
  }
  return {
    boardName: input.boardName,
    columnName: input.columnName,
    reason,
    eventType: input.eventType,
    matched: input.matched,
    fallback: input.fallback,
    validation: { boardKnown, columnKnown },
  };
}

/**
 * Resolve destino teórico (board + coluna) para um evento de lifecycle.
 * Não move cards, não persiste, não executa automações.
 */
export function resolveLifecycleRoute(
  eventType: string,
  context: LifecycleContext = {},
): LifecycleResolution {
  if (!isLifecycleEventType(eventType)) {
    return buildResolution({
      eventType: null,
      boardName: FALLBACK_BOARD,
      columnName: FALLBACK_COLUMN,
      reason: `unknown_event_type:${eventType}`,
      matched: false,
      fallback: true,
    });
  }

  const route = getDefaultLifecycleRoute(eventType);
  if (!route) {
    return buildResolution({
      eventType,
      boardName: FALLBACK_BOARD,
      columnName: FALLBACK_COLUMN,
      reason: `no_default_route:${eventType}`,
      matched: false,
      fallback: true,
    });
  }

  const ctxHint =
    context.tenantId || context.acquisitionLeadId
      ? `;tenant=${context.tenantId ?? '—'};lead=${context.acquisitionLeadId ?? '—'}`
      : '';

  return buildResolution({
    eventType,
    boardName: route.boardName,
    columnName: route.columnName,
    reason: `default_route:${eventType}${ctxHint}`,
    matched: true,
    fallback: false,
  });
}
