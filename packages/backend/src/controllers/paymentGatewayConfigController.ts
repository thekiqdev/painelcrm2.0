/**
 * Rotas Super Admin: configuração global do gateway de pagamento (Etapa 4).
 * GET /api/superadmin/payment-gateway — config ativa (credenciais mascaradas)
 * PUT /api/superadmin/payment-gateway — salvar config global
 * GET /api/superadmin/payment-gateways — lista gateways para dropdown
 */
import { Request, Response } from 'express';
import {
  getGlobalConfig,
  saveGlobalConfig,
  listGateways,
  getGatewaysStatus,
} from '../services/paymentGatewayConfigService.js';
import { listWebhookEvents } from '../services/paymentWebhookEventsService.js';
import { invalidateGatewayCache } from '../modules/payments/gatewayProvider.js';
import { paymentMethodSlugsFromConfigRow } from '../services/gatewayPaymentMethodPolicy.js';

/**
 * GET /api/superadmin/payment-gateway
 * Retorna a config global ativa (gateway_key, display_name, options; credenciais mascaradas).
 */
export async function getPaymentGatewayConfig(req: Request, res: Response): Promise<void> {
  try {
    const config = await getGlobalConfig();
    res.json(config ?? null);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('getPaymentGatewayConfig error:', error);
    res.status(500).json({ error: message });
  }
}

/**
 * PUT /api/superadmin/payment-gateway
 * Body: { gateway_key, credentials?, options?, display_name? }.
 * Valida gateway_key, upsert config global, invalida cache do gatewayProvider.
 */
export async function putPaymentGatewayConfig(req: Request, res: Response): Promise<void> {
  try {
    const { gateway_key, credentials, options, display_name, enabled_payment_methods, default_payment_method } =
      req.body ?? {};
    if (!gateway_key || typeof gateway_key !== 'string') {
      res.status(400).json({ error: 'gateway_key é obrigatório' });
      return;
    }
    const data = {
      gateway_key: gateway_key.trim(),
      display_name: display_name ?? null,
      credentials: typeof credentials === 'object' && credentials !== null ? credentials : {},
      options: typeof options === 'object' && options !== null ? options : {},
      ...(Array.isArray(enabled_payment_methods) ? { enabled_payment_methods: enabled_payment_methods.map(String) } : {}),
      ...(default_payment_method !== undefined
        ? {
            default_payment_method:
              default_payment_method === null || default_payment_method === ''
                ? null
                : String(default_payment_method),
          }
        : {}),
    };
    const saved = await saveGlobalConfig(data);
    invalidateGatewayCache();
    const pm = paymentMethodSlugsFromConfigRow(saved);
    res.json({
      id: saved.id,
      scope: saved.scope,
      gateway_key: saved.gateway_key,
      display_name: saved.display_name,
      options: saved.options,
      hasCredentials: Object.keys(saved.credentials).length > 0,
      enabled_payment_methods: pm.enabled_payment_methods,
      default_payment_method: pm.default_payment_method,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('putPaymentGatewayConfig error:', error);
    const isValidation =
      message.includes('não existe') ||
      message.includes('não está habilitado') ||
      message.includes('método') ||
      message.includes('Método');
    res.status(isValidation ? 400 : 500).json({ error: message });
  }
}

/**
 * GET /api/superadmin/payment-gateways
 * Lista gateways suportados (key, name, is_enabled) para dropdown no front.
 */
export async function getPaymentGatewaysList(req: Request, res: Response): Promise<void> {
  try {
    const gateways = await listGateways();
    res.json(gateways);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('getPaymentGatewaysList error:', error);
    res.status(500).json({ error: message });
  }
}

/**
 * GET /api/superadmin/payment-gateways/status
 * Lista gateways com status para o painel (config global): configured, connection_status, last_connection_test_at, environment, webhook_configured, status.
 */
export async function getPaymentGatewaysStatus(req: Request, res: Response): Promise<void> {
  try {
    const statusList = await getGatewaysStatus('global');
    res.json(statusList);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('getPaymentGatewaysStatus error:', error);
    res.status(500).json({ error: message });
  }
}

/**
 * GET /api/superadmin/payment-gateways/webhooks/events
 * Lista últimos eventos de webhook (debug). Query: gateway_key?, limit?, offset?.
 */
export async function getPaymentWebhookEvents(req: Request, res: Response): Promise<void> {
  try {
    const gatewayKey = typeof req.query.gateway_key === 'string' ? req.query.gateway_key : undefined;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const events = await listWebhookEvents({ gatewayKey, limit, offset });
    res.json(events);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('getPaymentWebhookEvents error:', error);
    res.status(500).json({ error: message });
  }
}
