import { recordProposalIntegrationEvent } from './proposalIntegrationEventsService.js';
import { notifyProposalCrm } from './proposalCrmNotifications.js';
import { convertAcceptedProposalToInvoice } from './proposalInvoiceConversionService.js';
import { enqueueProposalWebhookDelivery } from './proposalWebhookDeliveryService.js';

function pickDueDateIso(validUntil: string | null): string {
  if (validUntil && /^\d{4}-\d{2}-\d{2}$/.test(validUntil)) {
    return validUntil;
  }
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

export async function onProposalPublicAccepted(params: {
  tenantId: string;
  proposalId: string;
  ownerUserId: string;
  billingMode: string;
  validUntil: string | null;
  clientId: string | null;
}): Promise<void> {
  const evId = await recordProposalIntegrationEvent({
    tenantId: params.tenantId,
    proposalId: params.proposalId,
    eventKey: 'proposal.public_accepted',
    payload: { billing_mode: params.billingMode },
  });
  if (evId) {
    void enqueueProposalWebhookDelivery({
      tenantId: params.tenantId,
      integrationEventId: evId,
      eventKey: 'proposal.public_accepted',
    });
  }

  let msg = 'O cliente aceitou a proposta pelo link público.';
  if (params.billingMode === 'notify_team') {
    msg +=
      '\n\nPolítica pós-aceite: notificar equipe — gere a fatura no painel quando aplicável (Faturamento).';
  } else if (params.billingMode === 'auto_pending_invoice') {
    msg += '\n\nPolítica pós-aceite: o sistema tentará gerar a fatura pendente automaticamente (mesmas regras do botão "Gerar fatura").';
  }

  await notifyProposalCrm({
    ownerUserId: params.ownerUserId,
    title: 'Proposta aceita pelo cliente',
    message: msg,
    data: {
      proposal_id: params.proposalId,
      event: 'public_accepted',
      billing_mode: params.billingMode,
    },
  });

  if (params.billingMode !== 'auto_pending_invoice') return;

  if (!params.clientId) {
    await notifyProposalCrm({
      ownerUserId: params.ownerUserId,
      title: 'Fatura automática não executada',
      message:
        'A proposta foi aceita, mas não há cliente vinculado. Associe o cliente e use "Gerar fatura" no painel.',
      data: { proposal_id: params.proposalId, event: 'auto_invoice_skipped_no_client' },
    });
    return;
  }

  try {
    await convertAcceptedProposalToInvoice({
      tenantId: params.tenantId,
      actorUserId: params.ownerUserId,
      proposalId: params.proposalId,
      dueDate: pickDueDateIso(params.validUntil),
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    await notifyProposalCrm({
      ownerUserId: params.ownerUserId,
      title: 'Fatura automática falhou',
      message: `Aceite registrado, mas a fatura automática falhou: ${m.slice(0, 240)}`,
      data: { proposal_id: params.proposalId, event: 'auto_invoice_failed' },
    });
  }
}

export async function onProposalPublicRejected(params: {
  tenantId: string;
  proposalId: string;
  ownerUserId: string;
}): Promise<void> {
  const evId = await recordProposalIntegrationEvent({
    tenantId: params.tenantId,
    proposalId: params.proposalId,
    eventKey: 'proposal.public_rejected',
    payload: {},
  });
  if (evId) {
    void enqueueProposalWebhookDelivery({
      tenantId: params.tenantId,
      integrationEventId: evId,
      eventKey: 'proposal.public_rejected',
    });
  }

  await notifyProposalCrm({
    ownerUserId: params.ownerUserId,
    title: 'Proposta recusada pelo cliente',
    message: 'O cliente recusou a proposta pelo link público.',
    data: { proposal_id: params.proposalId, event: 'public_rejected' },
  });
}
