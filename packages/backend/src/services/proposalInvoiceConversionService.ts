import { pool } from '../utils/db.js';
import { createManualInvoice } from './customerBillingService.js';
import type { CustomerInvoiceRow, CreateManualCustomerInvoiceItemInput } from './customerInvoiceService.js';
import { insertProposalTimelineEvent } from './proposalTimelineService.js';
import { recordProposalIntegrationEvent } from './proposalIntegrationEventsService.js';
import { notifyProposalCrm } from './proposalCrmNotifications.js';
import { enqueueProposalWebhookDelivery } from './proposalWebhookDeliveryService.js';
import { getActiveConfig, type PaymentGatewayConfigRow } from './paymentGatewayConfigService.js';
import { resolveAutomaticInvoicePaymentMethod } from './gatewayPaymentMethodPolicy.js';

export interface ProposalRowForConversion {
  id: string;
  user_id: string;
  client_id: string | null;
  status: string;
  title: string;
  description: string | null;
  amount: string | number;
  items: unknown;
  converted_invoice_id: string | null;
}

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Monta linhas de fatura a partir do JSON de itens da proposta; fallback em linha única pelo valor total. */
export function buildInvoiceItemsFromProposal(params: {
  items: unknown;
  title: string;
  totalAmountBrl: number;
}): CreateManualCustomerInvoiceItemInput[] {
  const raw = Array.isArray(params.items) ? params.items : [];
  const lines: CreateManualCustomerInvoiceItemInput[] = [];

  for (let i = 0; i < raw.length; i++) {
    const row = raw[i] as Record<string, unknown>;
    const description = String(row.description ?? '').trim() || `Item ${i + 1}`;
    const quantity = Math.max(0, Number(row.quantity) || 0);
    const unitPrice = Math.max(0, Number(row.unitPrice ?? row.unit_price) || 0);
    const discountBrl = Math.max(0, Number(row.discount ?? row.discount_brl) || 0);
    if (quantity <= 0) continue;
    const unit_price_cents = Math.round(unitPrice * 100);
    const discount_cents = Math.round(discountBrl * 100);
    if (unit_price_cents <= 0 && discount_cents <= 0) continue;
    lines.push({
      description,
      quantity,
      unit_price_cents,
      discount_cents,
    });
  }

  if (lines.length === 0) {
    const amt = Math.max(0, params.totalAmountBrl);
    if (amt <= 0) {
      throw new Error('Proposta sem itens válidos e sem valor total para faturar');
    }
    return [
      {
        description: params.title.trim() || 'Proposta',
        quantity: 1,
        unit_price_cents: Math.round(amt * 100),
        discount_cents: 0,
      },
    ];
  }

  return lines;
}

export function buildInvoiceDescriptionFromProposal(title: string, description: string | null): string {
  const head = `Proposta: ${title.trim()}`;
  const body = (description ?? '').trim();
  if (!body) return head;
  return `${head}\n${body}`;
}

export async function loadProposalForConversion(
  tenantId: string,
  proposalId: string
): Promise<ProposalRowForConversion | null> {
  const r = await pool.query<ProposalRowForConversion>(
    `SELECT p.id, p.user_id, p.client_id, p.status, p.title, p.description, p.amount, p.items,
            p.converted_invoice_id
     FROM proposals p
     INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $1
     WHERE p.id = $2`,
    [tenantId, proposalId]
  );
  return r.rows[0] ?? null;
}

export async function convertAcceptedProposalToInvoice(params: {
  tenantId: string;
  actorUserId: string;
  proposalId: string;
  dueDate: string;
  paymentMethod?: string | null;
  allowedPaymentMethods?: string[] | null;
  gatewayKey?: string | null;
}): Promise<{ invoice: CustomerInvoiceRow }> {
  const proposal = await loadProposalForConversion(params.tenantId, params.proposalId);
  if (!proposal) {
    throw new Error('Proposta não encontrada');
  }
  if (proposal.status !== 'accepted') {
    throw new Error('Apenas propostas aceitas podem ser convertidas em fatura');
  }
  if (!proposal.client_id) {
    throw new Error('Proposta sem cliente vinculado');
  }
  if (proposal.converted_invoice_id) {
    throw new Error('Esta proposta já possui fatura gerada');
  }

  const dup = await pool.query<{ id: string }>(
    `SELECT id FROM customer_invoices WHERE tenant_id = $1 AND proposal_id = $2 LIMIT 1`,
    [params.tenantId, params.proposalId]
  );
  if (dup.rows.length > 0) {
    throw new Error('Já existe fatura vinculada a esta proposta');
  }

  const totalAmountBrl =
    typeof proposal.amount === 'string' ? parseFloat(proposal.amount || '0') : Number(proposal.amount) || 0;
  const items = buildInvoiceItemsFromProposal({
    items: proposal.items,
    title: proposal.title,
    totalAmountBrl: roundMoney2(totalAmountBrl),
  });
  const description = buildInvoiceDescriptionFromProposal(proposal.title, proposal.description);

  let gatewayRowForPolicy = await getActiveConfig('crm', params.tenantId);
  if (params.gatewayKey) {
    const gr = await pool.query<{
      enabled_payment_methods: unknown;
      default_payment_method: string | null;
    }>(
      `SELECT enabled_payment_methods, default_payment_method
       FROM payment_gateway_configs
       WHERE scope = 'tenant' AND tenant_id = $1 AND gateway_key = $2
         AND is_active = true AND status = 'active'
       LIMIT 1`,
      [params.tenantId, params.gatewayKey]
    );
    if (gr.rows[0]) {
      gatewayRowForPolicy = gr.rows[0] as PaymentGatewayConfigRow;
    }
  }
  const paymentMethodForInvoice = resolveAutomaticInvoicePaymentMethod(
    params.paymentMethod ?? null,
    gatewayRowForPolicy
  );

  let invoice: CustomerInvoiceRow;
  try {
    const result = await createManualInvoice(params.tenantId, {
      client_id: proposal.client_id,
      due_date: params.dueDate,
      description,
      payment_method: paymentMethodForInvoice,
      allowed_payment_methods: params.allowedPaymentMethods ?? null,
      gateway_key: params.gatewayKey ?? null,
      items,
      proposal_id: params.proposalId,
      initial_invoice_status: 'waiting_payment',
    });
    invoice = result.invoice;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('duplicate key') || msg.includes('uq_customer_invoices_proposal')) {
      throw new Error('Já existe fatura vinculada a esta proposta');
    }
    throw e;
  }

  const upd = await pool.query(
    `UPDATE proposals
     SET status = 'invoiced', converted_invoice_id = $1, updated_at = now()
     WHERE id = $2 AND converted_invoice_id IS NULL`,
    [invoice.id, params.proposalId]
  );
  if ((upd.rowCount ?? 0) === 0) {
    console.error(
      '[convertAcceptedProposalToInvoice] Fatura criada mas proposta não atualizada; reconciliar manualmente.',
      { proposalId: params.proposalId, invoiceId: invoice.id }
    );
  }

  try {
    await insertProposalTimelineEvent({
      proposalId: params.proposalId,
      eventType: 'invoice_created',
      payload: {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number ?? null,
      },
      actorUserId: params.actorUserId,
    });
  } catch (e) {
    console.error('[convertAcceptedProposalToInvoice] timeline invoice_created failed:', e);
  }

  try {
    const evId = await recordProposalIntegrationEvent({
      tenantId: params.tenantId,
      proposalId: params.proposalId,
      eventKey: 'proposal.invoiced',
      payload: {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number ?? null,
        actor_user_id: params.actorUserId,
      },
    });
    if (evId) {
      void enqueueProposalWebhookDelivery({
        tenantId: params.tenantId,
        integrationEventId: evId,
        eventKey: 'proposal.invoiced',
      });
    }
  } catch (e) {
    console.error('[convertAcceptedProposalToInvoice] integration event failed:', e);
  }

  try {
    const invLabel = invoice.invoice_number ? String(invoice.invoice_number) : invoice.id.slice(0, 8);
    await notifyProposalCrm({
      ownerUserId: proposal.user_id,
      title: `Fatura gerada (${invLabel})`,
      message: `A proposta "${proposal.title}" foi convertida em fatura.`,
      data: {
        proposal_id: params.proposalId,
        invoice_id: invoice.id,
        event: 'invoiced',
      },
    });
  } catch (e) {
    console.error('[convertAcceptedProposalToInvoice] CRM notify failed:', e);
  }

  return { invoice };
}
