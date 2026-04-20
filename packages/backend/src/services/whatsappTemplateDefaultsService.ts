import { pool } from '../utils/db.js';

type SeedItem = {
  message_type: 'text' | 'image' | 'document';
  content?: string | null;
  media_url?: string | null;
  caption?: string | null;
  delay_seconds: number;
};

type SeedTemplateDef = {
  seed_key: string;
  categoryName: string;
  categoryColor: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  items: SeedItem[];
};

const SEED_TEMPLATES: SeedTemplateDef[] = [
  {
    seed_key: 'sys_transfer_attendant',
    categoryName: 'Atendimento',
    categoryColor: '#0ea5e9',
    name: 'Transferência para atendente',
    description: null,
    is_active: true,
    items: [
      {
        message_type: 'text',
        content:
          'Olá, {{contact_name}}. Seu atendimento foi direcionado para {{operator_name}}.',
        delay_seconds: 0,
      },
      {
        message_type: 'text',
        content: 'Em breve daremos continuidade por aqui.',
        delay_seconds: 5,
      },
    ],
  },
  {
    seed_key: 'sys_transfer_queue',
    categoryName: 'Atendimento',
    categoryColor: '#0ea5e9',
    name: 'Transferência para fila',
    description: null,
    is_active: true,
    items: [
      {
        message_type: 'text',
        content:
          'Olá, {{contact_name}}. Seu atendimento foi encaminhado para a fila responsável.',
        delay_seconds: 0,
      },
      {
        message_type: 'text',
        content: 'Em breve retornaremos com a continuidade do seu atendimento.',
        delay_seconds: 5,
      },
    ],
  },
  {
    seed_key: 'sys_transfer_team',
    categoryName: 'Atendimento',
    categoryColor: '#0ea5e9',
    name: 'Transferência para equipe',
    description: null,
    is_active: true,
    items: [
      {
        message_type: 'text',
        content:
          'Olá, {{contact_name}}. Seu atendimento foi encaminhado para a equipe {{team_name}}.',
        delay_seconds: 0,
      },
      {
        message_type: 'text',
        content: 'Em breve você receberá continuidade no atendimento.',
        delay_seconds: 5,
      },
    ],
  },
  {
    seed_key: 'sys_close_conversation',
    categoryName: 'Atendimento',
    categoryColor: '#0ea5e9',
    name: 'Encerramento de conversa',
    description: null,
    is_active: true,
    items: [
      {
        message_type: 'text',
        content: 'Olá, {{contact_name}}. Seu atendimento foi finalizado.',
        delay_seconds: 0,
      },
      {
        message_type: 'text',
        content:
          'Caso precise de mais alguma coisa, basta enviar uma nova mensagem.',
        delay_seconds: 5,
      },
    ],
  },
  {
    seed_key: 'sys_reopen_conversation',
    categoryName: 'Atendimento',
    categoryColor: '#0ea5e9',
    name: 'Reabertura de conversa',
    description: null,
    is_active: true,
    items: [
      {
        message_type: 'text',
        content: 'Olá, {{contact_name}}. Seu atendimento foi reaberto.',
        delay_seconds: 0,
      },
      {
        message_type: 'text',
        content: 'Voltaremos a acompanhar sua solicitação.',
        delay_seconds: 5,
      },
    ],
  },
  {
    seed_key: 'sys_kanban_stage_change',
    categoryName: 'Kanbam',
    categoryColor: '#8b5cf6',
    name: 'Mudança de etapa no Kanbam',
    description: null,
    is_active: false,
    items: [
      {
        message_type: 'text',
        content:
          'Olá, {{contact_name}}. Seu atendimento avançou para a etapa {{column_name}}.',
        delay_seconds: 0,
      },
    ],
  },
  {
    seed_key: 'sys_payment_reminder',
    categoryName: 'Pagamento',
    categoryColor: '#f59e0b',
    name: 'Cobrança / pagamento',
    description: null,
    is_active: false,
    items: [
      {
        message_type: 'text',
        content:
          'Olá, {{contact_name}}. Identificamos uma pendência relacionada ao seu pagamento.',
        delay_seconds: 0,
      },
      {
        message_type: 'text',
        content: 'Se precisar, nossa equipe pode te ajudar por aqui.',
        delay_seconds: 5,
      },
    ],
  },
];

async function getOrCreateCategory(
  tenantId: string,
  name: string,
  color: string | null,
): Promise<string> {
  const found = await pool.query<{ id: string }>(
    `SELECT id FROM whatsapp_template_categories WHERE tenant_id = $1 AND name = $2 LIMIT 1`,
    [tenantId, name],
  );
  if (found.rows[0]) return found.rows[0].id;
  const ins = await pool.query<{ id: string }>(
    `INSERT INTO whatsapp_template_categories (tenant_id, name, color, is_active)
     VALUES ($1, $2, $3, true)
     RETURNING id`,
    [tenantId, name, color],
  );
  return ins.rows[0].id;
}

/**
 * Garante categorias padrão e templates com `seed_key` para o tenant (idempotente por seed_key).
 * Chamado no registo de tenant e ao listar templates (lazy para tenants antigos).
 */
export async function ensureWhatsAppTemplateDefaults(tenantId: string): Promise<void> {
  for (const def of SEED_TEMPLATES) {
    const exists = await pool.query(`SELECT id FROM whatsapp_message_templates WHERE tenant_id = $1 AND seed_key = $2 LIMIT 1`, [
      tenantId,
      def.seed_key,
    ]);
    if (exists.rowCount && exists.rowCount > 0) continue;

    const categoryId = await getOrCreateCategory(tenantId, def.categoryName, def.categoryColor);

    const tpl = await pool.query<{ id: string }>(
      `INSERT INTO whatsapp_message_templates (
        tenant_id, category_id, template_type, name, slug, description, is_active, is_system_default, seed_key, metadata
      ) VALUES ($1, $2, 'automatic', $3, NULL, $4, $5, true, $6, '{}'::jsonb)
      RETURNING id`,
      [tenantId, categoryId, def.name, def.description, def.is_active, def.seed_key],
    );
    const templateId = tpl.rows[0].id;

    for (let i = 0; i < def.items.length; i++) {
      const it = def.items[i];
      const media =
        it.message_type === 'image' || it.message_type === 'document' ? it.media_url ?? null : null;
      await pool.query(
        `INSERT INTO whatsapp_message_template_items (
          template_id, position, message_type, content, media_url, caption, delay_seconds, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, '{}'::jsonb)`,
        [
          templateId,
          i,
          it.message_type,
          it.message_type === 'text' ? it.content ?? null : null,
          media,
          it.caption ?? null,
          it.delay_seconds,
        ],
      );
    }
  }
}
