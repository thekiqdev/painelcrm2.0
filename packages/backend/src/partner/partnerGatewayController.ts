/**
 * M5 S3 — gateway Asaas do Partner (reusa payment_gateway_configs scope=tenant).
 */

import type { Response } from 'express';
import type { PartnerAuthRequest } from './partnerAuthMiddleware.js';
import {
  getTenantConfig,
  saveTenantConfig,
  getConfigForTest,
  updateConnectionTestResult,
  isGatewayKeyValid,
} from '../services/paymentGatewayConfigService.js';
import { invalidateGatewayCache } from '../modules/payments/gatewayProvider.js';
import { testConnection } from '../modules/gateways/asaas/index.js';
import { checkPaymentGatewayTestRateLimit } from '../middleware/paymentGatewayTestRateLimit.js';
import { paymentMethodSlugsFromConfigRow } from '../services/gatewayPaymentMethodPolicy.js';
import { canPartnerSellWithGateway } from './partnerLicenseService.js';

const ASAAS_ONLY = 'asaas';

function partnerId(req: PartnerAuthRequest): string | null {
  return req.partnerContext?.partnerTenantId ?? null;
}

export async function partnerGetGateway(req: PartnerAuthRequest, res: Response): Promise<void> {
  try {
    const id = partnerId(req);
    if (!id) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const config = await getTenantConfig(id);
    const baseUrl =
      (process.env.PUBLIC_API_URL && process.env.PUBLIC_API_URL.replace(/\/$/, '')) ||
      `${req.protocol}://${req.get('host') || ''}`;
    const sell = await canPartnerSellWithGateway(id);
    const webhookUrl =
      config?.gateway_key === ASAAS_ONLY ? `${baseUrl}/webhooks/${ASAAS_ONLY}` : null;
    res.json({
      config: config ? { ...config, webhookUrl } : null,
      can_charge: sell.ok,
      can_charge_reason: sell.reason,
      allowed_gateways: [ASAAS_ONLY],
    });
  } catch (err) {
    console.error('[partnerGetGateway]', err);
    res.status(500).json({ error: (err as Error).message || 'Internal server error' });
  }
}

export async function partnerPutGateway(req: PartnerAuthRequest, res: Response): Promise<void> {
  try {
    const id = partnerId(req);
    if (!id) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const {
      gateway_key,
      credentials,
      options,
      display_name,
      enabled_payment_methods,
      default_payment_method,
    } = req.body ?? {};
    const key = typeof gateway_key === 'string' ? gateway_key.trim() : ASAAS_ONLY;
    if (key !== ASAAS_ONLY) {
      res.status(400).json({ error: 'MVP: apenas gateway Asaas', code: 'ASAAS_ONLY' });
      return;
    }
    if (!(await isGatewayKeyValid(ASAAS_ONLY))) {
      res.status(400).json({ error: 'Gateway Asaas não habilitado no catálogo' });
      return;
    }
    const saved = await saveTenantConfig(id, {
      gateway_key: ASAAS_ONLY,
      display_name: display_name ?? 'Asaas Partner',
      credentials: typeof credentials === 'object' && credentials !== null ? credentials : {},
      options: typeof options === 'object' && options !== null ? options : {},
      ...(Array.isArray(enabled_payment_methods)
        ? { enabled_payment_methods: enabled_payment_methods.map(String) }
        : {}),
      ...(default_payment_method !== undefined
        ? {
            default_payment_method:
              default_payment_method === null || default_payment_method === ''
                ? null
                : String(default_payment_method),
          }
        : {}),
    });
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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[partnerPutGateway]', err);
    res.status(400).json({ error: message });
  }
}

export async function partnerTestGateway(req: PartnerAuthRequest, res: Response): Promise<void> {
  try {
    const id = partnerId(req);
    if (!id) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    if (!checkPaymentGatewayTestRateLimit(id)) {
      res.status(429).json({
        connected: false,
        error: 'Máximo de 5 testes por minuto. Tente novamente em instantes.',
      });
      return;
    }
    const config = await getConfigForTest('tenant', id, ASAAS_ONLY);
    if (!config || config.gateway_key !== ASAAS_ONLY) {
      res.status(400).json({ connected: false, error: 'Gateway Asaas não configurado.' });
      return;
    }
    const api_key = typeof config.credentials?.api_key === 'string' ? config.credentials.api_key : '';
    if (!api_key) {
      res.status(400).json({ connected: false, error: 'API Key não configurada.' });
      return;
    }
    const asaasConfig = {
      api_key,
      env: config.credentials?.env === 'production' ? ('production' as const) : ('sandbox' as const),
    };
    try {
      await testConnection(asaasConfig);
      await updateConnectionTestResult('tenant', id, config.gateway_key, 'ok', 'active');
      invalidateGatewayCache();
      res.json({ connected: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isAuthError =
        message.includes('autenticação') || message.includes('401') || message.includes('403');
      await updateConnectionTestResult(
        'tenant',
        id,
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
  } catch (err) {
    console.error('[partnerTestGateway]', err);
    res.status(500).json({
      connected: false,
      error: err instanceof Error ? err.message : 'Internal server error',
    });
  }
}
