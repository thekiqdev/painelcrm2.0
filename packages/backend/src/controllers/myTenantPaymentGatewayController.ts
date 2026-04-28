/**
 * Rotas do tenant (usuário logado): configuração do gateway de pagamento para cobrança de clientes (CRM).
 * GET/PUT /api/me/tenant/payment-gateway — config do tenant (credenciais mascaradas).
 * POST /api/me/tenant/payment-gateway/test — testar conexão com o gateway.
 * GET /api/me/tenant/payment-gateways — lista gateways para dropdown.
 */
import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import {
  getTenantConfig,
  saveTenantConfig,
  listGateways,
  getConfigForTest,
  updateConnectionTestResult,
  getGatewaysStatus,
  setTenantGatewayStatus,
  isGatewayKeyValid,
} from '../services/paymentGatewayConfigService.js';
import { listWebhookEvents } from '../services/paymentWebhookEventsService.js';
import { invalidateGatewayCache } from '../modules/payments/gatewayProvider.js';
import { testConnection } from '../modules/gateways/asaas/index.js';
import { checkPaymentGatewayTestRateLimit } from '../middleware/paymentGatewayTestRateLimit.js';
import { paymentMethodSlugsFromConfigRow } from '../services/gatewayPaymentMethodPolicy.js';
import { filterMercadoPagoFromTenantGatewayList, isMercadoPagoGatewayEnabled } from '../config/mercadoPagoGatewayEnv.js';
import { testMercadoPagoIntegration } from '../services/mercadoPagoIntegrationService.js';

function getTenantId(req: AuthRequest): string | null {
  return req.tenantId ?? null;
}

/**
 * GET /api/me/tenant/payment-gateway
 * Retorna a config do tenant (gateway_key, options; credenciais mascaradas) e webhookUrl.
 */
export async function getMyTenantPaymentGatewayConfig(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req as AuthRequest);
    if (!tenantId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
      return;
    }
    const config = await getTenantConfig(tenantId);
    const baseUrl =
      (process.env.PUBLIC_API_URL && process.env.PUBLIC_API_URL.replace(/\/$/, '')) ||
      `${req.protocol}://${req.get('host') || ''}`;
    const webhookUrl = config?.gateway_key
      ? `${baseUrl}/webhooks/${config.gateway_key}`
      : null;
    res.json(config ? { ...config, webhookUrl } : null);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('getMyTenantPaymentGatewayConfig error:', error);
    res.status(500).json({ error: message });
  }
}

/**
 * PUT /api/me/tenant/payment-gateway
 * Body: { gateway_key, credentials?, options?, display_name? }.
 * Valida gateway_key, upsert config do tenant, invalida cache do gatewayProvider.
 */
export async function putMyTenantPaymentGatewayConfig(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req as AuthRequest);
    if (!tenantId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
      return;
    }
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
    const saved = await saveTenantConfig(tenantId, data);
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
    console.error('putMyTenantPaymentGatewayConfig error:', error);
    const isValidation =
      message.includes('não existe') ||
      message.includes('não está habilitado') ||
      message.includes('método') ||
      message.includes('Método');
    res.status(isValidation ? 400 : 500).json({ error: message });
  }
}

/**
 * POST /api/me/tenant/payment-gateway/test
 * Testa a conexão com o gateway (Asaas) usando a config do tenant.
 * Atualiza last_connection_test_at, last_connection_status e status na config.
 * Rate limit: máx 5 testes por minuto por tenant.
 */
export async function postMyTenantPaymentGatewayTest(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req as AuthRequest);
    if (!tenantId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
      return;
    }
    if (!checkPaymentGatewayTestRateLimit(tenantId)) {
      res.status(429).json({ connected: false, error: 'Máximo de 5 testes por minuto. Tente novamente em instantes.' });
      return;
    }
    const bodyGatewayKey = typeof req.body?.gateway_key === 'string' ? req.body.gateway_key.trim() : undefined;
    if (bodyGatewayKey === 'mercado_pago') {
      if (!isMercadoPagoGatewayEnabled()) {
        res.status(404).json({ connected: false, error: 'Mercado Pago não disponível.' });
        return;
      }
      try {
        const result = await testMercadoPagoIntegration(tenantId);
        res.json({ connected: result.ok, error: result.ok ? undefined : 'Mercado Pago não conectado.' });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        res.json({ connected: false, error: message });
      }
      return;
    }
    const config = await getConfigForTest('tenant', tenantId, bodyGatewayKey);
    if (!config || config.gateway_key !== 'asaas') {
      res.status(400).json({ connected: false, error: 'Gateway não configurado ou não é Asaas.' });
      return;
    }
    const api_key = typeof config.credentials?.api_key === 'string' ? config.credentials.api_key : '';
    if (!api_key) {
      res.status(400).json({ connected: false, error: 'API Key não configurada.' });
      return;
    }
    const asaasConfig = {
      api_key,
      env: config.credentials?.env === 'production' ? 'production' as const : 'sandbox' as const,
    };
    try {
      await testConnection(asaasConfig);
      await updateConnectionTestResult('tenant', tenantId, config.gateway_key, 'ok', 'active');
      invalidateGatewayCache();
      res.json({ connected: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isAuthError = message.includes('autenticação') || message.includes('401') || message.includes('403');
      await updateConnectionTestResult(
        'tenant',
        tenantId,
        config.gateway_key,
        isAuthError ? 'auth_error' : 'error',
        'error'
      );
      invalidateGatewayCache();
      res.json({
        connected: false,
        error: isAuthError ? 'Erro de autenticação' : message,
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('postMyTenantPaymentGatewayTest error:', error);
    res.status(500).json({ connected: false, error: message });
  }
}

/**
 * GET /api/me/tenant/payment-gateways
 * Lista gateways suportados (key, name, is_enabled) para dropdown no front.
 */
export async function getMyTenantPaymentGatewaysList(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req as AuthRequest);
    if (!tenantId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
      return;
    }
    const gateways = filterMercadoPagoFromTenantGatewayList(await listGateways());
    res.json(gateways);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('getMyTenantPaymentGatewaysList error:', error);
    res.status(500).json({ error: message });
  }
}

/**
 * GET /api/me/tenant/payment-gateways/status
 * Lista gateways com status para o painel (cards): configured, connection_status, last_connection_test_at, environment, webhook_configured, status.
 */
export async function getMyTenantPaymentGatewaysStatus(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req as AuthRequest);
    if (!tenantId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
      return;
    }
    const statusList = await getGatewaysStatus('tenant', tenantId);
    res.json(statusList);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('getMyTenantPaymentGatewaysStatus error:', error);
    res.status(500).json({ error: message });
  }
}

/**
 * GET /api/me/tenant/payment-gateways/webhooks/events
 * Lista últimos eventos de webhook do tenant (debug). Query: gateway_key?, limit?, offset?.
 */
export async function getMyTenantPaymentWebhookEvents(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req as AuthRequest);
    if (!tenantId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
      return;
    }
    const gatewayKey = typeof req.query.gateway_key === 'string' ? req.query.gateway_key : undefined;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const events = await listWebhookEvents({ gatewayKey, tenantId, limit, offset });
    res.json(events);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('getMyTenantPaymentWebhookEvents error:', error);
    res.status(500).json({ error: message });
  }
}

/**
 * POST /api/me/tenant/payment-gateway/disable
 * Body: { gateway_key }. Define status = 'disabled' para a config do gateway do tenant (Fase 7).
 */
export async function postMyTenantPaymentGatewayDisable(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantId(req as AuthRequest);
    if (!tenantId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
      return;
    }
    const gateway_key = typeof req.body?.gateway_key === 'string' ? req.body.gateway_key.trim() : '';
    if (!gateway_key) {
      res.status(400).json({ error: 'gateway_key é obrigatório' });
      return;
    }
    const valid = await isGatewayKeyValid(gateway_key);
    if (!valid) {
      res.status(400).json({ error: 'Gateway não existe ou não está habilitado.' });
      return;
    }
    await setTenantGatewayStatus(tenantId, gateway_key, 'disabled');
    invalidateGatewayCache();
    res.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('postMyTenantPaymentGatewayDisable error:', error);
    res.status(500).json({ error: message });
  }
}
