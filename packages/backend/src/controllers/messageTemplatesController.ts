import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';

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
    const userId = req.userId;
    
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const { resource_type, action, is_predefined } = req.query;

    let query = 'SELECT * FROM message_templates WHERE user_id = $1';
    const params: any[] = [userId];
    let paramIndex = 2;

    if (resource_type) {
      query += ` AND resource_type = $${paramIndex}`;
      params.push(resource_type);
      paramIndex++;
    }

    if (action) {
      query += ` AND action = $${paramIndex}`;
      params.push(action);
      paramIndex++;
    }

    if (is_predefined !== undefined) {
      query += ` AND is_predefined = $${paramIndex}`;
      params.push(is_predefined === 'true');
      paramIndex++;
    }

    query += ' ORDER BY is_predefined DESC, resource_type ASC, action ASC, name ASC';

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
      'SELECT * FROM message_templates WHERE id = $1 AND user_id = $2',
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

    // Verificar se já existe um template com o mesmo nome, resource_type e action para o usuário
    const existingResult = await pool.query(
      'SELECT id FROM message_templates WHERE user_id = $1 AND name = $2 AND resource_type = $3 AND action = $4',
      [userId, templateData.name, templateData.resource_type, templateData.action]
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

    // Verificar se o template existe e pertence ao usuário
    const existingResult = await pool.query(
      'SELECT id, is_predefined, resource_type, action FROM message_templates WHERE id = $1 AND user_id = $2',
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

    // Se estiver atualizando nome, resource_type e action, verificar duplicatas
    if (templateData.name || templateData.resource_type || templateData.action) {
      const newName = templateData.name || currentTemplate.name;

      const duplicateResult = await pool.query(
        'SELECT id FROM message_templates WHERE user_id = $1 AND name = $2 AND resource_type = $3 AND action = $4 AND id != $5',
        [userId, newName, finalResourceType, finalAction, id]
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
       WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
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

    // Verificar se o template existe e pertence ao usuário
    const existingResult = await pool.query(
      'SELECT id, is_predefined FROM message_templates WHERE id = $1 AND user_id = $2',
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
      'DELETE FROM message_templates WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting message template:', error);
    res.status(500).json({ error: 'Erro ao deletar modelo de mensagem' });
  }
}

// POST /api/message-templates/initialize-predefined
export async function initializePredefinedTemplates(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;

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
        body: 'Olá {{contact_name}},\n\nUm novo ticket foi criado para você.\n\nNúmero: {{ticket_number}}\nAssunto: {{ticket_subject}}\n\nAcompanhe pelo link: {{ticket_link}}',
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
    ];

    const createdTemplates = [];

    for (const template of predefinedTemplates) {
      // Verificar se já existe
      const existingResult = await pool.query(
        'SELECT id FROM message_templates WHERE user_id = $1 AND name = $2 AND resource_type = $3 AND action = $4',
        [userId, template.name, template.resource_type, template.action]
      );

      if (existingResult.rows.length === 0) {
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
      }
    }

    res.json({ 
      message: 'Modelos pré-definidos inicializados',
      created: createdTemplates.length,
      templates: createdTemplates 
    });
  } catch (error) {
    console.error('Error initializing predefined templates:', error);
    res.status(500).json({ error: 'Erro ao inicializar modelos pré-definidos' });
  }
}
