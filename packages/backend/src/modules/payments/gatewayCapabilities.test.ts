import { describe, expect, it } from 'vitest';
import {
  EMPTY_GATEWAY_CAPABILITIES,
  GATEWAY_CAPABILITIES_CATALOG,
  getGatewayCapabilities,
  gatewaySupports,
  listGatewayCapabilityCatalog,
} from './gatewayCapabilities.js';
import { listRegisteredGatewayKeys, isGatewayRegistered } from './gatewayRegistry.js';
import { getStripeSaasSkeletonGateway, StripeSaasSkeletonError } from '../gateways/stripe/stripeSaasSkeleton.js';

describe('gatewayCapabilities (Sprint 11)', () => {
  it('Asaas declara pix + cardToken + pixAutomatic', () => {
    const c = getGatewayCapabilities('asaas');
    expect(c.pix).toBe(true);
    expect(c.cardToken).toBe(true);
    expect(c.pixAutomatic).toBe(true);
    expect(gatewaySupports('asaas', 'pixAutomatic')).toBe(true);
  });

  it('Stripe skeleton não declara pixAutomatic', () => {
    expect(gatewaySupports('stripe', 'pixAutomatic')).toBe(false);
    expect(gatewaySupports('stripe', 'creditCard')).toBe(true);
  });

  it('gateway desconhecido = empty', () => {
    expect(getGatewayCapabilities('unknown_psp')).toEqual(EMPTY_GATEWAY_CAPABILITIES);
  });

  it('catálogo lista asaas e stripe', () => {
    const keys = listGatewayCapabilityCatalog().map((x) => x.gateway_key);
    expect(keys).toContain('asaas');
    expect(keys).toContain('stripe');
    expect(GATEWAY_CAPABILITIES_CATALOG.asaas.webhooks).toBe(true);
  });
});

describe('gatewayRegistry (Sprint 11)', () => {
  it('registra asaas e stripe', () => {
    expect(isGatewayRegistered('asaas')).toBe(true);
    expect(isGatewayRegistered('stripe')).toBe(true);
    expect(listRegisteredGatewayKeys()).toEqual(expect.arrayContaining(['asaas', 'stripe']));
  });

  it('skeleton Stripe lança em createCharge', async () => {
    const gw = getStripeSaasSkeletonGateway({ api_key: 'sk_test', env: 'sandbox' });
    expect(gw).not.toBeNull();
    expect(gw!.capabilities?.creditCard).toBe(true);
    await expect(gw!.createCharge({
      customerId: 'cus_x',
      amountCents: 1000,
      dueDate: '2026-08-01',
      paymentMethod: 'CREDIT_CARD',
    })).rejects.toBeInstanceOf(StripeSaasSkeletonError);
  });
});
