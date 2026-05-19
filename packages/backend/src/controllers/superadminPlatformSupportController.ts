import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.js';
import {
  addPlatformSupportSuperadminMessage,
  getPlatformSupportSettingsRow,
  getPlatformSupportSummary,
  getPlatformSupportTicketById,
  listAllPlatformSupportTickets,
  listPlatformSupportMessages,
  updatePlatformSupportTicketStatus,
  upsertPlatformSupportSettings,
} from '../services/platformSupport/platformSupportRepository.js';
import {
  notifyTenantPlatformSupportPublicReply,
  notifyTenantPlatformSupportStatusChanged,
} from '../services/platformSupport/platformSupportNotifications.js';
import { normalizeBrazilWhatsappNumber } from '../services/platformSupport/platformSupportWhatsapp.js';

const settingsSchema = z
  .object({
    support_enabled: z.boolean().optional(),
    whatsapp_number: z.union([z.string().max(40), z.null()]).optional(),
    whatsapp_message_template: z.string().min(5).max(2000).optional(),
  })
  .strict();

const messageSchema = z.object({
  message: z.string().min(1).max(20000),
});

const statusSchema = z.object({
  status: z.enum(['open', 'waiting_support', 'waiting_customer', 'resolved', 'closed']),
});

export async function getSuperadminPlatformSupportSettings(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const row = await getPlatformSupportSettingsRow();
    res.json({
      support_enabled: row?.support_enabled ?? true,
      whatsapp_number: row?.whatsapp_number ?? null,
      whatsapp_message_template:
        row?.whatsapp_message_template ??
        'Olá, preciso de suporte no PainelCRM. Minha empresa é {{tenant_name}}.',
    });
  } catch (e) {
    console.error('[superadmin/platform-support] get settings', e);
    res.status(500).json({ error: 'Erro ao carregar configurações' });
  }
}

export async function putSuperadminPlatformSupportSettings(req: AuthRequest, res: Response): Promise<void> {
  try {
    const parsed = settingsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().formErrors.join('; ') || 'Payload inválido' });
      return;
    }
    if (parsed.data.whatsapp_number !== undefined && parsed.data.whatsapp_number !== null) {
      const normalized = normalizeBrazilWhatsappNumber(parsed.data.whatsapp_number);
      if (!normalized) {
        res.status(400).json({ error: 'Número de WhatsApp inválido' });
        return;
      }
    }
    const row = await upsertPlatformSupportSettings(parsed.data);
    res.json({
      support_enabled: row.support_enabled,
      whatsapp_number: row.whatsapp_number,
      whatsapp_message_template: row.whatsapp_message_template,
    });
  } catch (e) {
    console.error('[superadmin/platform-support] put settings', e);
    res.status(500).json({ error: 'Erro ao salvar configurações' });
  }
}

export async function getSuperadminPlatformSupportSummary(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const { counts, latest } = await getPlatformSupportSummary();
    res.json({
      open: counts.open,
      waiting_support: counts.waiting_support,
      waiting_customer: counts.waiting_customer,
      urgent: counts.urgent,
      resolved_today: counts.resolved_today,
      latest,
    });
  } catch (e) {
    console.error('[superadmin/platform-support] summary', e);
    res.status(500).json({ error: 'Erro ao carregar resumo de suporte' });
  }
}

export async function getSuperadminPlatformSupportTickets(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { status, priority, category, tenant_id, search } = req.query;
    const rows = await listAllPlatformSupportTickets({
      status: typeof status === 'string' ? status : undefined,
      priority: typeof priority === 'string' ? priority : undefined,
      category: typeof category === 'string' ? category : undefined,
      tenantId: typeof tenant_id === 'string' ? tenant_id : undefined,
      search: typeof search === 'string' ? search : undefined,
    });
    res.json(rows);
  } catch (e) {
    console.error('[superadmin/platform-support] list tickets', e);
    res.status(500).json({ error: 'Erro ao listar chamados' });
  }
}

export async function getSuperadminPlatformSupportTicketDetail(req: AuthRequest, res: Response): Promise<void> {
  try {
    const ticket = await getPlatformSupportTicketById(req.params.id);
    if (!ticket) {
      res.status(404).json({ error: 'Chamado não encontrado' });
      return;
    }
    const messages = await listPlatformSupportMessages(ticket.id);
    res.json({ ticket, messages });
  } catch (e) {
    console.error('[superadmin/platform-support] ticket detail', e);
    res.status(500).json({ error: 'Erro ao carregar chamado' });
  }
}

export async function postSuperadminPlatformSupportTicketMessage(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    const parsed = messageSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Mensagem inválida' });
      return;
    }
    const ticket = await getPlatformSupportTicketById(req.params.id);
    if (!ticket) {
      res.status(404).json({ error: 'Chamado não encontrado' });
      return;
    }
    const message = await addPlatformSupportSuperadminMessage({
      ticketId: req.params.id,
      userId,
      message: parsed.data.message,
    });
    if (!message) {
      res.status(400).json({ error: 'Não foi possível responder' });
      return;
    }
    void notifyTenantPlatformSupportPublicReply({
      ticketId: ticket.id,
      tenantId: ticket.tenant_id,
      subject: ticket.subject,
      status: 'waiting_customer',
      messagePreview: parsed.data.message,
    });
    res.status(201).json(message);
  } catch (e) {
    console.error('[superadmin/platform-support] reply', e);
    res.status(500).json({ error: 'Erro ao enviar resposta' });
  }
}

export async function patchSuperadminPlatformSupportTicketStatus(req: AuthRequest, res: Response): Promise<void> {
  try {
    const parsed = statusSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Status inválido' });
      return;
    }
    const before = await getPlatformSupportTicketById(req.params.id);
    if (!before) {
      res.status(404).json({ error: 'Chamado não encontrado' });
      return;
    }
    const ticket = await updatePlatformSupportTicketStatus(req.params.id, parsed.data.status);
    if (!ticket) {
      res.status(404).json({ error: 'Chamado não encontrado' });
      return;
    }
    if (before.status !== ticket.status) {
      void notifyTenantPlatformSupportStatusChanged({
        ticketId: ticket.id,
        tenantId: ticket.tenant_id,
        subject: ticket.subject,
        previousStatus: before.status,
        nextStatus: ticket.status,
        status: ticket.status,
      });
    }
    res.json(ticket);
  } catch (e) {
    console.error('[superadmin/platform-support] status', e);
    res.status(500).json({ error: 'Erro ao atualizar status' });
  }
}
