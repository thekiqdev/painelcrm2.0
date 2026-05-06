/**
 * Preferência de desativar notificações nativas do Asaas para clientes (API: `notificationDisabled`).
 * Armazenada em `payment_gateway_configs.options.asaas_disable_customer_notifications` (default lógico: true).
 */
import { getActiveConfig } from './paymentGatewayConfigService.js';

export type AsaasNotificationBillingContext = {
  billingType: 'saas' | 'crm';
  /** Obrigatório quando `billingType === 'crm'` (gateway do tenant). */
  tenantId?: string | null;
};

/**
 * Se `true`, o PainelCRM envia `notificationDisabled: true` ao criar/atualizar clientes no Asaas.
 * Padrão `true` quando a chave está ausente ou o gateway não é Asaas.
 */
export async function getAsaasDisableCustomerNotifications(
  ctx: AsaasNotificationBillingContext
): Promise<boolean> {
  const { billingType, tenantId } = ctx;
  const row =
    billingType === 'crm' && tenantId
      ? await getActiveConfig('crm', tenantId)
      : await getActiveConfig('saas');
  if (!row || row.gateway_key !== 'asaas') return true;
  const v = (row.options as Record<string, unknown> | null)?.asaas_disable_customer_notifications;
  if (v === false) return false;
  return true;
}
