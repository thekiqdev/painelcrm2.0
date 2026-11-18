import type { AsaasConfig } from '../modules/gateways/asaas/asaasTypes.js';
import { syncAsaasCustomerDocumentStrict } from '../modules/gateways/asaas/services/asaasService.js';
import { pool } from '../utils/db.js';
import { getConfigForTest } from './paymentGatewayConfigService.js';

export class BillingDocumentSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BillingDocumentSyncError';
  }
}

function asaasConfigFromRow(row: {
  credentials: Record<string, unknown>;
  options?: Record<string, unknown>;
}): AsaasConfig | null {
  const credentials = row.credentials ?? {};
  const apiKey = typeof credentials.api_key === 'string' ? credentials.api_key : '';
  if (!apiKey) return null;
  const options = row.options ?? {};
  return {
    api_key: apiKey,
    env: credentials.env === 'production' ? 'production' : 'sandbox',
    disableCustomerNotifications: options.asaas_disable_customer_notifications !== false,
  };
}

/**
 * Atualiza o documento no customer Asaas já vinculado.
 * Sem vínculo, não faz nada. Se o Asaas recusar, a estrela não pode ficar só no CRM.
 */
export async function syncBillingDocumentChange(input: {
  tenantId: string;
  clientId: string;
  name: string;
  email: string | null;
  phone: string | null;
  cpfCnpj: string;
}): Promise<void> {
  const links = await pool.query<{ gateway_customer_id: string }>(
    `SELECT gateway_customer_id
     FROM payment_customers
     WHERE tenant_id = $1 AND client_id = $2 AND gateway_key = 'asaas'`,
    [input.tenantId, input.clientId],
  );
  if (links.rows.length === 0) return;

  const cfg = await getConfigForTest('tenant', input.tenantId, 'asaas');
  const asaasConfig = cfg ? asaasConfigFromRow(cfg) : null;
  if (!asaasConfig) {
    throw new BillingDocumentSyncError(
      'O Asaas recusou o documento de cobrança: a conta Asaas da empresa não está configurada.',
    );
  }

  for (const link of links.rows) {
    if (!link.gateway_customer_id) continue;
    try {
      await syncAsaasCustomerDocumentStrict(
        link.gateway_customer_id,
        {
          name: input.name,
          email: input.email ?? '',
          phone: input.phone ?? undefined,
          cpfCnpj: input.cpfCnpj,
        },
        asaasConfig,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new BillingDocumentSyncError(
        detail.startsWith('O Asaas') ? detail : `O Asaas recusou o documento de cobrança: ${detail}`,
      );
    }
  }
}
