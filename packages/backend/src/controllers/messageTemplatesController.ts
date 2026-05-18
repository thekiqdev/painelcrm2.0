import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';
import { uazapiService } from '../services/uazapi.js';

// Definir recursos e ações válidas
const RESOURCE_TYPES = [
  'invoices', 'contracts', 'tasks', 'tickets', 'projects',
  'project_tasks', 'leads', 'clients', 'proposals', 'expenses',
  'funnels', 'system'
] as const;

const RESOURCE_ACTIONS: Record<string, string[]> = {
  invoices: ['created', 'sent', 'paid', 'overdue', 'reminder_due_soon', 'reminder_overdue', 'cancelled', 'updated'],
  contracts: ['created', 'sent_for_signature', 'signature_requested', 'partially_signed', 'fully_signed', 'signed_by_client', 'signed_by_internal', 'rejected', 'expired', 'renewed', 'cancelled', 'updated'],
  tasks: ['created', 'assigned', 'updated', 'completed', 'reopened', 'due_soon', 'overdue', 'commented', 'status_changed', 'priority_changed', 'cancelled'],
  tickets: ['created', 'assigned', 'status_changed', 'priority_changed', 'new_message', 'first_response', 'resolved', 'closed', 'reopened', 'sla_warning', 'sla_breached', 'escalated', 'merged'],
  projects: ['created', 'started', 'updated', 'completed', 'paused', 'resumed', 'cancelled', 'status_changed', 'member_added', 'member_removed', 'milestone_reached', 'deadline_approaching', 'deadline_passed'],
  project_tasks: ['created', 'assigned', 'updated', 'completed', 'moved', 'due_soon', 'overdue', 'commented', 'attachment_added', 'status_changed', 'priority_changed'],
  leads: ['created', 'converted', 'status_changed', 'assigned', 'updated', 'contacted', 'qualified', 'lost', 'reopened', 'note_added'],
  clients: ['created', 'updated', 'status_changed', 'assigned', 'note_added', 'document_added', 'contact_added', 'archived', 'reactivated'],
  proposals: ['created', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'updated', 'reminder_sent', 'converted_to_contract', 'converted_to_invoice'],
  expenses: ['created', 'updated', 'paid', 'approved', 'rejected', 'reimbursed', 'cancelled'],
  funnels: ['created', 'updated', 'stage_added', 'stage_updated', 'lead_moved', 'conversion', 'goal_reached'],
  system: ['user_registered', 'password_reset', 'password_changed', 'email_verified', 'account_activated', 'account_deactivated', 'backup_completed', 'system_maintenance', 'security_alert'],
};

const messageTemplateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  resource_type: z.enum(RESOURCE_TYPES as any),
  action: z.string().min(1, 'Ação é obrigatória'),
  subject: z.string().optional().nullable(),
  body: z.string().min(1, 'Corpo da mensagem é obrigatório'),
  is_predefined: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
  variables: z.array(z.string()).optional().default([]),
});

// GET /api/message-templates
export async function getMessageTemplates(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.json([]);
      return;
    }

    const { resource_type, action, is_predefined } = req.query;

    let query = `SELECT mt.* FROM message_templates mt
       INNER JOIN users u ON u.id = mt.user_id AND u.tenant_id = $1
       WHERE 1=1`;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (resource_type) {
      query += ` AND mt.resource_type = $${paramIndex}`;
      params.push(resource_type);
      paramIndex++;
    }

    if (action) {
      query += ` AND mt.action = $${paramIndex}`;
      params.push(action);
      paramIndex++;
    }

    if (is_predefined !== undefined) {
      query += ` AND mt.is_predefined = $${paramIndex}`;
      params.push(is_predefined === 'true');
      paramIndex++;
    }

    query += ' ORDER BY mt.is_predefined DESC, mt.resource_type ASC, mt.action ASC, mt.name ASC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching message templates:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
      stack: error.stack,
    });
    res.status(500).json({ 
      error: 'Erro ao buscar modelos de mensagens',
      details: error.message,
      code: error.code,
      hint: error.hint,
    });
  }
}

// GET /api/message-templates/resources
export async function getResourceTypes(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json({
      resource_types: RESOURCE_TYPES,
      actions: RESOURCE_ACTIONS,
    });
  } catch (error: any) {
    console.error('Error fetching resource types:', error);
    res.status(500).json({ error: 'Erro ao buscar tipos de recursos' });
  }
}

// GET /api/message-templates/:id
export async function getMessageTemplateById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT mt.* FROM message_templates mt
       INNER JOIN users u ON u.id = mt.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE mt.id = $1`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Modelo de mensagem não encontrado' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching message template:', error);
    res.status(500).json({ error: 'Erro ao buscar modelo de mensagem' });
  }
}

// GET /api/message-templates/by-resource/:resource_type/:action
export async function getMessageTemplateByResource(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { resource_type, action } = req.params;

    // Buscar template ativo para o resource_type e action (escopo tenant)
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(404).json({ error: 'Modelo de mensagem não encontrado para este recurso e ação' });
      return;
    }
    const result = await pool.query(
      `SELECT mt.* FROM message_templates mt
       INNER JOIN users u ON u.id = mt.user_id AND u.tenant_id = $1
       WHERE mt.resource_type = $2 AND mt.action = $3 AND mt.is_active = true
       ORDER BY mt.is_predefined DESC, mt.created_at DESC
       LIMIT 1`,
      [tenantId, resource_type, action]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Modelo de mensagem não encontrado para este recurso e ação' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching message template by resource:', error);
    res.status(500).json({ error: 'Erro ao buscar modelo de mensagem' });
  }
}

// POST /api/message-templates
export async function createMessageTemplate(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const templateData = messageTemplateSchema.parse(req.body);

    // Validar se a ação é válida para o resource_type
    const validActions = RESOURCE_ACTIONS[templateData.resource_type] || [];
    if (!validActions.includes(templateData.action)) {
      res.status(400).json({ 
        error: `Ação "${templateData.action}" não é válida para o recurso "${templateData.resource_type}"`,
        valid_actions: validActions,
      });
      return;
    }

    // Verificar se já existe um template com o mesmo nome, resource_type e action no tenant
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma conta' });
      return;
    }
    const existingResult = await pool.query(
      `SELECT mt.id FROM message_templates mt
       INNER JOIN users u ON u.id = mt.user_id AND u.tenant_id = $1
       WHERE mt.name = $2 AND mt.resource_type = $3 AND mt.action = $4`,
      [tenantId, templateData.name, templateData.resource_type, templateData.action]
    );

    if (existingResult.rows.length > 0) {
      res.status(400).json({ error: 'Já existe um modelo com este nome, recurso e ação' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO message_templates (
        user_id, name, resource_type, action, subject, body, is_predefined, is_active, variables
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      RETURNING *`,
      [
        userId,
        templateData.name,
        templateData.resource_type,
        templateData.action,
        templateData.subject || null,
        templateData.body,
        templateData.is_predefined || false,
        templateData.is_active !== undefined ? templateData.is_active : true,
        JSON.stringify(templateData.variables || []),
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Erro de validação', details: error.errors });
      return;
    }
    console.error('Error creating message template:', error);
    res.status(500).json({ error: 'Erro ao criar modelo de mensagem' });
  }
}

// PATCH /api/message-templates/:id
export async function updateMessageTemplate(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const templateData = messageTemplateSchema.partial().parse(req.body);

    // Verificar se o template existe e pertence ao tenant
    const existingResult = await pool.query(
      `SELECT mt.id, mt.is_predefined, mt.resource_type, mt.action FROM message_templates mt
       INNER JOIN users u ON u.id = mt.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE mt.id = $1`,
      [id, userId]
    );

    if (existingResult.rows.length === 0) {
      res.status(404).json({ error: 'Modelo de mensagem não encontrado' });
      return;
    }

    const currentTemplate = existingResult.rows[0];
    const finalResourceType = templateData.resource_type || currentTemplate.resource_type;
    const finalAction = templateData.action || currentTemplate.action;

    // Validar ação se resource_type ou action foram alterados
    if (templateData.resource_type || templateData.action) {
      const validActions = RESOURCE_ACTIONS[finalResourceType] || [];
      if (!validActions.includes(finalAction)) {
        res.status(400).json({ 
          error: `Ação "${finalAction}" não é válida para o recurso "${finalResourceType}"`,
          valid_actions: validActions,
        });
        return;
      }
    }

    // Se estiver atualizando nome, resource_type e action, verificar duplicatas no tenant
    if (templateData.name || templateData.resource_type || templateData.action) {
      const newName = templateData.name || currentTemplate.name;

      const duplicateResult = await pool.query(
        `SELECT mt.id FROM message_templates mt
         INNER JOIN users u ON u.id = mt.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $5)
         WHERE mt.name = $1 AND mt.resource_type = $2 AND mt.action = $3 AND mt.id != $4`,
        [newName, finalResourceType, finalAction, id, userId]
      );

      if (duplicateResult.rows.length > 0) {
        res.status(400).json({ error: 'Já existe um modelo com este nome, recurso e ação' });
        return;
      }
    }

    const updateFields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (templateData.name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`);
      params.push(templateData.name);
    }
    if (templateData.resource_type !== undefined) {
      updateFields.push(`resource_type = $${paramIndex++}`);
      params.push(templateData.resource_type);
    }
    if (templateData.action !== undefined) {
      updateFields.push(`action = $${paramIndex++}`);
      params.push(templateData.action);
    }
    if (templateData.subject !== undefined) {
      updateFields.push(`subject = $${paramIndex++}`);
      params.push(templateData.subject);
    }
    if (templateData.body !== undefined) {
      updateFields.push(`body = $${paramIndex++}`);
      params.push(templateData.body);
    }
    if (templateData.is_active !== undefined) {
      updateFields.push(`is_active = $${paramIndex++}`);
      params.push(templateData.is_active);
    }
    if (templateData.variables !== undefined) {
      updateFields.push(`variables = $${paramIndex++}::jsonb`);
      params.push(JSON.stringify(templateData.variables));
    }

    if (updateFields.length === 0) {
      res.status(400).json({ error: 'Nenhum campo para atualizar' });
      return;
    }

    params.push(id, userId);
    const result = await pool.query(
      `UPDATE message_templates 
       SET ${updateFields.join(', ')}, updated_at = now()
       WHERE id = $${paramIndex} AND user_id IN (SELECT id FROM users WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = $${paramIndex + 1}))
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Modelo de mensagem não encontrado' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Erro de validação', details: error.errors });
      return;
    }
    console.error('Error updating message template:', error);
    res.status(500).json({ error: 'Erro ao atualizar modelo de mensagem' });
  }
}

// DELETE /api/message-templates/:id
export async function deleteMessageTemplate(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // Verificar se o template existe e pertence ao tenant
    const existingResult = await pool.query(
      `SELECT mt.id, mt.is_predefined FROM message_templates mt
       INNER JOIN users u ON u.id = mt.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE mt.id = $1`,
      [id, userId]
    );

    if (existingResult.rows.length === 0) {
      res.status(404).json({ error: 'Modelo de mensagem não encontrado' });
      return;
    }

    // Não permitir deletar templates pré-definidos
    if (existingResult.rows[0].is_predefined) {
      res.status(400).json({ error: 'Não é possível deletar modelos pré-definidos' });
      return;
    }

    await pool.query(
      `DELETE FROM message_templates WHERE id = $1 AND user_id IN (SELECT id FROM users WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = $2))`,
      [id, userId]
    );

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting message template:', error);
    res.status(500).json({ error: 'Erro ao deletar modelo de mensagem' });
  }
}

// POST /api/message-templates/:id/test
export async function testMessageTemplate(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { phoneNumber, variables } = req.body;

    // Validar número de telefone
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      res.status(400).json({ error: 'Número de telefone é obrigatório' });
      return;
    }

    // Validar formato do número (deve conter apenas dígitos e começar com código do país)
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      res.status(400).json({ error: 'Número de telefone inválido. Use o formato: 5511999999999' });
      return;
    }

    // Buscar template (escopo tenant)
    const templateResult = await pool.query(
      `SELECT mt.* FROM message_templates mt
       INNER JOIN users u ON u.id = mt.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE mt.id = $1`,
      [id, userId]
    );

    if (templateResult.rows.length === 0) {
      res.status(404).json({ error: 'Modelo de mensagem não encontrado' });
      return;
    }

    const template = templateResult.rows[0];

    // Substituir variáveis
    let finalBody = template.body;
    let finalSubject = template.subject || '';
    
    if (variables && typeof variables === 'object') {
      Object.keys(variables).forEach(key => {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        finalBody = finalBody.replace(regex, variables[key] || `{{${key}}}`);
        finalSubject = finalSubject.replace(regex, variables[key] || `{{${key}}}`);
      });
    }

    // Verificar se há instância WhatsApp conectada
    const instanceResult = await pool.query(
      `SELECT i.instance_token, i.external_instance_name
       FROM chat_instances i
       WHERE i.user_id = $1 AND i.status = 'connected'
       LIMIT 1`,
      [userId]
    );

    if (instanceResult.rows.length === 0) {
      res.status(400).json({ 
        error: 'Nenhuma instância WhatsApp conectada encontrada',
        preview: finalBody,
      });
      return;
    }

    const instance = instanceResult.rows[0];

    // Enviar mensagem de teste via UazAPI
    try {
      console.log('[TestMessageTemplate] Enviando mensagem de teste via UazAPI:', {
        instanceToken: instance.instance_token ? '***' + instance.instance_token.slice(-4) : 'MISSING',
        phoneNumber: cleanPhone,
        messageLength: finalBody.length,
      });

      const uazapiResponse = await uazapiService.sendTextMessage(instance.instance_token, {
        number: cleanPhone,
        text: finalBody,
        readchat: false,
        readmessages: false,
        delay: 0,
        track_source: 'painelcrm-test',
      });

      console.log('[TestMessageTemplate] Mensagem enviada com sucesso:', {
        response: typeof uazapiResponse === 'object' && uazapiResponse !== null ? Object.keys(uazapiResponse) : 'string',
      });

      res.json({
        success: true,
        message: 'Mensagem de teste enviada com sucesso!',
        preview: finalBody,
        phoneNumber: cleanPhone,
        uazapiResponse: uazapiResponse,
      });
    } catch (error: any) {
      console.error('Error sending test message via UazAPI:', error);
      
      // Tratar diferentes tipos de erro da UazAPI
      const errorStatus = error?.status;
      const errorMessage = error?.message || '';
      const errorPayload = error?.payload || error?.responseText || {};
      
      // Erro 429 da UazAPI (rate limit da própria API)
      if (errorStatus === 429) {
        res.status(429).json({
          success: false,
          error: 'Limite de requisições da UazAPI atingido. Aguarde alguns instantes e tente novamente.',
          preview: finalBody,
          details: errorPayload,
        });
        return;
      }
      
      // Erro de instância não encontrada ou desconectada
      if (errorMessage.toLowerCase().includes('no session') || 
          errorMessage.toLowerCase().includes('instance not found') ||
          errorStatus === 404) {
        res.status(400).json({
          success: false,
          error: 'Instância WhatsApp não encontrada ou desconectada. Verifique se a instância está conectada.',
          preview: finalBody,
        });
        return;
      }
      
      // Outros erros
      res.status(500).json({
        success: false,
        error: errorMessage || 'Erro ao enviar mensagem via UazAPI',
        preview: finalBody,
        details: errorPayload,
        status: errorStatus,
      });
    }
  } catch (error: any) {
    console.error('Error testing message template:', error);
    res.status(500).json({ 
      error: 'Erro ao testar modelo de mensagem',
      details: error.message,
    });
  }
}

// POST /api/message-templates/initialize-predefined
export async function initializePredefinedTemplates(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    console.log(`[InitializePredefined] Iniciando para usuário: ${userId}`);

    const predefinedTemplates = [
      {
        name: 'Notificação de Nova Fatura',
        resource_type: 'invoices' as const,
        action: 'created' as const,
        subject: 'Nova Fatura Disponível',
        body: 'Olá {{client_name}},\n\nUma nova fatura foi gerada para você.\n\nNúmero: {{invoice_number}}\nValor: R$ {{invoice_total}}\nVencimento: {{due_date}}\n\nAcesse o link para visualizar: {{invoice_link}}',
        variables: ['client_name', 'invoice_number', 'invoice_total', 'due_date', 'invoice_link'],
      },
      {
        name: 'Fatura Vencida',
        resource_type: 'invoices' as const,
        action: 'overdue' as const,
        subject: 'Fatura Vencida - Ação Necessária',
        body: 'Olá {{client_name}},\n\nA fatura {{invoice_number}} no valor de R$ {{invoice_total}} está vencida desde {{due_date}}.\n\nPor favor, realize o pagamento o quanto antes.\n\nLink para pagamento: {{payment_link}}',
        variables: ['client_name', 'invoice_number', 'invoice_total', 'due_date', 'payment_link'],
      },
      {
        name: 'Novo Ticket Criado',
        resource_type: 'tickets' as const,
        action: 'created' as const,
        subject: 'Novo Ticket Criado',
        body: '✅ Seu ticket foi criado com sucesso.\n\nProtocolo: {{ticket_number}}\n\nAcompanhe seu atendimento:\n{{ticket_link}}',
        variables: ['contact_name', 'ticket_number', 'ticket_subject', 'ticket_link'],
      },
      {
        name: 'Ticket Resolvido',
        resource_type: 'tickets' as const,
        action: 'resolved' as const,
        subject: 'Ticket Resolvido',
        body: 'Olá {{contact_name}},\n\nSeu ticket {{ticket_number}} foi resolvido.\n\nAssunto: {{ticket_subject}}\n\nAcesse: {{ticket_link}}',
        variables: ['contact_name', 'ticket_number', 'ticket_subject', 'ticket_link'],
      },
      {
        name: 'Novo Projeto Criado',
        resource_type: 'projects' as const,
        action: 'created' as const,
        subject: 'Novo Projeto Criado',
        body: 'Olá {{client_name}},\n\nUm novo projeto foi criado para você.\n\nNome: {{project_name}}\nDescrição: {{project_description}}\n\nAcesse: {{project_link}}',
        variables: ['client_name', 'project_name', 'project_description', 'project_link'],
      },
      {
        name: 'Nova Tarefa Criada',
        resource_type: 'tasks' as const,
        action: 'created' as const,
        subject: 'Nova Tarefa Criada',
        body: 'Olá {{client_name}},\n\nUma nova tarefa foi criada para você.\n\nTítulo: {{task_title}}\nDescrição: {{task_description}}\nPrazo: {{task_due_date}}\n\nAcesse: {{task_link}}',
        variables: ['client_name', 'task_title', 'task_description', 'task_due_date', 'task_link'],
      },
      {
        name: 'Nova Tarefa Atribuída',
        resource_type: 'tasks' as const,
        action: 'assigned' as const,
        subject: 'Nova Tarefa Atribuída',
        body: 'Olá {{assignee_name}},\n\nUma nova tarefa foi atribuída a você.\n\nTítulo: {{task_title}}\nDescrição: {{task_description}}\nPrazo: {{task_due_date}}\n\nAcesse: {{task_link}}',
        variables: ['assignee_name', 'task_title', 'task_description', 'task_due_date', 'task_link'],
      },
      {
        name: 'Tarefa Concluída',
        resource_type: 'tasks' as const,
        action: 'completed' as const,
        subject: 'Tarefa Concluída',
        body: 'Olá {{assignee_name}},\n\nA tarefa "{{task_title}}" foi concluída.\n\nParabéns pelo trabalho!\n\nAcesse: {{task_link}}',
        variables: ['assignee_name', 'task_title', 'task_link'],
      },
      {
        name: 'Novo Contrato Criado',
        resource_type: 'contracts' as const,
        action: 'created' as const,
        subject: 'Novo Contrato Criado',
        body: 'Olá {{client_name}},\n\nUm novo contrato foi criado para você.\n\nContrato: {{contract_title}}\nNúmero: {{contract_number}}\n\nAcesse: {{contract_link}}',
        variables: ['client_name', 'contract_title', 'contract_number', 'contract_link'],
      },
      {
        name: 'Contrato Enviado para Assinatura',
        resource_type: 'contracts' as const,
        action: 'sent_for_signature' as const,
        subject: 'Contrato para Assinatura',
        body: 'Olá {{signer_name}},\n\nUm contrato foi enviado para sua assinatura.\n\nContrato: {{contract_title}}\nNúmero: {{contract_number}}\n\nAcesse o link para assinar: {{contract_link}}',
        variables: ['signer_name', 'contract_title', 'contract_number', 'contract_link'],
      },
      {
        name: 'Contrato Assinado',
        resource_type: 'contracts' as const,
        action: 'fully_signed' as const,
        subject: 'Contrato Assinado',
        body: 'Olá {{client_name}},\n\nO contrato {{contract_number}} foi totalmente assinado e está ativo.\n\nContrato: {{contract_title}}\n\nAcesse: {{contract_link}}',
        variables: ['client_name', 'contract_number', 'contract_title', 'contract_link'],
      },
      {
        name: 'Nova Proposta Criada',
        resource_type: 'proposals' as const,
        action: 'created' as const,
        subject: 'Nova Proposta Criada',
        body: 'Olá {{client_name}},\n\nUma nova proposta foi criada para você.\n\nTítulo: {{proposal_title}}\nValor: R$ {{proposal_amount}}\n\nAcesse: {{proposal_link}}',
        variables: ['client_name', 'proposal_title', 'proposal_amount', 'proposal_link'],
      },
      {
        name: 'Proposta — envio ao cliente',
        resource_type: 'proposals' as const,
        action: 'sent' as const,
        subject: 'Proposta comercial — {{proposal_title}}',
        body:
          'Olá {{client_name}},\n\nSegue o link para visualizar nossa proposta:\n{{proposal_link}}\n\n' +
          'Título: {{proposal_title}}\nValor: R$ {{proposal_amount}}\nValidade: {{valid_until}}\n\n' +
          '{{responsible_name}}\n{{tenant_name}}',
        variables: [
          'client_name',
          'proposal_title',
          'proposal_amount',
          'proposal_link',
          'valid_until',
          'responsible_name',
          'tenant_name',
        ],
      },
      {
        name: 'Proposta — lembrete',
        resource_type: 'proposals' as const,
        action: 'reminder_sent' as const,
        subject: 'Lembrete: proposta {{proposal_title}}',
        body:
          'Olá {{client_name}},\n\nPassando para lembrar da proposta. Você pode revisar pelo link:\n{{proposal_link}}\n\n' +
          'Validade: {{valid_until}} · Valor: R$ {{proposal_amount}}\n\n{{responsible_name}} — {{tenant_name}}',
        variables: [
          'client_name',
          'proposal_title',
          'proposal_amount',
          'proposal_link',
          'valid_until',
          'responsible_name',
          'tenant_name',
        ],
      },
      {
        name: 'Proposta — aceita (cliente)',
        resource_type: 'proposals' as const,
        action: 'accepted' as const,
        subject: 'Recebemos seu aceite — {{proposal_title}}',
        body:
          'Olá {{client_name}},\n\nConfirmamos o recebimento do aceite da proposta "{{proposal_title}}". ' +
          'Nossa equipe dará continuidade aos próximos passos.\n\n{{tenant_name}}',
        variables: ['client_name', 'proposal_title', 'tenant_name'],
      },
      {
        name: 'Proposta — recusada (cliente)',
        resource_type: 'proposals' as const,
        action: 'rejected' as const,
        subject: 'Sobre a proposta {{proposal_title}}',
        body:
          'Olá {{client_name}},\n\nAgradecemos o retorno sobre a proposta "{{proposal_title}}". ' +
          'Estamos à disposição para ajustes.\n\n{{tenant_name}}',
        variables: ['client_name', 'proposal_title', 'tenant_name'],
      },
      {
        name: 'Proposta — expirada (cliente)',
        resource_type: 'proposals' as const,
        action: 'expired' as const,
        subject: 'Proposta {{proposal_title}} — validade',
        body:
          'Olá {{client_name}},\n\nA proposta "{{proposal_title}}" está fora do prazo ({{valid_until}}). ' +
          'Se desejar nova versão, fale conosco.\n\n{{tenant_name}}',
        variables: ['client_name', 'proposal_title', 'valid_until', 'tenant_name'],
      },
      {
        name: 'Proposta — fatura gerada (interno)',
        resource_type: 'proposals' as const,
        action: 'converted_to_invoice' as const,
        subject: 'Fatura gerada: {{proposal_title}}',
        body:
          'Fatura criada a partir da proposta "{{proposal_title}}" (cliente {{client_name}}, total R$ {{proposal_amount}}). ' +
          'Revise em Faturamento. Referência: {{proposal_link}}',
        variables: ['client_name', 'proposal_title', 'proposal_amount', 'proposal_link'],
      },
    ];

    console.log(`[InitializePredefined] Total de templates para processar: ${predefinedTemplates.length}`);
    const createdTemplates = [];

    for (const template of predefinedTemplates) {
      console.log(`[InitializePredefined] Processando: "${template.name}" (${template.resource_type}/${template.action})`);
      try {
        // Validar se a ação é válida para o resource_type
        const validActions = RESOURCE_ACTIONS[template.resource_type] || [];
        if (!validActions.includes(template.action)) {
          console.warn(`Ação "${template.action}" não é válida para o recurso "${template.resource_type}". Pulando template "${template.name}".`);
          continue;
        }

        // Verificar se já existe um template pré-definido com o mesmo resource_type e action
        // (independente do nome, pois podemos ter atualizado o nome)
        // Primeiro tentar com is_predefined = true
        let existingResult = await pool.query(
          `SELECT id, name, subject, body, variables FROM message_templates 
           WHERE user_id = $1 AND resource_type = $2 AND action = $3 AND is_predefined = true`,
          [userId, template.resource_type, template.action]
        );

        // Se não encontrou, tentar sem o filtro is_predefined (pode ter sido criado manualmente)
        if (existingResult.rows.length === 0) {
          existingResult = await pool.query(
            `SELECT id, name, subject, body, variables FROM message_templates 
             WHERE user_id = $1 AND resource_type = $2 AND action = $3`,
            [userId, template.resource_type, template.action]
          );
        }

        console.log(`[InitializePredefined] Verificação para "${template.name}" (${template.resource_type}/${template.action}): ${existingResult.rows.length} template(s) encontrado(s)`);

        if (existingResult.rows.length === 0) {
          // Não existe, criar novo
          const result = await pool.query(
            `INSERT INTO message_templates (
              user_id, name, resource_type, action, subject, body, is_predefined, is_active, variables
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
            RETURNING *`,
            [
              userId,
              template.name,
              template.resource_type,
              template.action,
              template.subject,
              template.body,
              true,
              true,
              JSON.stringify(template.variables),
            ]
          );
          createdTemplates.push(result.rows[0]);
          console.log(`Template criado: "${template.name}" (${template.resource_type}/${template.action})`);
        } else {
          // Já existe, atualizar se o nome ou conteúdo for diferente
          const existing = existingResult.rows[0];
          // Normalizar valores para comparação
          const existingSubject = existing.subject || null;
          const templateSubject = template.subject || null;
          const existingBody = existing.body || '';
          const templateBody = template.body || '';
          
          // Processar variables
          let existingVariables: string[] = [];
          try {
            if (Array.isArray(existing.variables)) {
              existingVariables = existing.variables;
            } else if (typeof existing.variables === 'string') {
              existingVariables = JSON.parse(existing.variables);
            } else if (existing.variables) {
              existingVariables = Object.values(existing.variables);
            }
          } catch (e) {
            console.warn(`[InitializePredefined] Erro ao processar variables do template existente:`, e);
          }
          
          const templateVariables = template.variables || [];
          
          // Comparar
          const nameDiff = existing.name !== template.name;
          const subjectDiff = existingSubject !== templateSubject;
          const bodyDiff = existingBody !== templateBody;
          const variablesDiff = JSON.stringify(existingVariables.sort()) !== JSON.stringify(templateVariables.sort());
          
          const needsUpdate = nameDiff || subjectDiff || bodyDiff || variablesDiff;
          
          console.log(`[InitializePredefined] Template existente: "${existing.name}"`);
          console.log(`[InitializePredefined] Novo template: "${template.name}"`);
          console.log(`[InitializePredefined] Diferenças detectadas - Nome: ${nameDiff}, Subject: ${subjectDiff}, Body: ${bodyDiff}, Variables: ${variablesDiff}`);
          console.log(`[InitializePredefined] Precisa atualizar: ${needsUpdate}`);
          
          if (needsUpdate) {
            const updateResult = await pool.query(
              `UPDATE message_templates 
               SET name = $1, subject = $2, body = $3, variables = $4::jsonb, updated_at = now()
               WHERE id = $5
               RETURNING *`,
              [
                template.name,
                template.subject,
                template.body,
                JSON.stringify(template.variables),
                existing.id,
              ]
            );
            createdTemplates.push(updateResult.rows[0]);
            console.log(`Template atualizado: "${template.name}" (${template.resource_type}/${template.action}) - nome anterior: "${existing.name}"`);
          } else {
            console.log(`Template "${template.name}" (${template.resource_type}/${template.action}) já existe e está atualizado. Pulando.`);
          }
        }
      } catch (templateError: any) {
        console.error(`Erro ao processar template "${template.name}":`, templateError);
        console.error('Detalhes do erro:', {
          message: templateError.message,
          code: templateError.code,
          detail: templateError.detail,
          hint: templateError.hint,
        });
        // Continuar com os próximos templates mesmo se um falhar
        continue;
      }
    }

    console.log(`[InitializePredefined] Finalizado. Total criado/atualizado: ${createdTemplates.length}`);
    
    res.json({ 
      message: 'Modelos pré-definidos inicializados',
      created: createdTemplates.length,
      templates: createdTemplates 
    });
  } catch (error: any) {
    console.error('Error initializing predefined templates:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
      stack: error.stack,
    });
    res.status(500).json({ 
      error: 'Erro ao inicializar modelos pré-definidos',
      details: error.message,
      code: error.code,
      hint: error.hint,
    });
  }
}
