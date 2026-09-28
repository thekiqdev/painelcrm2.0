/**
 * Impede segundo trial para a mesma empresa (CPF/CNPJ, e-mail ou WhatsApp já vinculados a tenant com trial consumido).
 */
import { pool } from '../utils/db.js';
import { isValidCpfOrCnpj } from '../utils/cpfCnpj.js';

export class TrialAlreadyConsumedError extends Error {
  readonly code = 'TRIAL_ALREADY_CONSUMED' as const;
  constructor(message = 'Trial já utilizado para estes dados. Faça login ou conclua o pagamento na retomada.') {
    super(message);
    this.name = 'TrialAlreadyConsumedError';
  }
}

export async function assertNewTrialSignupAllowed(params: {
  cpfCnpjDigits: string | null;
  emailNormalized: string;
  whatsappDigits: string;
}): Promise<void> {
  const { cpfCnpjDigits, emailNormalized, whatsappDigits } = params;
  const cpf = cpfCnpjDigits?.trim() || null;

  if (cpf && isValidCpfOrCnpj(cpf)) {
    const byDoc = await pool.query(
      `SELECT 1 FROM tenants
       WHERE has_used_trial = true AND cpf_cnpj = $1
       LIMIT 1`,
      [cpf]
    );
    if (byDoc.rows.length > 0) throw new TrialAlreadyConsumedError();
  }

  const byEmail = await pool.query(
    `SELECT 1
     FROM users u
     JOIN tenants t ON t.id = u.tenant_id
     WHERE t.has_used_trial = true AND lower(btrim(u.email)) = $1
     LIMIT 1`,
    [emailNormalized]
  );
  if (byEmail.rows.length > 0) throw new TrialAlreadyConsumedError();

  const byWa = await pool.query(
    `SELECT 1
     FROM users u
     JOIN tenants t ON t.id = u.tenant_id
     WHERE t.has_used_trial = true
       AND u.whatsapp_number IS NOT NULL
       AND regexp_replace(COALESCE(u.whatsapp_number, ''), '\\D', '', 'g') = $1
     LIMIT 1`,
    [whatsappDigits]
  );
  if (byWa.rows.length > 0) throw new TrialAlreadyConsumedError();
}
