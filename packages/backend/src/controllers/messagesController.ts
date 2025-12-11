import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { sendMessage } from '../services/messageService.js';
import { z } from 'zod';

const sendMessageSchema = z.object({
  templateId: z.string().uuid().optional(),
  resourceType: z.string().optional(),
  action: z.string().optional(),
  recipientEmail: z.string().email().optional(),
  recipientPhone: z.string().optional(),
  channel: z.enum(['email', 'whatsapp', 'both']),
  subject: z.string().optional(),
  body: z.string().optional(),
  variables: z.record(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});

// POST /api/messages/send
export async function sendNotificationMessage(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const data = sendMessageSchema.parse(req.body);

    // Validar que pelo menos um canal de destino foi fornecido
    if (!data.recipientEmail && !data.recipientPhone) {
      res.status(400).json({ error: 'É necessário fornecer email ou telefone do destinatário' });
      return;
    }

    // Validar que pelo menos templateId ou (resourceType + action) foram fornecidos, ou body
    if (!data.templateId && (!data.resourceType || !data.action) && !data.body) {
      res.status(400).json({ 
        error: 'É necessário fornecer templateId, (resourceType + action) ou body da mensagem' 
      });
      return;
    }

    const result = await sendMessage({
      userId,
      templateId: data.templateId,
      resourceType: data.resourceType,
      action: data.action,
      recipientEmail: data.recipientEmail,
      recipientPhone: data.recipientPhone,
      channel: data.channel,
      subject: data.subject,
      body: data.body,
      variables: data.variables,
      metadata: data.metadata,
    });

    if (result.success) {
      res.json({
        success: true,
        messageLogId: result.messageLogId,
        message: 'Mensagem enviada com sucesso',
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Erro ao enviar mensagem',
      });
    }
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ 
        error: 'Dados inválidos',
        details: error.errors,
      });
      return;
    }

    console.error('Error sending notification message:', error);
    res.status(500).json({ 
      error: 'Erro ao enviar mensagem',
      details: error.message,
    });
  }
}


