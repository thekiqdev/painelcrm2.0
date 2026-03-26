/**
 * Normalização de status de gateway → status interno e regra de progressão (anti-regressão).
 * Fase 3 — PLANO-REFATORACAO-MULTI-GATEWAY.
 */
import type { InternalPaymentStatus } from '../paymentGatewayTypes.js';

const ORDER: Record<InternalPaymentStatus, number> = {
  pending: 0,
  waiting_payment: 1,
  processing: 2,
  paid: 3,
  overdue: 4,
  cancelled: 5,
  failed: 6,
  refunded: 7,
};

/** Transientes (podem evoluir para paid): pending → waiting_payment → processing → paid. */
const TRANSIENT: Set<InternalPaymentStatus> = new Set(['pending', 'waiting_payment', 'processing', 'paid']);
/** Finais: não permitir regressão a partir deles (exceto overdue → paid). */
const FINAL: Set<InternalPaymentStatus> = new Set(['paid', 'overdue', 'cancelled', 'failed', 'refunded']);

/**
 * Verifica se a transição currentStatus → newStatus é permitida (sem regressão).
 * paid/cancelled/failed/refunded não voltam; overdue pode ir para paid.
 */
export function canTransition(
  currentStatus: string,
  newStatus: InternalPaymentStatus
): boolean {
  const cur = currentStatus as InternalPaymentStatus;
  const curOrder = ORDER[cur] ?? -1;
  const newOrder = ORDER[newStatus] ?? -1;

  if (cur === newStatus) return true;

  if (FINAL.has(cur)) {
    if (cur === 'overdue' && newStatus === 'paid') return true;
    return false;
  }
  return newOrder >= curOrder;
}

/**
 * Mapeia status bruto do gateway para status interno (Asaas).
 * Outros gateways: registrar mapeamento quando integrar.
 */
export function normalizeGatewayStatus(
  gatewayKey: string,
  externalStatus: string | null
): InternalPaymentStatus {
  if (!externalStatus) return 'pending';
  const upper = externalStatus.toUpperCase();

  if (gatewayKey === 'asaas') {
    if (upper === 'RECEIVED' || upper === 'CONFIRMED') return 'paid';
    if (upper === 'OVERDUE') return 'overdue';
    if (upper === 'REFUNDED') return 'refunded';
    if (upper === 'CANCELED' || upper === 'CANCELLED' || upper === 'DELETED') return 'cancelled';
    if (upper === 'PENDING' || upper.startsWith('AWAITING_')) return 'pending';
  }

  return 'pending';
}
