/**
 * Customer Billing Fase 1: validações de pré-condições para criação de fatura manual.
 * Ref: docs/PLANO-ACAO-CUSTOMER-BILLING-VALIDACOES-E-GATEWAY.md
 */
import { pool } from '../utils/db.js';
import { getActiveConfig } from './paymentGatewayConfigService.js';

/**
 * Indica se o tenant tem gateway CRM ativo (mesma regra de createCharge / pré-condições).
 * Usado pelo GET /api/customer-invoices/gateway-status (Fase 1 — aviso condicional no front).
 *
 * **A1 (Fase 8):** “Ativo” = existe config retornada por `getActiveConfig('crm', tenantId)`
 * (`is_active` + `status = 'active'`). **Não** exige `last_connection_test_at` nem
 * `last_connection_status`; a UI de faturas deve refletir isso (provedor ativo, não “último teste OK”).
 */
export async function isCrmGatewayActiveForTenant(tenantId: string): Promise<boolean> {
  const config = await getActiveConfig('crm', tenantId);
  return config != null;
}

export interface ValidateInvoicePreconditionsResult {
  ok: boolean;
  clientHasCpfCnpj: boolean;
  gatewayConfigured: boolean;
  errors: string[];
}

/**
 * Valida se o tenant pode emitir fatura manual para o cliente:
 * - Provedor de pagamentos (CRM) deve estar **ativo** (`getActiveConfig`), não exigindo teste de conexão explícito (A1).
 * - CPF/CNPJ do cliente é informado como contexto (`clientHasCpfCnpj`) para a jornada pública quando ausente.
 * O cliente deve pertencer ao tenant (chamador deve garantir, ex.: clientBelongsToTenant).
 */
export async function validateInvoicePreconditions(
  tenantId: string,
  clientId: string
): Promise<ValidateInvoicePreconditionsResult> {
  const errors: string[] = [];

  const clientRow = await pool.query<{ cpf_cnpj: string | null }>(
    `SELECT c.cpf_cnpj FROM clients c
     INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1
     WHERE c.id = $2
     LIMIT 1`,
    [tenantId, clientId]
  );
  const client = clientRow.rows[0];
  const clientHasCpfCnpj = !!(
    client &&
    client.cpf_cnpj != null &&
    String(client.cpf_cnpj).trim() !== ''
  );
  const config = await getActiveConfig('crm', tenantId);
  const gatewayConfigured = config != null;
  if (!gatewayConfigured) {
    errors.push('Gateway de pagamento não configurado.');
  }

  return {
    ok: gatewayConfigured,
    clientHasCpfCnpj,
    gatewayConfigured,
    errors,
  };
}

/** Erro lançado quando as pré-condições falham (Fase 1). */
export class PreconditionFailedError extends Error {
  code = 'PRECONDITION_FAILED' as const;
  errors: string[];

  constructor(errors: string[]) {
    super(errors.join(' '));
    this.name = 'PreconditionFailedError';
    this.errors = errors;
  }
}
