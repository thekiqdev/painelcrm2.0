/**
 * POST /api/billing/:billingId/pay-with-card — captura inline (Desenho A), mesmo fluxo das faturas CRM.
 * Autenticação: JWT com tenant da cobrança OU `inline_pay_token` retornado no plan-purchase (checkout anônimo).
 */
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import {
  payTenantBillingWithCard,
  PayWithCardError,
} from '../services/customerBillingService.js';

const payWithCardBodySchema = z.object({
  inline_pay_token: z.string().uuid().optional(),
  idempotency_key: z.string().min(8).max(160),
  credit_card: z.object({
    holder_name: z.string().min(2).max(120),
    number: z.string().min(13).max(22),
    expiry_month: z.string().regex(/^\d{1,2}$/),
    expiry_year: z.string().regex(/^\d{4}$/),
    cvv: z.string().min(3).max(4),
  }),
  cardholder: z.object({
    name: z.string().min(2).max(120),
    email: z.string().email().max(200),
    cpf_cnpj: z.string().min(11).max(18),
    postal_code: z.string().min(5).max(12),
    address_number: z.string().min(1).max(20),
    phone: z.string().min(8).max(20),
    address_complement: z.string().max(80).optional().nullable(),
    mobile_phone: z.string().max(20).optional().nullable(),
  }),
});

export async function postTenantBillingPayWithCard(req: AuthRequest, res: Response): Promise<void> {
  const billingId = req.params.billingId;
  if (!billingId) {
    res.status(400).json({ ok: false, error: 'Cobrança é obrigatória', code: 'validation_error' });
    return;
  }

  const parsed = payWithCardBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      ok: false,
      error: 'Verifique os dados do cartão e do titular.',
      code: 'validation_error',
    });
    return;
  }

  const tenantId = req.tenantId ?? null;
  const inlinePayToken = parsed.data.inline_pay_token?.trim() ?? null;

  if (!tenantId && !inlinePayToken) {
    res.status(403).json({
      ok: false,
      error: 'Faça login ou use o token de pagamento enviado ao gerar a cobrança.',
      code: 'forbidden',
    });
    return;
  }

  try {
    const { inline_pay_token: _t, ...body } = parsed.data;
    const result = await payTenantBillingWithCard(billingId, {
      tenantId,
      inlinePayToken,
      body,
    });
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof PayWithCardError) {
      res.status(err.statusCode).json({ ok: false, error: err.message, code: err.code });
      return;
    }
    console.error('postTenantBillingPayWithCard:', err instanceof Error ? err.message : err);
    res.status(500).json({
      ok: false,
      error: 'Não foi possível processar o pagamento. Tente novamente.',
      code: 'gateway_error',
    });
  }
}
