/**
 * Resolve cliente CRM no checkout público da loja (telefone + CPF quando necessário).
 * Queries usam user_id do dono da loja + tenant_id explícito (pool sem RLS de request).
 */
import { pool } from '../utils/db.js';
import { onlyDigits, isValidCpfOrCnpj } from '../utils/cpfCnpj.js';

export interface StoreCheckoutClientRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cpf_cnpj: string | null;
}

/** Dígitos comparáveis (BR): remove não-numéricos e prefixo 55 quando aplicável. */
export function normalizePhoneKeyForMatch(phone: string): string {
  let d = onlyDigits(phone);
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  return d;
}

function normalizeStoredPhoneDigits(dbDigits: string): string {
  let d = dbDigits.replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  return d;
}

/**
 * Busca cliente do dono da loja cujo telefone coincide (normalizado) com o informado no checkout.
 */
export async function findClientByStoreOwnerPhone(
  storeOwnerUserId: string,
  tenantId: string,
  checkoutPhone: string
): Promise<StoreCheckoutClientRow | null> {
  const target = normalizePhoneKeyForMatch(checkoutPhone);
  if (target.length < 10) return null;

  const r = await pool.query<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    cpf_cnpj: string | null;
    phone_digits: string;
  }>(
    `SELECT c.id, c.name, c.email, c.phone, c.cpf_cnpj,
            regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g') AS phone_digits
     FROM clients c
     INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $2::uuid
     WHERE c.user_id = $1::uuid`,
    [storeOwnerUserId, tenantId]
  );

  for (const row of r.rows) {
    const d = normalizeStoredPhoneDigits(row.phone_digits);
    if (d === target) return row;
    if (target.length >= 10 && d.length >= 10 && target.slice(-10) === d.slice(-10)) return row;
  }
  return null;
}

export function parseCpfCnpjDigits(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== 'string') return null;
  const digits = onlyDigits(raw);
  if (digits.length !== 11 && digits.length !== 14) return null;
  return digits;
}

export function assertCpfCnpjValidOrThrow(digits: string): void {
  if (!isValidCpfOrCnpj(digits)) {
    const err = new Error('CPF ou CNPJ inválido') as Error & { statusCode?: number; field?: string; code?: string };
    err.statusCode = 400;
    err.field = 'customer_cpf_cnpj';
    err.code = 'INVALID_CPF_CNPJ';
    throw err;
  }
}

export function requireCpfCnpjMessage(): never {
  const err = new Error('Informe o CPF ou CNPJ para continuar') as Error & {
    statusCode?: number;
    field?: string;
    code?: string;
  };
  err.statusCode = 400;
  err.field = 'customer_cpf_cnpj';
  err.code = 'CPF_REQUIRED';
  throw err;
}
