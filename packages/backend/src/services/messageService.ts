import { pool } from '../utils/db.js';
import { uazapiService } from './uazapi.js';

export interface SendMessageParams {
  userId: string;
  templateId?: string;
  resourceType?: string;
  action?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  channel: 'email' | 'whatsapp' | 'both';
  subject?: string;
  body?: string;
  variables?: Record<string, string>;
  metadata?: Record<string, any>;
}

/**
 * Substitui variáveis no template pelo valor real
 */
function replaceVariables(template: string, variables: Record<string, string> = {}): string {
  let result = template;
  Object.keys(variables).forEach(key => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, variables[key] || `{{${key}}}`);
  });
  return result;
}

/**
 * Envia mensagem via WhatsApp usando UazAPI
 */
async function sendWhatsAppMessage(
  userId: string,
  phoneNumber: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Buscar instância conectada do WhatsApp para o usuário
    const instanceResult = await pool.query(
      `SELECT i.instance_token, i.external_instance_name
       FROM chat_instances i
       WHERE i.user_id = $1 AND i.status = 'connected'
       LIMIT 1`,
      [userId]
    );

    if (instanceResult.rows.length === 0) {
      return { success: false, error: 'Nenhuma instância WhatsApp ativa encontrada' };
    }

    const instance = instanceResult.rows[0];
    
    // Enviar mensagem via UazAPI
    await uazapiService.sendTextMessage(instance.instance_token, {
      number: phoneNumber,
      text: message,
      readchat: false,
      readmessages: false,
      delay: 0,
      track_source: 'painelcrm',
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error sending WhatsApp message:', error);
    return { success: false, error: error.message || 'Erro ao enviar mensagem WhatsApp' };
  }
}

/**
 * Envia mensagem via Email
 * TODO: Implementar serviço de email (nodemailer, sendgrid, etc)
 */
async function sendEmailMessage(
  userId: string,
  recipientEmail: string,
  subject: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // TODO: Implementar envio de email
    // Por enquanto, apenas logamos
    console.log('Email would be sent:', {
      to: recipientEmail,
      subject,
      body: body.substring(0, 100) + '...',
    });

    // Simular sucesso por enquanto
    return { success: true };
  } catch (error: any) {
    console.error('Error sending email:', error);
    return { success: false, error: error.message || 'Erro ao enviar email' };
  }
}

/**
 * Envia mensagem usando template ou corpo personalizado
 */
export async function sendMessage(params: SendMessageParams): Promise<{
  success: boolean;
  messageLogId?: string;
  error?: string;
}> {
  try {
    let finalSubject = params.subject || '';
    let finalBody = params.body || '';

    // Se resourceType e action foram fornecidos, buscar o template
    if (params.resourceType && params.action && !params.templateId) {
      const templateResult = await pool.query(
        `SELECT * FROM message_templates 
         WHERE user_id = $1 AND resource_type = $2 AND action = $3 AND is_active = true
         ORDER BY is_predefined DESC, created_at DESC
         LIMIT 1`,
        [params.userId, params.resourceType, params.action]
      );

      if (templateResult.rows.length > 0) {
        const template = templateResult.rows[0];
        finalSubject = template.subject || '';
        finalBody = template.body;
        params.templateId = template.id;
      }
    }

    // Se templateId foi fornecido, buscar o template
    if (params.templateId && !finalBody) {
      const templateResult = await pool.query(
        'SELECT * FROM message_templates WHERE id = $1 AND user_id = $2',
        [params.templateId, params.userId]
      );

      if (templateResult.rows.length === 0) {
        return { success: false, error: 'Template não encontrado' };
      }

      const template = templateResult.rows[0];
      finalSubject = template.subject || '';
      finalBody = template.body;
    }

    // Se não há corpo da mensagem, retornar erro
    if (!finalBody) {
      return { success: false, error: 'Corpo da mensagem é obrigatório' };
    }

    // Substituir variáveis
    if (params.variables) {
      finalSubject = replaceVariables(finalSubject, params.variables);
      finalBody = replaceVariables(finalBody, params.variables);
    }

    // Criar log de mensagem
    const logResult = await pool.query(
      `INSERT INTO message_logs (
        user_id, template_id, recipient_email, recipient_phone, channel,
        subject, body, status, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      RETURNING id`,
      [
        params.userId,
        params.templateId || null,
        params.recipientEmail || null,
        params.recipientPhone || null,
        params.channel,
        finalSubject || null,
        finalBody,
        'pending',
        JSON.stringify(params.metadata || {}),
      ]
    );

    const messageLogId = logResult.rows[0].id;
    let emailSuccess = true;
    let whatsappSuccess = true;
    let errorMessages: string[] = [];

    // Enviar por email se necessário
    if ((params.channel === 'email' || params.channel === 'both') && params.recipientEmail) {
      const emailResult = await sendEmailMessage(
        params.userId,
        params.recipientEmail,
        finalSubject,
        finalBody
      );
      emailSuccess = emailResult.success;
      if (!emailSuccess && emailResult.error) {
        errorMessages.push(`Email: ${emailResult.error}`);
      }
    }

    // Enviar por WhatsApp se necessário
    if ((params.channel === 'whatsapp' || params.channel === 'both') && params.recipientPhone) {
      const whatsappResult = await sendWhatsAppMessage(
        params.userId,
        params.recipientPhone,
        finalBody
      );
      whatsappSuccess = whatsappResult.success;
      if (!whatsappSuccess && whatsappResult.error) {
        errorMessages.push(`WhatsApp: ${whatsappResult.error}`);
      }
    }

    // Atualizar status do log
    const overallSuccess = emailSuccess && whatsappSuccess;
    const status = overallSuccess ? 'sent' : 'failed';
    const errorMessage = errorMessages.length > 0 ? errorMessages.join('; ') : null;

    await pool.query(
      `UPDATE message_logs 
       SET status = $1, error_message = $2, sent_at = $3
       WHERE id = $4`,
      [status, errorMessage, overallSuccess ? new Date() : null, messageLogId]
    );

    if (overallSuccess) {
      return { success: true, messageLogId };
    } else {
      return { success: false, messageLogId, error: errorMessage || 'Erro ao enviar mensagem' };
    }
  } catch (error: any) {
    console.error('Error in sendMessage:', error);
    return { success: false, error: error.message || 'Erro ao enviar mensagem' };
  }
}

