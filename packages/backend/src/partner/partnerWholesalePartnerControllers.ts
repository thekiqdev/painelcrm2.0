/**
 * M5-W Sprint 2 — Partner self-serve wholesale (catálogo + subscribe).
 */

import { getInvoiceById } from '../services/invoiceService.js';
import { getSaasBillingCheckoutPresentation } from '../services/subscriptionService.js';
import { PartnerAdminError } from './partnerErrors.js';
import { listWholesalePlans, getWholesalePlan } from './partnerWholesalePlanService.js';
import { getPartnerDetail } from './partnerRepository.js';
import { createPartnerWholesaleCheckout } from './partnerWholesaleCheckoutService.js';
import type { PartnerAuthRequest } from './partnerAuthMiddleware.js';
import type { Response } from 'express';
import { z } from 'zod';

function handleErr(err: unknown, res: Response): void {
  if (err instanceof PartnerAdminError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  console.error('[partner-wholesale]', err);
  res.status(500).json({ error: (err as Error)?.message || 'Internal server error' });
}

/** GET /api/partner/wholesale/plans — catálogo active */
export async function partnerListWholesalePlans(
  req: PartnerAuthRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.partnerContext?.partnerTenantId) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const items = await listWholesalePlans({ includeArchived: false });
    res.json(items.filter((p) => p.status === 'active'));
  } catch (err) {
    handleErr(err, res);
  }
}

/** GET /api/partner/wholesale/status — plano atual + pending billing + paywall */
export async function partnerGetWholesaleStatus(
  req: PartnerAuthRequest,
  res: Response
): Promise<void> {
  try {
    const partnerId = req.partnerContext?.partnerTenantId;
    if (!partnerId) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const detail = await getPartnerDetail(partnerId);
    if (!detail) {
      res.status(404).json({ error: 'Partner não encontrado' });
      return;
    }

    let plan = null;
    if (detail.wholesale_plan_id) {
      plan = await getWholesalePlan(detail.wholesale_plan_id);
    }

    const { getPartnerWholesalePaywallState, isPartnerWholesalePaywallActive } = await import(
      './partnerWholesalePaywallService.js'
    );
    const { quoteWholesaleRecurringAmount } = await import('./partnerWholesaleRecurringService.js');
    const paywall = await getPartnerWholesalePaywallState(partnerId);
    const pending = paywall.open_invoices.find((i) => i.billing_reason === 'partner_wholesale')
      ?? paywall.open_invoices[0]
      ?? null;
    const recurring = await quoteWholesaleRecurringAmount(partnerId);

    res.json({
      wholesale_status: detail.wholesale_status,
      wholesale_plan_id: detail.wholesale_plan_id,
      wholesale_plan_name: detail.wholesale_plan_name,
      wholesale_subscription_id: detail.wholesale_subscription_id,
      purchased_seats: detail.purchased_seats,
      used_seats_cache: detail.used_seats_cache,
      recurring_amount_cents: recurring?.recurring_amount_cents ?? null,
      recurring_extras_cents: recurring?.extras_cents ?? null,
      extra_seats: recurring?.extra_seats ?? null,
      plan,
      pending_billing: pending
        ? {
            id: pending.id,
            amount_cents: pending.amount_cents,
            status: pending.status,
            payment_method: pending.payment_method,
            due_date: pending.due_date,
            billing_reason: pending.billing_reason,
          }
        : null,
      open_invoices: paywall.open_invoices,
      paywall_active: isPartnerWholesalePaywallActive(detail.wholesale_status),
    });
  } catch (err) {
    handleErr(err, res);
  }
}

const subscribeSchema = z.object({
  wholesale_plan_id: z.string().uuid(),
  payment_method: z.enum(['PIX', 'BOLETO', 'CREDIT_CARD']).optional(),
});

/** POST /api/partner/wholesale/subscribe */
export async function partnerSubscribeWholesale(
  req: PartnerAuthRequest,
  res: Response
): Promise<void> {
  try {
    const partnerId = req.partnerContext?.partnerTenantId;
    if (!partnerId) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const parsed = subscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
      return;
    }

    const checkout = await createPartnerWholesaleCheckout({
      partnerTenantId: partnerId,
      wholesalePlanId: parsed.data.wholesale_plan_id,
      paymentMethod: parsed.data.payment_method ?? 'PIX',
      source: 'self_service',
      actorUserId: req.user?.id ?? null,
    });

    res.status(201).json({
      billing: checkout.billing,
      plan: checkout.plan,
      paymentUrls: checkout.paymentUrls ?? null,
      settled: checkout.settled === true,
    });
  } catch (err) {
    handleErr(err, res);
  }
}

/** GET /api/partner/wholesale/billing/:billingId — apresentação checkout / status */
export async function partnerGetWholesaleBilling(
  req: PartnerAuthRequest,
  res: Response
): Promise<void> {
  try {
    const partnerId = req.partnerContext?.partnerTenantId;
    if (!partnerId) {
      res.status(403).json({ error: 'Partner context missing' });
      return;
    }
    const billing = await getInvoiceById(req.params.billingId);
    if (!billing || billing.tenant_id !== partnerId) {
      res.status(404).json({ error: 'Cobrança não encontrada' });
      return;
    }
    if ((billing.billing_reason ?? '') !== 'partner_wholesale') {
      res.status(404).json({ error: 'Cobrança não encontrada' });
      return;
    }

    if (billing.status === 'paid') {
      res.json({ billing, paymentUrls: null, paid: true });
      return;
    }

    const presentation = await getSaasBillingCheckoutPresentation(partnerId, billing.id);
    res.json({
      billing,
      paymentUrls: presentation
        ? {
            invoiceUrl: presentation.invoice_url,
            bankSlipUrl: presentation.bank_slip_url,
            bankSlipDigitableLine: presentation.bank_slip_digitable_line,
            pixQrCode: presentation.pix_qr_code,
            pixCopyPaste: presentation.pix_copy_paste,
          }
        : null,
      paid: false,
    });
  } catch (err) {
    handleErr(err, res);
  }
}
