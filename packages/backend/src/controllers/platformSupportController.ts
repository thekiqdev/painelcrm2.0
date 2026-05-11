import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.js';
import { pool } from '../utils/db.js';
import {
  addPlatformSupportCustomerMessage,
  buildPublicSupportSettings,
  createPlatformSupportTicket,
  getPlatformSupportSettingsRow,
  getTenantPlatformSupportTicket,
  listPlatformSupportMessages,
  listTenantPlatformSupportTickets,
} from '../services/platformSupport/platformSupportRepository.js';
import {
  notifyCustomerPlatformSupportReply,
  notifySuperAdminsPlatformSupportTicket,
} from '../services/platformSupport/platformSupportNotifications.js';

const createTicketSchema = z.object({
  subject: z.string().min(3).max(300),
  category: z.enum([
    'question',
    'bug',
    'billing',
    'whatsapp_integration',
    'google_integration',
    'suggestion',
    'other',
  ]),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  message: z.string().min(5).max(20000),
});

const messageSchema = z.object({
  message: z.string().min(1).max(20000),
});

async function resolveTenantName(tenantId: string | null | undefined): Promise<string> {
  if (!tenantId) return 'minha empresa';
  const r = await pool.query<{ name: string }>('SELECT name FROM tenants WHERE id = $1', [tenantId]);
  return r.rows[0]?.name?.trim() || 'minha empresa';
}

export async function getPlatformSupportPublicSettings(req: AuthRequest, res: Response): Promise<void> {
  try {
    const row = await getPlatformSupportSettingsRow();
    const tenantName = await resolveTenantName(req.tenantId);
    res.json(buildPublicSupportSettings(row, tenantName));
  } catch (e) {
    console.error('[platform-support] public settings', e);
    res.status(500).json({ error: 'Erro ao carregar suporte' });
  }
}

export async function getPlatformSupportTickets(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.json([]);
      return;
    }
    const rows = await listTenantPlatformSupportTickets(tenantId);
    res.json(rows);
  } catch (e) {
    console.error('[platform-support] list tickets', e);
    res.status(500).json({ error: 'Erro ao listar chamados' });
  }
}

export async function postPlatformSupportTicket(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId;
    const userId = req.userId;
    if (!tenantId || !userId) {
      res.status(403).json({ error: 'Conta sem tenant' });
      return;
    }
    const settings = await getPlatformSupportSettingsRow();
    if (settings && !settings.support_enabled) {
      res.status(403).json({ error: 'Suporte temporariamente indisponível' });
      return;
    }
    const parsed = createTicketSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().formErrors.join('; ') || 'Dados inválidos' });
      return;
    }
    const ticket = await createPlatformSupportTicket({
      tenantId,
      userId,
      subject: parsed.data.subject,
      category: parsed.data.category,
      priority: parsed.data.priority,
      message: parsed.data.message,
    });
    const tenantName = await resolveTenantName(tenantId);
    void notifySuperAdminsPlatformSupportTicket({
      ticketId: ticket.id,
      tenantId,
      tenantName,
      subject: ticket.subject,
    });
    res.status(201).json(ticket);
  } catch (e) {
    console.error('[platform-support] create ticket', e);
    res.status(500).json({ error: 'Erro ao abrir chamado' });
  }
}

export async function getPlatformSupportTicketDetail(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(403).json({ error: 'Conta sem tenant' });
      return;
    }
    const ticket = await getTenantPlatformSupportTicket(tenantId, req.params.id);
    if (!ticket) {
      res.status(404).json({ error: 'Chamado não encontrado' });
      return;
    }
    const messages = await listPlatformSupportMessages(ticket.id);
    res.json({ ticket, messages });
  } catch (e) {
    console.error('[platform-support] ticket detail', e);
    res.status(500).json({ error: 'Erro ao carregar chamado' });
  }
}

export async function postPlatformSupportTicketMessage(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId;
    const userId = req.userId;
    if (!tenantId || !userId) {
      res.status(403).json({ error: 'Conta sem tenant' });
      return;
    }
    const parsed = messageSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Mensagem inválida' });
      return;
    }
    const message = await addPlatformSupportCustomerMessage({
      tenantId,
      ticketId: req.params.id,
      userId,
      message: parsed.data.message,
    });
    if (!message) {
      res.status(404).json({ error: 'Chamado não encontrado ou encerrado' });
      return;
    }
    res.status(201).json(message);
  } catch (e) {
    console.error('[platform-support] customer message', e);
    res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
}
