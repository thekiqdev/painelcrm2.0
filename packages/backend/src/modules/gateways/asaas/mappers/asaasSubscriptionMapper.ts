/**
 * CA S1 — mapeamento domínio → payload Assinatura Asaas (`/v3/subscriptions`).
 * Não loga PAN / CCV.
 */
import type {
  CreateGatewaySubscriptionInput,
  GatewaySubscriptionCycle,
  UpdateGatewaySubscriptionCreditCardInput,
  UpdateGatewaySubscriptionInput,
} from '../../../payments/paymentGatewayTypes.js';
import type {
  AsaasCreditCardHolderInfoPayload,
  AsaasCreditCardPayload,
  AsaasSubscriptionCreateRequest,
  AsaasSubscriptionCreditCardUpdateRequest,
  AsaasSubscriptionCycle,
  AsaasSubscriptionUpdateRequest,
} from '../asaasTypes.js';

const CYCLE_MAP: Record<GatewaySubscriptionCycle, AsaasSubscriptionCycle> = {
  weekly: 'WEEKLY',
  monthly: 'MONTHLY',
  quarterly: 'QUARTERLY',
  semi_annual: 'SEMIANNUALLY',
  yearly: 'YEARLY',
};

export function toAsaasSubscriptionCycle(cycle: GatewaySubscriptionCycle): AsaasSubscriptionCycle {
  const mapped = CYCLE_MAP[cycle];
  if (!mapped) {
    throw new Error(`Ciclo de assinatura não suportado pelo Asaas: ${String(cycle)}`);
  }
  return mapped;
}

function centsToAsaasValue(amountCents: number): number {
  return Math.round(Math.max(0, amountCents)) / 100;
}

function sanitizeCard(card: NonNullable<CreateGatewaySubscriptionInput['creditCard']>): AsaasCreditCardPayload {
  return {
    holderName: card.holderName.trim(),
    number: card.number.replace(/\D/g, ''),
    expiryMonth: card.expiryMonth.trim(),
    expiryYear: card.expiryYear.trim(),
    ccv: card.ccv.trim(),
  };
}

function sanitizeHolder(
  holder: NonNullable<CreateGatewaySubscriptionInput['creditCardHolderInfo']>
): AsaasCreditCardHolderInfoPayload {
  return {
    name: holder.name.trim(),
    email: holder.email.trim(),
    cpfCnpj: holder.cpfCnpj.replace(/\D/g, ''),
    postalCode: holder.postalCode.replace(/\D/g, ''),
    addressNumber: holder.addressNumber.trim(),
    addressComplement: holder.addressComplement ?? null,
    phone: holder.phone.replace(/\D/g, ''),
    mobilePhone: holder.mobilePhone?.replace(/\D/g, '') ?? null,
  };
}

/**
 * Monta body de criação. Exige token **ou** (cartão + holder).
 */
export function toAsaasSubscriptionCreateRequest(
  input: CreateGatewaySubscriptionInput
): AsaasSubscriptionCreateRequest {
  const token = input.creditCardToken?.trim();
  const hasPan = Boolean(input.creditCard && input.creditCardHolderInfo);
  if (!token && !hasPan) {
    throw new Error('Assinatura Asaas exige creditCardToken ou creditCard+creditCardHolderInfo');
  }
  if (!input.remoteIp?.trim()) {
    throw new Error('Assinatura Asaas exige remoteIp do dispositivo do pagador');
  }

  const body: AsaasSubscriptionCreateRequest = {
    customer: input.customerId.trim(),
    billingType: 'CREDIT_CARD',
    nextDueDate: input.nextDueDate.trim().slice(0, 10),
    value: centsToAsaasValue(input.amountCents),
    cycle: toAsaasSubscriptionCycle(input.cycle),
    remoteIp: input.remoteIp.trim(),
  };
  if (input.description?.trim()) body.description = input.description.trim();
  if (input.externalReference?.trim()) body.externalReference = input.externalReference.trim();

  if (token) {
    body.creditCardToken = token;
  } else {
    body.creditCard = sanitizeCard(input.creditCard!);
    body.creditCardHolderInfo = sanitizeHolder(input.creditCardHolderInfo!);
  }
  return body;
}

export function toAsaasSubscriptionUpdateRequest(
  input: UpdateGatewaySubscriptionInput
): AsaasSubscriptionUpdateRequest {
  const body: AsaasSubscriptionUpdateRequest = {};
  if (input.amountCents != null) body.value = centsToAsaasValue(input.amountCents);
  if (input.nextDueDate?.trim()) body.nextDueDate = input.nextDueDate.trim().slice(0, 10);
  if (input.cycle) body.cycle = toAsaasSubscriptionCycle(input.cycle);
  if (input.description !== undefined) {
    body.description = input.description?.trim() || undefined;
  }
  if (input.updatePendingPayments != null) body.updatePendingPayments = input.updatePendingPayments;
  if (input.status) body.status = input.status;
  if (input.externalReference?.trim()) body.externalReference = input.externalReference.trim();
  return body;
}

export function toAsaasSubscriptionCreditCardUpdateRequest(
  input: UpdateGatewaySubscriptionCreditCardInput
): AsaasSubscriptionCreditCardUpdateRequest {
  const token = input.creditCardToken?.trim();
  const hasPan = Boolean(input.creditCard && input.creditCardHolderInfo);
  if (!token && !hasPan) {
    throw new Error('Atualização de cartão exige creditCardToken ou creditCard+holder');
  }
  if (!input.remoteIp?.trim()) {
    throw new Error('Atualização de cartão exige remoteIp do pagador');
  }
  const body: AsaasSubscriptionCreditCardUpdateRequest = {
    remoteIp: input.remoteIp.trim(),
  };
  if (token) {
    body.creditCardToken = token;
  } else {
    body.creditCard = sanitizeCard(input.creditCard!);
    body.creditCardHolderInfo = sanitizeHolder(input.creditCardHolderInfo!);
  }
  return body;
}

/** Para logs/auditoria: nunca incluir number/ccv. */
export function summarizeSubscriptionCreateForLog(
  body: AsaasSubscriptionCreateRequest
): Record<string, unknown> {
  return {
    customer: body.customer,
    billingType: body.billingType,
    value: body.value,
    cycle: body.cycle,
    nextDueDate: body.nextDueDate,
    externalReference: body.externalReference ?? null,
    hasCreditCardToken: Boolean(body.creditCardToken),
    hasCreditCardPan: Boolean(body.creditCard),
    remoteIpPresent: Boolean(body.remoteIp),
  };
}
