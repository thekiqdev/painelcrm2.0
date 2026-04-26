import type { ProposalCreateSuccessPayload } from '@/components/proposals/ProposalCreateForm';
import { chatService } from '@/services/chat';
import { recordClientTimelineEvent } from '@/services/clientTimeline';
import { customerInvoicesService } from '@/services/customerInvoices';
import { messagesService } from '@/services/messages';
import { buildInvoiceLink } from '@/services/chatFinancialAdapter';

export type ChatNotifyContact = {
  displayName: string;
  phone?: string | null;
  email?: string | null;
  crmClientId?: string | null;
};

async function syncChatAfterOutboundNotification(resultConversationId: string | undefined, phone: string | undefined) {
  if (!resultConversationId || !phone) return;
  try {
    await new Promise((r) => setTimeout(r, 500));
    await chatService.syncConversationMessages(resultConversationId, { limit: 100, syncMode: 'full' });
  } catch (e) {
    console.error('Erro ao sincronizar mensagens após notificação (fluxo global pós-chat):', e);
  }
}

export async function runAfterChatProposalCreated(params: {
  created: ProposalCreateSuccessPayload;
  mode: 'sent' | 'draft';
  conversationId: string | null;
  contact: ChatNotifyContact | null;
}): Promise<void> {
  const { created, mode, conversationId, contact } = params;
  const clientIdForTimeline = contact?.crmClientId?.trim() || created.client_id?.trim() || null;
  if (clientIdForTimeline) {
    try {
      await recordClientTimelineEvent(clientIdForTimeline, {
        event_name: mode === 'sent' ? 'chat_proposal_created' : 'chat_proposal_draft_saved',
        source: 'chat',
        actor_type: 'user',
        reference_type: 'proposal',
        reference_id: created.id,
        event_key: `chat_proposal_${mode}:${created.id}`,
        metadata: {
          conversation_id: conversationId,
          proposal_status: mode,
        },
      });
    } catch (e) {
      console.error('Erro ao registrar timeline da proposta criada no chat:', e);
    }
  }

  if (!contact) return;
  const phone = contact.phone?.trim() || undefined;
  const email = contact.email?.trim() || undefined;
  if (!phone && !email) return;

  try {
    const proposalLink = created.public_link_path
      ? `${window.location.origin}${created.public_link_path}`
      : `${window.location.origin}/proposals/${created.id}`;
    const result = await messagesService.send({
      resourceType: 'proposals',
      action: 'created',
      recipientPhone: phone,
      recipientEmail: email,
      channel: phone ? 'whatsapp' : 'email',
      variables: {
        client_name: contact.displayName || 'Cliente',
        proposal_title: created.title,
        proposal_amount: (created.amount ?? 0).toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        proposal_link: proposalLink,
      },
      metadata: {
        resource_id: created.id,
        ...(contact.crmClientId?.trim() ? { client_id: contact.crmClientId.trim() } : {}),
        created_from: 'chat_quick_action',
      },
    });
    await syncChatAfterOutboundNotification(result?.conversationId, phone);
  } catch (e) {
    console.error('Erro ao notificar proposta criada a partir do chat:', e);
  }
}

export async function runAfterChatInvoiceCreated(params: {
  invoiceId: string;
  conversationId: string | null;
  contact: ChatNotifyContact | null;
}): Promise<void> {
  const { invoiceId, conversationId, contact } = params;
  try {
    const invoice = await customerInvoicesService.getById(invoiceId);
    const clientIdForTimeline = contact?.crmClientId?.trim() || invoice?.client_id?.trim() || null;
    if (clientIdForTimeline) {
      await recordClientTimelineEvent(clientIdForTimeline, {
        event_name: 'chat_invoice_created',
        source: 'chat',
        actor_type: 'user',
        reference_type: 'customer_invoice',
        reference_id: invoiceId,
        event_key: `chat_invoice_created:${invoiceId}`,
        metadata: {
          conversation_id: conversationId,
        },
      });
    }
    if (!invoice?.payment_token || !contact) return;
    const phone = contact.phone?.trim() || undefined;
    const email = contact.email?.trim() || undefined;
    if (!phone && !email) return;

    const dueDate = new Date(invoice.due_date).toLocaleDateString('pt-BR');
    const sendResult = await messagesService.send({
      resourceType: 'invoices',
      action: 'created',
      recipientPhone: phone,
      recipientEmail: email,
      channel: phone ? 'whatsapp' : 'email',
      variables: {
        client_name: contact.displayName || 'Cliente',
        invoice_number: invoice.invoice_number || invoice.id.slice(0, 8).toUpperCase(),
        invoice_total: (invoice.amount_cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
        due_date: dueDate,
        invoice_link: buildInvoiceLink(invoice.payment_token),
      },
      metadata: {
        resource_id: invoice.id,
        ...(contact.crmClientId?.trim() ? { client_id: contact.crmClientId.trim() } : {}),
        created_from: 'chat_quick_action',
      },
    });
    const sentOk = Boolean(sendResult?.success);
    if (sentOk && clientIdForTimeline) {
      await recordClientTimelineEvent(clientIdForTimeline, {
        event_name: 'chat_invoice_sent',
        source: 'chat',
        actor_type: 'user',
        reference_type: 'customer_invoice',
        reference_id: invoice.id,
        event_key: `chat_invoice_sent:${invoice.id}:${conversationId ?? 'unknown'}`,
        metadata: {
          channel: 'whatsapp',
          conversation_id: conversationId,
        },
      });
    }
    await syncChatAfterOutboundNotification(sendResult?.conversationId, phone);
  } catch (e) {
    console.error('Erro no follow-up da fatura criada a partir do chat:', e);
  }
}
