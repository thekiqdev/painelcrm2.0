import type { Request, Response } from 'express';
import {
  createStorePublicCheckout,
  getStoreCheckoutClientEligibility,
} from '../services/storePublicCheckoutService.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function badRequest(res: Response, message: string) {
  return res.status(400).json({ ok: false, error: message });
}

export async function postStoreCheckoutClientEligibility(req: Request, res: Response) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const store_slug = typeof body.store_slug === 'string' ? body.store_slug.trim() : '';
  const customer_phone = typeof body.customer_phone === 'string' ? body.customer_phone.trim() : '';

  if (!store_slug) return badRequest(res, 'store_slug é obrigatório');
  if (!customer_phone) return badRequest(res, 'Telefone é obrigatório');

  try {
    const result = await getStoreCheckoutClientEligibility({ store_slug, customer_phone });
    return res.status(200).json({ ok: true, needs_cpf: result.needs_cpf });
  } catch (e: unknown) {
    const err = e as { statusCode?: number; message?: string; field?: string; code?: string };
    const status = typeof err.statusCode === 'number' ? err.statusCode : 500;
    const message =
      status === 500 ? 'Erro ao verificar dados' : err.message || 'Erro ao verificar dados';
    const payload: Record<string, unknown> = { ok: false, error: message };
    if (typeof err.field === 'string') payload.field = err.field;
    if (typeof err.code === 'string') payload.code = err.code;
    return res.status(status).json(payload);
  }
}

export async function postStoreCheckoutCreate(req: Request, res: Response) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const headerIdemp = (req.get('Idempotency-Key') || '').trim();
  const bodyIdemp =
    typeof body.idempotency_key === 'string' ? body.idempotency_key.trim() : '';
  const idempotencyKey = headerIdemp || bodyIdemp || null;

  const store_slug = typeof body.store_slug === 'string' ? body.store_slug.trim() : '';
  const product_id = typeof body.product_id === 'string' ? body.product_id.trim() : '';
  const quantity = Number(body.quantity);
  const customer_name = typeof body.customer_name === 'string' ? body.customer_name.trim() : '';
  const customer_email = typeof body.customer_email === 'string' ? body.customer_email.trim() : '';
  const customer_phone = typeof body.customer_phone === 'string' ? body.customer_phone.trim() : '';
  const customer_cpf_cnpj =
    typeof body.customer_cpf_cnpj === 'string' ? body.customer_cpf_cnpj.trim() : '';

  let expected_total_cents: number | null = null;
  if (body.expected_total_cents != null && body.expected_total_cents !== '') {
    const n = Number(body.expected_total_cents);
    if (!Number.isFinite(n) || n < 1) {
      return badRequest(res, 'expected_total_cents inválido');
    }
    expected_total_cents = Math.round(n);
  }

  if (!store_slug) return badRequest(res, 'store_slug é obrigatório');
  if (!product_id) return badRequest(res, 'product_id é obrigatório');
  if (!Number.isFinite(quantity) || quantity !== 1) {
    return badRequest(res, 'quantity deve ser 1');
  }
  if (!customer_name || customer_name.length > 200) {
    return badRequest(res, 'Nome inválido');
  }
  if (!customer_email || !EMAIL_RE.test(customer_email) || customer_email.length > 320) {
    return badRequest(res, 'E-mail inválido');
  }
  if (!customer_phone || customer_phone.length < 8) {
    return badRequest(res, 'Telefone é obrigatório');
  }
  if (customer_phone.length > 40) {
    return badRequest(res, 'Telefone inválido');
  }

  try {
    const result = await createStorePublicCheckout({
      store_slug,
      product_id,
      quantity,
      customer_name,
      customer_email,
      customer_phone,
      customer_cpf_cnpj: customer_cpf_cnpj || null,
      idempotency_key: idempotencyKey,
      expected_total_cents: expected_total_cents,
    });
    return res.status(201).json({
      ok: true,
      order_id: result.order_id,
      order_number: result.order_number,
      customer_invoice_id: result.customer_invoice_id,
      payment_token: result.payment_token,
      amount_cents: result.amount_cents,
    });
  } catch (e: unknown) {
    const err = e as { statusCode?: number; message?: string; field?: string; code?: string };
    const status = typeof err.statusCode === 'number' ? err.statusCode : 500;
    const message =
      status === 500 ? 'Erro ao processar checkout' : err.message || 'Erro ao processar checkout';
    const payload: Record<string, unknown> = { ok: false, error: message };
    if (typeof err.field === 'string') payload.field = err.field;
    if (typeof err.code === 'string') payload.code = err.code;
    return res.status(status).json(payload);
  }
}
