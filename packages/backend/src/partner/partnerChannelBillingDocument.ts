/**
 * M5 S7.4 — CPF/CNPJ obrigatório para cobrança Asaas (paridade SaaS checkout).
 */
import { pool } from '../utils/db.js';
import { isValidCpfOrCnpj, onlyDigits } from '../utils/cpfCnpj.js';
import { PartnerAdminError } from './partnerAdminService.js';
import { ASAAS_CPF_CNPJ_USER_MESSAGE } from '../services/subscriptionService.js';

export const PARTNER_CPF_CNPJ_REQUIRED_CODE = 'CPF_CNPJ_REQUIRED_FOR_PAYMENT_METHOD' as const;

export const PARTNER_CPF_CNPJ_REQUIRED_MESSAGE =
  'CPF/CNPJ é obrigatório e deve ser válido para gerar a cobrança no Asaas.';

/**
 * Resolve documento de cobrança: usa o já cadastrado no tenant ou persiste o enviado no request.
 * @returns dígitos normalizados (11 ou 14)
 */
export async function ensureTenantBillingDocumentForPayment(
  tenantId: string,
  cpfFromBody?: string | null
): Promise<string> {
  const row = await pool.query<{ cpf_cnpj: string | null }>(
    `SELECT cpf_cnpj FROM tenants WHERE id = $1 LIMIT 1`,
    [tenantId]
  );
  const existing = onlyDigits(row.rows[0]?.cpf_cnpj ?? '');
  if (isValidCpfOrCnpj(existing)) {
    return existing;
  }

  const fromBody = onlyDigits(cpfFromBody ?? '');
  if (fromBody && isValidCpfOrCnpj(fromBody)) {
    await pool.query(
      `UPDATE tenants SET cpf_cnpj = $1, updated_at = now() WHERE id = $2`,
      [fromBody, tenantId]
    );
    return fromBody;
  }

  throw new PartnerAdminError(
    fromBody
      ? 'CPF/CNPJ inválido. Verifique os dígitos e tente novamente.'
      : PARTNER_CPF_CNPJ_REQUIRED_MESSAGE,
    PARTNER_CPF_CNPJ_REQUIRED_CODE,
    400
  );
}

/** Mapeia erro Asaas relacionado a documento para resposta amigável. */
export function mapPartnerChannelAsaasDocumentError(err: unknown): PartnerAdminError | null {
  const message = err instanceof Error ? err.message : String(err);
  if (message === ASAAS_CPF_CNPJ_USER_MESSAGE) {
    return new PartnerAdminError(message, PARTNER_CPF_CNPJ_REQUIRED_CODE, 400);
  }
  if (/asaas/i.test(message) && /cpf|cnpj|documento/i.test(message)) {
    return new PartnerAdminError(ASAAS_CPF_CNPJ_USER_MESSAGE, PARTNER_CPF_CNPJ_REQUIRED_CODE, 400);
  }
  return null;
}

/** Valida formato quando informado no cadastro (trial) — não exige presença. */
export function normalizeOptionalBillingDocument(raw?: string | null): string | null {
  const digits = onlyDigits(raw ?? '');
  if (!digits) return null;
  if (!isValidCpfOrCnpj(digits)) {
    throw new PartnerAdminError(
      'CPF/CNPJ inválido. Informe um documento válido ou deixe em branco.',
      'CPF_CNPJ_INVALID',
      400
    );
  }
  return digits;
}
