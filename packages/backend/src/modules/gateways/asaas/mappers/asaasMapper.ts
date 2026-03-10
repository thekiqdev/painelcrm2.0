/**
 * Mapeamento entre domínio interno e payloads Asaas.
 */
import type {
  CreateCustomerInput,
  CreateChargeInput,
  PaymentMethod,
} from '../../../payments/paymentGatewayTypes.js';
import type { AsaasCustomerRequest, AsaasPaymentRequest } from '../asaasTypes.js';

/** Dados do tenant (e usuário) para criar customer no Asaas */
export interface TenantForCustomer {
  name: string;
  email: string;
  cpfCnpj?: string | null;
  phone?: string | null;
  postalCode?: string | null;
  address?: string | null;
  addressNumber?: string | null;
  province?: string | null;
  city?: string | null;
  state?: string | null;
}

function toAsaasCustomerRequest(data: {
  name: string;
  email: string;
  cpfCnpj?: string | null;
  phone?: string | null;
  postalCode?: string | null;
  address?: string | null;
  addressNumber?: string | null;
  province?: string | null;
  city?: string | null;
  state?: string | null;
}): AsaasCustomerRequest {
  const out: AsaasCustomerRequest = {
    name: data.name.trim(),
    email: data.email.trim(),
  };
  if (data.cpfCnpj) out.cpfCnpj = String(data.cpfCnpj).replace(/\D/g, '');
  if (data.phone) out.phone = String(data.phone).replace(/\D/g, '');
  if (data.postalCode) out.postalCode = String(data.postalCode).replace(/\D/g, '');
  if (data.address) out.address = data.address;
  if (data.addressNumber) out.addressNumber = data.addressNumber;
  if (data.province) out.province = data.province;
  if (data.city) out.city = data.city;
  if (data.state) out.state = data.state;
  return out;
}

export function toAsaasCustomer(input: CreateCustomerInput): AsaasCustomerRequest {
  return toAsaasCustomerRequest({
    name: input.name,
    email: input.email,
    cpfCnpj: input.cpfCnpj,
    phone: input.phone,
    postalCode: input.postalCode,
    address: input.address,
    addressNumber: input.addressNumber,
    province: input.province,
    city: input.city,
    state: input.state,
  });
}

export function tenantToAsaasCustomer(tenant: TenantForCustomer): AsaasCustomerRequest {
  return toAsaasCustomerRequest(tenant);
}

export function toAsaasPayment(
  customerId: string,
  input: CreateChargeInput
): AsaasPaymentRequest {
  const billingType = input.paymentMethod
    ? asaasBillingType(input.paymentMethod)
    : 'BOLETO';
  const req: AsaasPaymentRequest = {
    customer: customerId,
    billingType,
    value: input.amountCents / 100,
    dueDate: input.dueDate,
  };
  if (input.description) req.description = input.description;
  if (input.externalReference) req.externalReference = input.externalReference;
  return req;
}

export function asaasBillingType(
  method: PaymentMethod
): 'BOLETO' | 'CREDIT_CARD' | 'PIX' {
  switch (method) {
    case 'BOLETO':
      return 'BOLETO';
    case 'CREDIT_CARD':
      return 'CREDIT_CARD';
    case 'PIX':
      return 'PIX';
    default:
      return 'BOLETO';
  }
}
