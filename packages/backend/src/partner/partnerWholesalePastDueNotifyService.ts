/**
 * M5-W Block Sprint 3 — e-mail best-effort ao marcar Partner past_due.
 */

import { pool } from '../utils/db.js';
import { sendTransactionalEmail } from '../services/email/emailDeliveryService.js';

export async function notifyPartnerWholesalePastDue(input: {
  partnerTenantId: string;
  subscriptionId: string;
  blockAfterDays: number;
}): Promise<{ sent: boolean; error?: string }> {
  try {
    const r = await pool.query<{
      email: string | null;
      public_name: string | null;
      product_name: string | null;
    }>(
      `SELECT
         (
           SELECT u.email FROM partner_memberships m
           JOIN users u ON u.id = m.user_id
           WHERE m.partner_tenant_id = pp.partner_tenant_id
             AND m.role = 'partner_admin'
             AND m.status = 'active'
           ORDER BY m.created_at ASC
           LIMIT 1
         ) AS email,
         pp.public_name,
         pp.product_name
       FROM partner_profiles pp
       WHERE pp.partner_tenant_id = $1
       LIMIT 1`,
      [input.partnerTenantId]
    );
    const row = r.rows[0];
    const to = row?.email?.trim();
    if (!to) {
      return { sent: false, error: 'no_admin_email' };
    }

    const name = row?.public_name || row?.product_name || 'Partner';
    const subject = `Canal congelado — regularize o plano Platform (${name})`;
    const html = `
      <p>Olá,</p>
      <p>O canal <strong>${escapeHtml(name)}</strong> entrou em <strong>inadimplência</strong>
      (atraso ≥ ${input.blockAfterDays} dia(s) após o vencimento).</p>
      <p>Novas vendas e alocação de licenças ficam bloqueadas até o pagamento das faturas Platform
      em aberto. Clientes existentes não são afetados.</p>
      <p>Acesse o painel do revendedor → <strong>Plano Platform</strong> para regularizar.</p>
      <p style="color:#666;font-size:12px">Ref. subscription ${escapeHtml(input.subscriptionId)}</p>
    `;

    const result = await sendTransactionalEmail({
      to,
      subject,
      html,
      eventKey: 'partner.wholesale.past_due',
      tenantId: input.partnerTenantId,
    });
    if (!result.ok) {
      return { sent: false, error: result.error };
    }
    return { sent: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[WHOLESALE] past_due email failed', msg);
    return { sent: false, error: msg };
  }
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
