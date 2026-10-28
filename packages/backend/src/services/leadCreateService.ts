import { pool } from '../utils/db.js';

export class LeadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LeadValidationError';
  }
}

export type LeadWriteInput = {
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  source?: string | null;
  status?: string | null;
  notes?: string | null;
  profile_id?: string | null;
  cpf_cnpj?: string | null;
  observacao?: string | null;
};

export type PreparedLead = {
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string;
  status: string | null;
  notes: string | null;
  profile_id: string | null;
  cpf_cnpj: string | null;
  observacao: string | null;
};

export function normalizeCpfCnpj(value: string | null | undefined): string | null {
  if (value == null || typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  return digits.length === 0 ? null : digits;
}

export function isValidCpfCnpjLength(digits: string): boolean {
  return digits.length === 11 || digits.length === 14;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Mesma limpeza do cadastro manual. `defaultSource` só entra quando source vem vazio
 * (`Outros` no painel, `API` na chave).
 */
export function prepareLeadFields(input: LeadWriteInput, defaultSource: string): PreparedLead {
  const name = typeof input.name === 'string' ? input.name : '';
  if (name.length < 1) {
    throw new LeadValidationError('Informe o nome do lead.');
  }

  let email: string | null = null;
  if (typeof input.email === 'string' && input.email.trim()) {
    const trimmed = input.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      throw new LeadValidationError('Invalid email format');
    }
    email = trimmed;
  }

  const cpf = normalizeCpfCnpj(typeof input.cpf_cnpj === 'string' ? input.cpf_cnpj : null);
  if (cpf !== null && !isValidCpfCnpjLength(cpf)) {
    throw new LeadValidationError('CPF/CNPJ deve ter 11 (CPF) ou 14 (CNPJ) dígitos.');
  }

  const source = cleanText(input.source) ?? defaultSource;
  const status = cleanText(input.status);
  const profileId = cleanText(input.profile_id);

  return {
    name,
    email,
    phone: cleanText(input.phone),
    company: cleanText(input.company),
    source,
    status,
    notes: cleanText(input.notes),
    profile_id: profileId,
    cpf_cnpj: cpf,
    observacao: cleanText(input.observacao),
  };
}

/** Nome da fase como está no CRM. Aceita maiúsculas diferentes e qualquer fase da conta. */
export async function resolveTenantLeadStatus(tenantId: string, status: string): Promise<string> {
  const result = await pool.query(
    `SELECT ls.name
     FROM lead_statuses ls
     INNER JOIN users u ON u.id = ls.user_id AND u.tenant_id = $1
     WHERE lower(btrim(ls.name)) = lower(btrim($2))
     ORDER BY CASE WHEN ls.name = btrim($2) THEN 0 ELSE 1 END, ls.created_at
     LIMIT 1`,
    [tenantId, status]
  );
  const name = result.rows[0]?.name;
  if (!name) {
    throw new LeadValidationError('Status de lead não encontrado.');
  }
  return String(name);
}

export async function insertLead(userId: string, lead: PreparedLead): Promise<Record<string, unknown>> {
  const result = await pool.query(
    `INSERT INTO leads (
      user_id, name, email, phone, company, source, status, notes, profile_id, cpf_cnpj, observacao
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *`,
    [
      userId,
      lead.name,
      lead.email,
      lead.phone,
      lead.company,
      lead.source,
      lead.status,
      lead.notes,
      lead.profile_id,
      lead.cpf_cnpj,
      lead.observacao,
    ]
  );
  const row = result.rows[0];
  if (!row) throw new Error('insertLead: no row');
  return row;
}
