import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { uazapiService } from '../services/uazapi.js';
import { randomUUID } from 'crypto';
import * as notificationService from '../services/notifications.js';
import { emitConversationUpdate, emitNewMessage } from '../services/websocketService.js';

const instanceSchema = z.object({
  name: z.string().min(3),
  metadata: z.record(z.any()).optional(),
});

const connectSchema = z.object({
  phone: z.string().regex(/^\d{10,15}$/).optional().nullable(),
});

const syncSchema = z.object({
  instanceId: z.string().uuid(),
  limit: z.number().min(1).max(500).optional(),
  filters: z.record(z.any()).optional(),
});

const webhookConfigSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.string()).optional(),
  addUrlEvents: z.boolean().optional(),
  addUrlTypesMessages: z.boolean().optional(),
  excludeMessages: z.array(z.string()).optional(), // Array de strings, não boolean
  enabled: z.boolean().optional(),
  secret: z.string().optional(),
});

const syncMessagesSchema = z.object({
  limit: z.number().min(1).max(100).optional(),
  before: z.string().optional(),
  after: z.string().optional(),
});

const markReadSchema = z.object({
  read: z.boolean().default(true),
});

const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  text: z.string().min(1),
  readChat: z.boolean().optional(),
  readMessages: z.boolean().optional(),
  delay: z.number().optional(),
});

type ChatInstanceRow = {
  id: string;
  user_id: string;
  name: string;
  external_instance_name: string | null;
  instance_token: string;
  status: string;
  metadata: any;
};

type AnyObject = Record<string, any>;

function ensureAdminToken() {
  if (!process.env.UAZAPI_ADMIN_TOKEN) {
    throw new Error('UAZAPI_ADMIN_TOKEN is not configured on the server');
  }
}

/**
 * Normaliza um número de telefone removendo caracteres especiais
 * e deixando apenas dígitos para comparação consistente
 * @param phone - Número de telefone em qualquer formato
 * @returns Número normalizado (apenas dígitos) ou null se inválido
 */
function normalizePhoneNumber(phone: string | null | undefined): string | null {
  if (!phone || typeof phone !== 'string') {
    return null;
  }
  // Remove todos os caracteres não numéricos
  const normalized = phone.replace(/\D/g, '');
  // Retorna null se ficar vazio ou muito curto (menos de 10 dígitos)
  return normalized.length >= 10 ? normalized : null;
}

function normalizeChatPayload(raw: any) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const externalChatId: string | null =
    raw.wa_chatid ||
    raw.chatid ||
    raw.chatId ||
    raw.number ||
    raw.id ||
    raw.jid ||
    raw.remoteJid ||
    null;

  if (!externalChatId) {
    return null;
  }

  const fastId = raw.wa_fastid || raw.fastId || raw.fast_id || null;
  const contactName = raw.wa_contactName || raw.contactName || raw.lead_name || raw.name || null;
  const profileName = raw.wa_name || raw.profileName || null;
  const phoneNumber =
    raw.phone_number ||
    raw.number ||
    (externalChatId.includes('@') ? externalChatId.split('@')[0] : null);
  const status = raw.lead_status || raw.status || null;
  const unreadCount =
    raw.wa_unreadCount ||
    raw.unreadCount ||
    raw.unreadMessages ||
    (typeof raw.wa_unread === 'number' ? raw.wa_unread : null);

  let lastMessageAt: Date | null = null;
  const timestamp =
    raw.wa_lastMsgTimestamp ||
    raw.last_message_at ||
    raw.lastMessageAt ||
    raw.lastMessageTimestamp;
  if (timestamp) {
    const numeric = Number(timestamp);
    if (!Number.isNaN(numeric)) {
      lastMessageAt = new Date(numeric > 1e12 ? numeric : numeric * 1000);
    } else if (typeof timestamp === 'string') {
      const parsed = Date.parse(timestamp);
      if (!Number.isNaN(parsed)) {
        lastMessageAt = new Date(parsed);
      }
    }
  }

  const lastMessagePreview =
    raw.wa_lastMsgText ||
    raw.last_message_preview ||
    raw.preview ||
    raw.lastMessage ||
    null;

  return {
    externalChatId,
    externalFastId: fastId,
    contactName,
    profileName,
    phoneNumber,
    status,
    unreadCount,
    lastMessageAt,
    lastMessagePreview,
    metadata: raw,
  };
}

async function loadInstance(userId: string, instanceId: string, res: Response) {
  const result = await pool.query<ChatInstanceRow>(
    'SELECT * FROM chat_instances WHERE id = $1 AND user_id = $2',
    [instanceId, userId]
  );
  if (result.rowCount === 0) {
    res.status(404).json({ error: 'Instância não encontrada' });
    return null;
  }
  return result.rows[0];
}

async function upsertConversation(
  instance: ChatInstanceRow,
  chatData: ReturnType<typeof normalizeChatPayload>
) {
  if (!chatData) {
    console.warn('[UpsertConversation] chatData is null or undefined');
    return null;
  }

  const upsertId = randomUUID().substring(0, 8);
  console.log(`[UpsertConversation ${upsertId}] Starting upsert`, {
    instanceId: instance.id,
    externalChatId: chatData.externalChatId,
    contactName: chatData.contactName,
    phoneNumber: chatData.phoneNumber,
    lastMessagePreview: chatData.lastMessagePreview?.substring(0, 50),
  });

  // Buscar apenas client_id pelo telefone normalizado
  // NOTA: Não buscamos lead_id automaticamente - leads devem ser vinculados manualmente
  let clientId: string | null = null;
  const normalizedPhone = normalizePhoneNumber(chatData.phoneNumber);

  if (normalizedPhone) {
    try {
      // Buscar cliente pelo telefone
      const clientResult = await pool.query(
        `
        SELECT id FROM clients
        WHERE user_id = $1
          AND phone IS NOT NULL
          AND phone <> ''
          AND regexp_replace(phone, '\\D', '', 'g') = $2
        LIMIT 1
        `,
        [instance.user_id, normalizedPhone]
      );

      if ((clientResult.rowCount ?? 0) > 0) {
        clientId = clientResult.rows[0].id;
        console.log(`[UpsertConversation ${upsertId}] Found client`, { clientId, phone: normalizedPhone });
      }
    } catch (linkError: any) {
      console.error(`[UpsertConversation ${upsertId}] Error linking to client:`, {
        error: linkError.message,
        phone: normalizedPhone,
      });
      // Não falha o upsert se houver erro ao buscar cliente
    }
  }

  try {
  // Verificar se a conversa já existe
  const existingResult = await pool.query(
    `
    SELECT id FROM chat_conversations
    WHERE instance_id = $1 AND external_chat_id = $2
    LIMIT 1
    `,
    [instance.id, chatData.externalChatId]
  );

  let result;
  if ((existingResult.rowCount ?? 0) > 0) {
    // Atualizar conversa existente
    const conversationId = existingResult.rows[0].id;
    result = await pool.query(
      `
      UPDATE chat_conversations SET
        external_fast_id = COALESCE($1, external_fast_id),
        contact_name = COALESCE($2, contact_name),
        profile_name = COALESCE($3, profile_name),
        phone_number = COALESCE($4, phone_number),
        status = COALESCE($5, status),
        last_message_preview = COALESCE($6, last_message_preview),
        last_message_at = COALESCE($7, last_message_at),
        unread_count = COALESCE($8, unread_count),
        metadata = $9::jsonb,
        client_id = COALESCE($10, client_id),
        updated_at = now()
      WHERE id = $11
      RETURNING *
      `,
      [
        chatData.externalFastId,
        chatData.contactName,
        chatData.profileName,
        chatData.phoneNumber,
        chatData.status || 'open',
        chatData.lastMessagePreview,
        chatData.lastMessageAt,
        chatData.unreadCount || 0,
        JSON.stringify(chatData.metadata || {}),
        clientId,
        conversationId,
      ]
    );
  } else {
    // Inserir nova conversa
    result = await pool.query(
      `
      INSERT INTO chat_conversations (
        user_id, instance_id, external_chat_id, external_fast_id,
        contact_name, profile_name, phone_number, status,
        last_message_preview, last_message_at, unread_count, metadata,
        client_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'open'), $9, $10, COALESCE($11, 0), $12::jsonb, $13)
      RETURNING *
      `,
      [
        instance.user_id,
        instance.id,
        chatData.externalChatId,
        chatData.externalFastId,
        chatData.contactName,
        chatData.profileName,
        chatData.phoneNumber,
        chatData.status,
        chatData.lastMessagePreview,
        chatData.lastMessageAt,
        chatData.unreadCount,
        JSON.stringify(chatData.metadata || {}),
        clientId,
      ]
    );
  }

    if (result.rowCount === 0 || !result.rows[0]) {
      console.error(`[UpsertConversation ${upsertId}] No row returned from database`);
      return null;
    }

    console.log(`[UpsertConversation ${upsertId}] Successfully upserted conversation`, {
      conversationId: result.rows[0].id,
      externalChatId: result.rows[0].external_chat_id,
      clientId: result.rows[0].client_id,
      wasInsert: !result.rows[0].updated_at || new Date(result.rows[0].updated_at).getTime() === new Date(result.rows[0].created_at).getTime(),
    });

  return result.rows[0];
  } catch (error: any) {
    console.error(`[UpsertConversation ${upsertId}] Database error:`, {
      error: error.message,
      code: error.code,
      detail: error.detail,
      stack: error.stack,
      chatData: {
        externalChatId: chatData.externalChatId,
        instanceId: instance.id,
      },
    });
    throw error;
  }
}

async function saveMessage(
  conversationId: string,
  direction: 'incoming' | 'outgoing',
  payload: {
    externalMessageId?: string | null;
    body?: string | null;
    media?: any;
    status?: string | null;
    sentAt?: Date | null;
    metadata?: any;
    skipUnreadUpdate?: boolean;
    resetUnread?: boolean;
  }
) {
  const saveId = randomUUID().substring(0, 8);
  console.log(`[SaveMessage ${saveId}] Starting save`, {
    conversationId,
    direction,
    externalMessageId: payload.externalMessageId,
    bodyPreview: payload.body?.substring(0, 50),
    hasMedia: !!payload.media,
  });

  try {
    const messageResult = await pool.query(
    `
    INSERT INTO chat_messages (
      conversation_id, direction, external_message_id, body,
      media, status, sent_at, metadata
    )
    VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb)
    ON CONFLICT (conversation_id, external_message_id)
    DO UPDATE SET
      status = COALESCE(EXCLUDED.status, chat_messages.status),
      metadata = EXCLUDED.metadata,
      sent_at = COALESCE(EXCLUDED.sent_at, chat_messages.sent_at),
      body = COALESCE(EXCLUDED.body, chat_messages.body)
      RETURNING id, created_at
  `,
    [
      conversationId,
      direction,
      payload.externalMessageId,
      payload.body,
      JSON.stringify(payload.media || []),
      payload.status,
      payload.sentAt,
      JSON.stringify(payload.metadata || {}),
    ]
  );

    if (messageResult.rowCount === 0) {
      console.warn(`[SaveMessage ${saveId}] No row returned from message insert`);
    } else {
      // Verificar se foi insert ou update comparando created_at com o timestamp atual
      const messageCreatedAt = new Date(messageResult.rows[0]?.created_at).getTime();
      const now = Date.now();
      const wasInsert = (now - messageCreatedAt) < 2000; // Se foi criado há menos de 2 segundos, provavelmente foi insert
      
      console.log(`[SaveMessage ${saveId}] Message saved successfully`, {
        messageId: messageResult.rows[0]?.id,
        wasInsert,
        createdAt: messageResult.rows[0]?.created_at,
      });
    }

    const unreadShouldReset = payload.resetUnread === true;
    const skipUnread = payload.skipUnreadUpdate === true;
    const effectiveSentAt = payload.sentAt || new Date();

    const conversationResult = await pool.query(
      `
      UPDATE chat_conversations
      SET
        last_message_preview = COALESCE($2, last_message_preview),
        last_message_at = COALESCE($3, last_message_at),
        unread_count = CASE
          WHEN $4 THEN unread_count
          WHEN $5 = 'incoming' THEN unread_count + 1
          WHEN $6 THEN 0
          ELSE unread_count
        END,
        updated_at = now()
      WHERE id = $1
      RETURNING id, unread_count, last_message_at, updated_at
    `,
      [
        conversationId,
        payload.body || null,
        effectiveSentAt,
        skipUnread,
        direction,
        unreadShouldReset,
      ]
    );

    if (conversationResult.rowCount === 0) {
      console.warn(`[SaveMessage ${saveId}] Conversation not found for update`, { conversationId });
    } else {
      console.log(`[SaveMessage ${saveId}] Conversation updated successfully`, {
        conversationId: conversationResult.rows[0]?.id,
        unreadCount: conversationResult.rows[0]?.unread_count,
        lastMessageAt: conversationResult.rows[0]?.last_message_at,
        updatedAt: conversationResult.rows[0]?.updated_at,
      });
    }
  } catch (error: any) {
    console.error(`[SaveMessage ${saveId}] Database error:`, {
      error: error.message,
      code: error.code,
      detail: error.detail,
      stack: error.stack,
      conversationId,
      direction,
    });
    throw error;
  }
}

export async function listInstances(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const instances = await pool.query(
    'SELECT * FROM chat_instances WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  res.json(instances.rows);
}

export async function createInstance(req: AuthRequest, res: Response) {
  try {
    console.log('[CreateInstance] Starting instance creation...');
    
    // Verificar admin token
  try {
    ensureAdminToken();
    } catch (adminError: any) {
      console.error('[CreateInstance] Admin token error:', adminError.message);
      res.status(403).json({ 
        error: 'Admin token required',
        details: adminError.message 
      });
      return;
    }

    const userId = req.userId!;
    console.log('[CreateInstance] User ID:', userId);
    
    // Validar dados
    let data;
    try {
      data = instanceSchema.parse(req.body);
      console.log('[CreateInstance] Validated data:', { name: data.name });
    } catch (validationError: any) {
      console.error('[CreateInstance] Validation error:', validationError.errors);
      res.status(400).json({ 
        error: 'Invalid instance data',
        details: validationError.errors 
      });
      return;
    }

    // Criar instância na UazAPI
    let remoteInstance: AnyObject;
    try {
      console.log('[CreateInstance] Calling UazAPI createInstance...');
      remoteInstance = (await uazapiService.createInstance(
      data.name,
      data.metadata
    )) as AnyObject;
      
      console.log('[CreateInstance] UazAPI response received:', {
        hasInstance: !!remoteInstance?.instance,
        hasToken: !!(remoteInstance?.instance?.token || remoteInstance?.token),
        keys: Object.keys(remoteInstance || {}),
      });
    } catch (uazapiError: any) {
      console.error('[CreateInstance] UazAPI error:', {
        message: uazapiError.message,
        status: uazapiError.status,
        payload: uazapiError.payload,
        stack: uazapiError.stack,
      });
      res.status(uazapiError.status || 500).json({ 
        error: 'Failed to create instance in UazAPI',
        details: uazapiError.message,
        uazapiError: uazapiError.payload || uazapiError.message,
      });
      return;
    }
    
    // Extrair informações da resposta
    const instanceInfo = remoteInstance?.instance || remoteInstance;
    const instanceToken = instanceInfo?.token || remoteInstance?.token;
    const instanceName = instanceInfo?.name || instanceInfo?.instanceName || data.name;
    const instanceStatus = instanceInfo?.status || 'disconnected';
    
    console.log('[CreateInstance] Extracted info:', {
      instanceToken: instanceToken ? '***' + instanceToken.slice(-4) : 'MISSING',
      instanceName,
      instanceStatus,
    });
    
    if (!instanceToken) {
      console.error('[CreateInstance] No token returned from UazAPI:', {
        remoteInstance: JSON.stringify(remoteInstance).substring(0, 500),
      });
      res.status(500).json({ 
        error: 'Token da instância não foi retornado pela UazAPI',
        response: remoteInstance,
      });
      return;
    }

    // Salvar no banco
    try {
    const inserted = await pool.query(
      `
      INSERT INTO chat_instances (
        user_id, name, external_instance_name, instance_token, status, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id, name)
      DO UPDATE SET
        external_instance_name = EXCLUDED.external_instance_name,
        instance_token = EXCLUDED.instance_token,
        status = EXCLUDED.status,
        metadata = EXCLUDED.metadata,
        updated_at = now()
      RETURNING *
    `,
      [
        userId,
        data.name,
          instanceName,
          instanceToken,
          instanceStatus,
        JSON.stringify(remoteInstance || {}),
      ]
    );

      console.log('[CreateInstance] Instance saved to database:', {
        id: inserted.rows[0]?.id,
        name: inserted.rows[0]?.name,
      });

    res.status(201).json(inserted.rows[0]);
    } catch (dbError: any) {
      console.error('[CreateInstance] Database error:', {
        message: dbError.message,
        code: dbError.code,
        detail: dbError.detail,
      });
      res.status(500).json({ 
        error: 'Failed to save instance to database',
        details: dbError.message,
      });
    }
  } catch (error: any) {
    console.error('[CreateInstance] Unexpected error:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    res.status(500).json({ 
      error: error.message || 'Failed to create instance',
      type: error.name || 'UnknownError',
    });
  }
}

/**
 * Função auxiliar para configurar webhook automaticamente
 * Não falha se houver erro, apenas loga
 */
async function autoConfigureWebhook(instance: ChatInstanceRow) {
  try {
    const resolvedUrl =
      process.env.UAZAPI_WEBHOOK_URL ||
      (process.env.PUBLIC_API_URL
        ? `${process.env.PUBLIC_API_URL.replace(/\/$/, '')}/webhooks/uazapi`
        : null);

    if (!resolvedUrl) {
      console.warn('[Auto-Webhook] Skipped: URL not configured', {
        instance: instance.external_instance_name,
        hasUAZAPI_WEBHOOK_URL: !!process.env.UAZAPI_WEBHOOK_URL,
        hasPUBLIC_API_URL: !!process.env.PUBLIC_API_URL,
      });
      return;
    }

    // Verificar se webhook já está configurado
    const existingWebhook = instance.metadata?.webhook;
    if (existingWebhook?.url === resolvedUrl) {
      console.log('[Auto-Webhook] Already configured, skipping', {
        instance: instance.external_instance_name,
        url: resolvedUrl,
      });
      return;
    }

    console.log('[Auto-Webhook] Configuring webhook...', {
      instance: instance.external_instance_name,
      url: resolvedUrl,
    });

    const defaultEvents = ['messages', 'messages_update', 'chats', 'connection', 'leads'];
    const defaultExcludeMessages = ['wasSentByApi'];

    const webhookBody: Record<string, any> = {
      enabled: true,
      url: resolvedUrl,
      events: defaultEvents,
      excludeMessages: defaultExcludeMessages,
      addUrlEvents: true,
      AddUrlTypesMessages: true,
    };

    const secret = process.env.UAZAPI_WEBHOOK_SECRET;
    if (secret) {
      webhookBody.secret = secret;
    }

    await uazapiService.configureWebhook(instance.instance_token, webhookBody);

    // Salvar no banco
    await pool.query(
      `
      UPDATE chat_instances
      SET metadata = metadata || $1::jsonb,
          updated_at = now()
      WHERE id = $2
    `,
      [
        JSON.stringify({
          webhook: {
            url: resolvedUrl,
            events: defaultEvents,
            excludeMessages: defaultExcludeMessages,
            configuredAt: new Date().toISOString(),
            autoConfigured: true,
          },
        }),
        instance.id,
      ]
    );

    console.log('Webhook auto-configured successfully', {
      instance: instance.external_instance_name,
      url: resolvedUrl,
    });
  } catch (error: any) {
    // Não falhar o processo principal se webhook falhar
    console.warn('Failed to auto-configure webhook (non-critical):', {
      error: error.message,
      instance: instance.external_instance_name,
    });
  }
}

export async function connectInstance(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const data = connectSchema.parse(req.body || {});

    const instance = await loadInstance(userId, id, res);
    if (!instance) return;

    // Se phone não foi fornecido, não passar para gerar QR code
    const response = (await uazapiService.connectInstance(
      instance.instance_token,
      data.phone || undefined
    )) as AnyObject;

    console.log('UazAPI connectInstance response:', JSON.stringify(response, null, 2));

    // Extrair número conectado da resposta
    const connectedPhone = 
      response?.owner || 
      response?.phone || 
      response?.number || 
      response?.instance?.owner || 
      response?.instance?.phone || 
      response?.instance?.number ||
      response?.data?.owner ||
      response?.data?.phone ||
      response?.data?.number ||
      null;

    // Preparar metadata atualizado
    const updatedMetadata: any = {
      lastConnect: response,
    };

    // Se encontrou número conectado, salvar
    if (connectedPhone) {
      updatedMetadata.connectedPhone = connectedPhone;
      console.log('[ConnectInstance] Connected phone found:', connectedPhone);
    }

    await pool.query(
      `
      UPDATE chat_instances
      SET status = $1,
          metadata = metadata || $2::jsonb,
          updated_at = now()
      WHERE id = $3
    `,
      [response?.status || 'connecting', JSON.stringify(updatedMetadata), instance.id]
    );

    // Se conectado com sucesso, configurar webhook automaticamente
    // Também tentar configurar se status for 'connecting' (pode ser QR code)
    if (response?.status === 'connected' || response?.status === 'open' || response?.status === 'connecting') {
      // Buscar instância atualizada
      const updatedInstance = await pool.query<ChatInstanceRow>(
        'SELECT * FROM chat_instances WHERE id = $1',
        [instance.id]
      );
      if (updatedInstance.rows[0]) {
        // Configurar webhook mesmo se estiver connecting (será útil quando conectar)
        await autoConfigureWebhook(updatedInstance.rows[0]);
      }
    }

    res.json(response);
  } catch (error: any) {
    console.error('Error connecting instance:', error);
    res.status(500).json({ error: error.message || 'Failed to connect instance' });
  }
}

export async function deleteInstance(req: AuthRequest, res: Response) {
  try {
    ensureAdminToken();
    const userId = req.userId!;
    const { id } = req.params;

    const instance = await loadInstance(userId, id, res);
    if (!instance) return;

    // Deletar instância na UazAPI (se necessário)
    // Nota: A UazAPI pode não ter endpoint de delete, então apenas deletamos do nosso banco
    // Se a UazAPI tiver endpoint, adicionar aqui: await uazapiService.deleteInstance(instance.instance_token);

    // Deletar do banco de dados (cascade vai deletar conversas e mensagens)
    await pool.query('DELETE FROM chat_instances WHERE id = $1 AND user_id = $2', [id, userId]);

    res.json({ message: 'Instância deletada com sucesso' });
  } catch (error: any) {
    console.error('Error deleting instance:', error);
    res.status(500).json({ error: error.message || 'Failed to delete instance' });
  }
}

/**
 * Configura webhook para uma instância WhatsApp na UazAPI
 * 
 * Eventos padrão configurados:
 * - messages: Novas mensagens recebidas
 * - messages_update: Atualizações de status (entregue, lida, etc)
 * - connection: Mudanças no estado da conexão
 * - chats: Atualizações de conversas
 * - leads: Atualizações de leads
 * 
 * Filtros críticos aplicados:
 * - excludeMessages: ["wasSentByApi"] - PREVINE LOOPS INFINITOS
 */
export async function configureInstanceWebhook(req: AuthRequest, res: Response) {
  const startTime = Date.now();
  const configId = randomUUID();

  try {
    const userId = req.userId!;
    const { id } = req.params;
    const payload = webhookConfigSchema.parse(req.body || {});

    console.log(`[Webhook Config ${configId}] Starting webhook configuration`, {
      instanceId: id,
      userId,
      timestamp: new Date().toISOString(),
    });

    // Carregar instância
    const instance = await loadInstance(userId, id, res);
    if (!instance) return;

    // Resolver URL do webhook
    const resolvedUrl =
      payload.url ||
      process.env.UAZAPI_WEBHOOK_URL ||
      (process.env.PUBLIC_API_URL
        ? `${process.env.PUBLIC_API_URL.replace(/\/$/, '')}/webhooks/uazapi`
        : null);

    if (!resolvedUrl) {
      console.error(`[Webhook Config ${configId}] Webhook URL not configured`);
      res.status(400).json({
        error: 'Webhook URL is not configured. Provide url or set UAZAPI_WEBHOOK_URL/PUBLIC_API_URL.',
      });
      return;
    }

    // Eventos padrão recomendados
    const defaultEvents = [
      'messages',        // Novas mensagens recebidas
      'messages_update', // Atualizações de status
      'chats',           // Atualizações de conversas
      'connection',      // Mudanças no estado da conexão
      'leads',           // Atualizações de leads
    ];

    // Filtros CRÍTICOS para prevenir loops
    // SEMPRE excluir mensagens enviadas pela API
    const defaultExcludeMessages = ['wasSentByApi'];

    // Mesclar filtros: sempre incluir wasSentByApi, mas permitir adicionar outros
    const excludeMessages = payload.excludeMessages
      ? [...new Set([...defaultExcludeMessages, ...payload.excludeMessages])]
      : defaultExcludeMessages;

    // Preparar body para UazAPI
    const webhookBody: Record<string, any> = {
      enabled: payload.enabled !== false, // Padrão: true
      url: resolvedUrl,
      events: payload.events || defaultEvents,
      excludeMessages: excludeMessages,
      addUrlEvents: payload.addUrlEvents ?? true, // Padrão: true (URLs dinâmicas)
      AddUrlTypesMessages: payload.addUrlTypesMessages ?? true, // Padrão: true
    };

    // Adicionar secret se configurado
    const secret = payload.secret || process.env.UAZAPI_WEBHOOK_SECRET;
    if (secret) {
      webhookBody.secret = secret;
    }

    console.log(`[Webhook Config ${configId}] Configuring webhook in UazAPI`, {
      instance: instance.external_instance_name,
      url: resolvedUrl,
      events: webhookBody.events,
      excludeMessages: webhookBody.excludeMessages,
      hasSecret: !!secret,
    });

    // Configurar webhook na UazAPI
    let uazapiResponse;
    try {
      uazapiResponse = await uazapiService.configureWebhook(instance.instance_token, webhookBody);
      console.log(`[Webhook Config ${configId}] Webhook configured successfully in UazAPI`, {
        response: JSON.stringify(uazapiResponse).substring(0, 200),
      });
    } catch (error: any) {
      console.error(`[Webhook Config ${configId}] Error from UazAPI:`, {
        error: error.message,
        status: error.status,
        payload: error.payload,
      });
      throw error;
    }

    // Salvar configuração no banco de dados
    const webhookMetadata = {
      webhook: {
        url: resolvedUrl,
        events: webhookBody.events,
        excludeMessages: webhookBody.excludeMessages,
        addUrlEvents: webhookBody.addUrlEvents,
        addUrlTypesMessages: webhookBody.AddUrlTypesMessages,
        enabled: webhookBody.enabled,
        hasSecret: !!secret,
        configuredAt: new Date().toISOString(),
        configuredBy: userId,
        uazapiResponse: uazapiResponse,
      },
    };

    await pool.query(
      `
        UPDATE chat_instances
        SET metadata = metadata || $1::jsonb,
            updated_at = now()
        WHERE id = $2
      `,
      [JSON.stringify(webhookMetadata), instance.id]
    );

    console.log(`[Webhook Config ${configId}] Webhook configuration saved to database`, {
      instanceId: instance.id,
      processingTime: Date.now() - startTime,
    });

    res.json({
      configured: true,
      webhookId: configId,
      url: resolvedUrl,
      events: webhookBody.events,
      excludeMessages: webhookBody.excludeMessages,
      enabled: webhookBody.enabled,
      uazapiResponse: uazapiResponse,
      metadata: webhookMetadata.webhook,
    });
  } catch (error: any) {
    console.error(`[Webhook Config ${configId}] Error configuring webhook:`, {
      error: error.message,
      stack: error.stack,
      instanceId: req.params.id,
      processingTime: Date.now() - startTime,
    });

    // Se for erro de validação do Zod, retornar detalhes
    if (error.name === 'ZodError') {
      res.status(400).json({
        error: 'Invalid webhook configuration',
        details: error.errors,
      });
      return;
    }

    res.status(500).json({
      error: error.message || 'Failed to configure webhook',
      webhookId: configId,
    });
  }
}

/**
 * Obtém a configuração atual do webhook de uma instância
 * Retorna tanto a configuração salva no banco quanto a da UazAPI
 */
export async function getInstanceWebhook(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const instance = await loadInstance(userId, id, res);
    if (!instance) return;

    // Buscar configuração do banco de dados
    const dbWebhook = instance.metadata?.webhook || null;

    // Buscar configuração da UazAPI
    let uazapiWebhook = null;
    try {
      uazapiWebhook = await uazapiService.getWebhook(instance.instance_token);
    } catch (error: any) {
      console.warn('Error fetching webhook from UazAPI:', {
        error: error.message,
        instanceId: id,
      });
      // Não falhar se UazAPI não retornar, apenas logar
    }

    res.json({
      instanceId: id,
      database: dbWebhook,
      uazapi: uazapiWebhook,
      synced: dbWebhook && uazapiWebhook ? 
        dbWebhook.url === (Array.isArray(uazapiWebhook) ? (uazapiWebhook[0] as any)?.url : (uazapiWebhook as any)?.url) : 
        false,
    });
  } catch (error: any) {
    console.error('Error getting webhook configuration:', error);
    res.status(500).json({ error: error.message || 'Failed to get webhook configuration' });
  }
}

/**
 * Força a configuração do webhook para uma instância
 * Útil para reconfigurar ou configurar manualmente
 */
export async function forceConfigureWebhook(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const instance = await loadInstance(userId, id, res);
    if (!instance) return;

    console.log('[Force-Webhook] Forcing webhook configuration', {
      instance: instance.external_instance_name,
    });

    await autoConfigureWebhook(instance);

    // Buscar webhook configurado
    let webhookResult = null;
    try {
      webhookResult = await uazapiService.getWebhook(instance.instance_token);
    } catch (error: any) {
      console.warn('Error fetching webhook from UazAPI:', error.message);
    }

    res.json({
      configured: true,
      webhook: webhookResult,
      message: 'Webhook configuration forced',
    });
  } catch (error: any) {
    console.error('Error forcing webhook configuration:', error);
    res.status(500).json({ error: error.message || 'Failed to force webhook configuration' });
  }
}

export async function getInstanceStatus(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const instance = await loadInstance(userId, id, res);
    if (!instance) return;

    const result = (await uazapiService.getInstanceStatus(instance.instance_token)) as AnyObject;
    
    // Atualizar status no banco se mudou
    const instanceData = result?.instance || result;
    const newStatus = instanceData?.state || instanceData?.status || result?.status;
    const connected = result?.connected || instanceData?.connected;
    const loggedIn = result?.loggedIn || instanceData?.loggedIn;
    
    // Extrair número conectado da resposta
    const connectedPhone = 
      result?.owner || 
      result?.phone || 
      result?.number || 
      instanceData?.owner || 
      instanceData?.phone || 
      instanceData?.number ||
      result?.data?.owner ||
      result?.data?.phone ||
      result?.data?.number ||
      null;
    
    // Determinar status final
    let finalStatus = instance.status;
    if (newStatus === 'open' || newStatus === 'connected' || connected === true || loggedIn === true) {
      finalStatus = 'connected';
    } else if (newStatus === 'connecting') {
      finalStatus = 'connecting';
    } else if (newStatus) {
      finalStatus = newStatus;
    }
    
    // Preparar metadata atualizado
    const currentMetadata = instance.metadata || {};
    const updatedMetadata: any = {
      ...currentMetadata,
      lastStatusCheck: result,
    };

    // Se encontrou número conectado, salvar
    if (connectedPhone) {
      updatedMetadata.connectedPhone = connectedPhone;
      console.log('[GetInstanceStatus] Connected phone found:', connectedPhone);
    }
    
    // Atualizar no banco se mudou status ou número conectado
    if (finalStatus !== instance.status || (connectedPhone && currentMetadata?.connectedPhone !== connectedPhone)) {
      await pool.query(
        'UPDATE chat_instances SET status = $1, metadata = $2::jsonb, updated_at = now() WHERE id = $3',
        [finalStatus, JSON.stringify(updatedMetadata), instance.id]
      );
      
      // Se mudou para connected, configurar webhook automaticamente
      if (finalStatus === 'connected' && instance.status !== 'connected') {
        const updatedInstance = await pool.query<ChatInstanceRow>(
          'SELECT * FROM chat_instances WHERE id = $1',
          [instance.id]
        );
        if (updatedInstance.rows[0]) {
          console.log('Instance status changed to connected, auto-configuring webhook...');
          await autoConfigureWebhook(updatedInstance.rows[0]);
        }
      }
    }
    
    res.json(result);
  } catch (error: any) {
    console.error('Error fetching instance status:', error);
    res.status(500).json({ error: error.message || 'Failed to get status' });
  }
}

export async function syncConversations(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const data = syncSchema.safeParse(req.body);

    if (!data.success) {
      res.status(400).json({ error: 'Invalid payload', details: data.error.flatten() });
      return;
    }

    const instance = await loadInstance(userId, data.data.instanceId, res);
    if (!instance) return;

    const payload = {
      limit: data.data.limit ?? 200,
      ...(data.data.filters || {}),
      sort: data.data.filters?.sort || '-wa_lastMsgTimestamp',
    };

    const remoteChats = (await uazapiService.findChats(
      instance.instance_token,
      payload
    )) as AnyObject;
    const chatsArray =
      (Array.isArray(remoteChats?.chats) && remoteChats?.chats) ||
      (Array.isArray(remoteChats?.data?.chats) && remoteChats?.data?.chats) ||
      (Array.isArray(remoteChats?.results) && remoteChats?.results) ||
      (Array.isArray(remoteChats?.data) && remoteChats?.data) ||
      (Array.isArray(remoteChats) ? remoteChats : []);

    let upserted = 0;
    for (const item of chatsArray) {
      const normalized = normalizeChatPayload(item);
      if (!normalized) continue;
      await upsertConversation(instance, normalized);
      upserted += 1;
    }

    res.json({
      total: chatsArray.length,
      upserted,
    });
  } catch (error: any) {
    console.error('Error syncing conversations:', error);
    res.status(500).json({ error: error.message || 'Failed to sync conversations' });
  }
}

export async function getConversations(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { instanceId, search, assignedTo, unassigned, status, queue, startDate, endDate } = req.query;
    const params: any[] = [userId];
    let paramIndex = 2;

    let query = `
      SELECT
        c.id,
        c.user_id,
        c.instance_id,
        c.external_chat_id,
        c.external_fast_id,
        c.contact_name,
        c.profile_name,
        c.phone_number,
        c.status,
        c.last_message_preview,
        c.last_message_at,
        c.unread_count,
        c.metadata,
        c.created_at,
        c.updated_at,
        c.client_id,
        i.name as instance_name,
        -- Cliente: usar o client_id salvo ou buscar pelo telefone via JOIN
        COALESCE(c.client_id, cl.id) as client_id,
        -- Lead: apenas se não houver client_id, buscar pelo telefone via JOIN
        -- NOTA: Não usamos c.lead_id diretamente pois a coluna pode não existir
        CASE 
          WHEN COALESCE(c.client_id, cl.id) IS NOT NULL THEN NULL
          ELSE (
            SELECT l2.id 
            FROM leads l2
            WHERE l2.user_id = c.user_id
              AND l2.phone IS NOT NULL
              AND l2.phone <> ''
              AND c.phone_number IS NOT NULL
              AND c.phone_number <> ''
              AND regexp_replace(l2.phone, '\\D', '', 'g') = regexp_replace(c.phone_number, '\\D', '', 'g')
            LIMIT 1
          )
        END as lead_id
      FROM chat_conversations c
      INNER JOIN chat_instances i ON i.id = c.instance_id
      LEFT JOIN clients cl
        ON cl.user_id = c.user_id
       AND c.phone_number IS NOT NULL
       AND c.phone_number <> ''
       AND cl.phone IS NOT NULL
       AND cl.phone <> ''
       AND regexp_replace(COALESCE(cl.phone, ''), '\\D', '', 'g') = regexp_replace(COALESCE(c.phone_number, ''), '\\D', '', 'g')
      WHERE c.user_id = $1
    `;

    if (instanceId) {
      params.push(instanceId);
      query += ` AND c.instance_id = $${params.length}`;
      paramIndex++;
    }

    // Filtros opcionais - removidos assigned_to e queue pois podem não existir
    // TODO: Reativar quando a migration 16 for executada
    // if (assignedTo === 'me') {
    //   params.push(userId);
    //   query += ` AND c.assigned_to = $${params.length}`;
    //   paramIndex++;
    // } else if (unassigned === 'true') {
    //   query += ` AND (c.assigned_to IS NULL OR c.assigned_to = '00000000-0000-0000-0000-000000000000'::uuid)`;
    // }

    if (status && typeof status === 'string') {
      params.push(status);
      query += ` AND c.status = $${params.length}`;
      paramIndex++;
    }

    // if (queue && typeof queue === 'string') {
    //   params.push(queue);
    //   query += ` AND c.queue = $${params.length}`;
    //   paramIndex++;
    // }

    if (search && typeof search === 'string') {
      params.push(`%${search.toLowerCase()}%`);
      query += ` AND (
        LOWER(COALESCE(c.contact_name, '')) LIKE $${params.length} OR
        LOWER(COALESCE(c.profile_name, '')) LIKE $${params.length} OR
        LOWER(COALESCE(c.phone_number, '')) LIKE $${params.length}
      )`;
    }

    // Filtros de data
    if (startDate && typeof startDate === 'string') {
      params.push(new Date(startDate));
      query += ` AND (COALESCE(c.last_message_at, c.created_at) >= $${params.length})`;
      paramIndex++;
    }

    if (endDate && typeof endDate === 'string') {
      params.push(new Date(endDate));
      query += ` AND (COALESCE(c.last_message_at, c.created_at) <= $${params.length})`;
      paramIndex++;
    }

    query += ' ORDER BY c.last_message_at DESC NULLS LAST, c.updated_at DESC LIMIT 200';

    console.log('[GetConversations] Querying conversations', {
      userId,
      instanceId,
      search: search || 'none',
      queryParams: params,
    });

    const conversations = await pool.query(query, params);
    
    console.log('[GetConversations] Query result', {
      userId,
      instanceId,
      totalFound: conversations.rowCount,
      conversationIds: conversations.rows.slice(0, 10).map(c => c.id),
      sampleConversations: conversations.rows.slice(0, 3).map(c => ({
        id: c.id,
        external_chat_id: c.external_chat_id,
        contact_name: c.contact_name,
        instance_id: c.instance_id,
        user_id: c.user_id,
        last_message_at: c.last_message_at,
      })),
    });

    // Verificar se há conversas no banco para este usuário mas não retornadas
    if (conversations.rowCount === 0 && instanceId) {
      const allConversationsCheck = await pool.query(
        'SELECT id, user_id, instance_id, external_chat_id, contact_name FROM chat_conversations WHERE instance_id = $1 LIMIT 5',
        [instanceId]
      );
      console.log('[GetConversations] Debug: Conversations in DB for this instance', {
        instanceId,
        found: allConversationsCheck.rowCount,
        conversations: allConversationsCheck.rows.map(c => ({
          id: c.id,
          userId: c.user_id,
          requestedUserId: userId,
          userIdMatch: c.user_id === userId,
          instanceId: c.instance_id,
          externalChatId: c.external_chat_id,
          contactName: c.contact_name,
        })),
      });
    }

    res.json(conversations.rows);
  } catch (error: any) {
    console.error('[GetConversations] Error fetching conversations:', {
      error: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
      position: error.position,
      stack: error.stack,
      userId: req.userId,
      instanceId: req.query.instanceId,
    });
    res.status(500).json({ 
      error: 'Failed to fetch conversations',
      message: error.message,
      detail: error.detail,
    });
  }
}

export async function getConversationMessages(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const conversation = await pool.query(
      'SELECT id FROM chat_conversations WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (conversation.rowCount === 0) {
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }

    const messages = await pool.query(
      `
        SELECT *
        FROM chat_messages
        WHERE conversation_id = $1
        ORDER BY sent_at DESC NULLS LAST, created_at DESC
        LIMIT 200
      `,
      [id]
    );

    res.json(messages.rows.reverse());
  } catch (error: any) {
    console.error('Error fetching conversation messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
}

/**
 * Busca o perfil completo (cliente ou lead) vinculado a uma conversa
 * GET /api/chat/conversations/:id/profile
 */
export async function getConversationProfile(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // Buscar a conversa com client_id e lead_id
    const conversationResult = await pool.query(
      `
      SELECT 
        c.id,
        c.client_id,
        c.phone_number,
        COALESCE(
          c.client_id,
          CASE 
            WHEN c.phone_number IS NOT NULL AND c.phone_number <> '' 
            THEN (
              SELECT cl.id 
              FROM clients cl
              WHERE cl.user_id = c.user_id
                AND cl.phone IS NOT NULL
                AND cl.phone <> ''
                AND regexp_replace(cl.phone, '\\D', '', 'g') = regexp_replace(c.phone_number, '\\D', '', 'g')
              LIMIT 1
            )
            ELSE NULL
          END
        ) as resolved_client_id,
        -- Lead: buscar apenas se não houver client_id (sem depender de coluna lead_id)
        CASE 
          WHEN COALESCE(c.client_id, (
            SELECT cl2.id 
            FROM clients cl2
            WHERE cl2.user_id = c.user_id
              AND cl2.phone IS NOT NULL
              AND cl2.phone <> ''
              AND c.phone_number IS NOT NULL
              AND c.phone_number <> ''
              AND regexp_replace(cl2.phone, '\\D', '', 'g') = regexp_replace(c.phone_number, '\\D', '', 'g')
            LIMIT 1
          )) IS NOT NULL THEN NULL
          WHEN c.phone_number IS NOT NULL AND c.phone_number <> '' THEN (
            SELECT l.id 
            FROM leads l
            WHERE l.user_id = c.user_id
              AND l.phone IS NOT NULL
              AND l.phone <> ''
              AND regexp_replace(l.phone, '\\D', '', 'g') = regexp_replace(c.phone_number, '\\D', '', 'g')
            LIMIT 1
          )
          ELSE NULL
        END as resolved_lead_id
      FROM chat_conversations c
      WHERE c.id = $1 AND c.user_id = $2
      `,
      [id, userId]
    );

    if (conversationResult.rowCount === 0) {
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }

    const conversation = conversationResult.rows[0];
    const clientId = conversation.resolved_client_id || conversation.client_id;
    const leadId = conversation.resolved_lead_id || conversation.lead_id;

    // Priorizar cliente sobre lead
    if (clientId) {
      const clientResult = await pool.query(
        'SELECT * FROM clients WHERE id = $1 AND user_id = $2',
        [clientId, userId]
      );
      if ((clientResult.rowCount ?? 0) > 0) {
        res.json({
          type: 'client',
          profile: clientResult.rows[0],
        });
        return;
      }
    }

    if (leadId) {
      const leadResult = await pool.query(
        'SELECT * FROM leads WHERE id = $1 AND user_id = $2',
        [leadId, userId]
      );
      if ((leadResult.rowCount ?? 0) > 0) {
        res.json({
          type: 'lead',
          profile: leadResult.rows[0],
        });
        return;
      }
    }

    // Se não encontrou cliente nem lead, retornar null
    res.json({
      type: null,
      profile: null,
    });
  } catch (error: any) {
    console.error('Error fetching conversation profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
}

/**
 * Busca todas as mensagens de conversas vinculadas a um cliente
 * GET /api/chat/clients/:id/messages
 */
export async function getClientMessages(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  try {
    const { id: clientId } = req.params;

    // Verificar se o cliente existe e pertence ao usuário
    const clientResult = await pool.query(
      'SELECT id FROM clients WHERE id = $1 AND user_id = $2',
      [clientId, userId]
    );

    if ((clientResult.rowCount ?? 0) === 0) {
      res.status(404).json({ error: 'Cliente não encontrado' });
      return;
    }

    // Buscar todas as conversas vinculadas a este cliente
    // A busca é feita de 3 formas:
    // 1. Conversas com client_id = clientId (vinculação direta)
    // 2. Conversas com telefone que corresponde ao telefone do cliente (via JOIN)
    // 3. Conversas que podem ter sido vinculadas pelo telefone mesmo sem client_id salvo
    const conversationsResult = await pool.query(
      `
      SELECT DISTINCT 
        c.id, 
        c.phone_number, 
        c.contact_name, 
        c.profile_name, 
        c.external_chat_id,
        COALESCE(c.client_id, cl.id) as resolved_client_id
      FROM chat_conversations c
      LEFT JOIN clients cl
        ON cl.user_id = c.user_id
       AND cl.id = $2
       AND c.phone_number IS NOT NULL
       AND c.phone_number <> ''
       AND cl.phone IS NOT NULL
       AND cl.phone <> ''
       AND regexp_replace(COALESCE(cl.phone, ''), '\\D', '', 'g') = regexp_replace(COALESCE(c.phone_number, ''), '\\D', '', 'g')
      WHERE c.user_id = $1
        AND (
          -- Vinculação direta por client_id
          c.client_id = $2
          -- Vinculação via JOIN (telefone corresponde)
          OR cl.id = $2
        )
      `,
      [userId, clientId]
    );

    if ((conversationsResult.rowCount ?? 0) === 0) {
      res.json([]);
      return;
    }

    const conversationIds = conversationsResult.rows.map((row) => row.id);

    // Se não há conversas, retornar array vazio
    if (conversationIds.length === 0) {
      res.json([]);
      return;
    }

    // Buscar todas as mensagens dessas conversas
    // Usar ANY com array UUID para melhor performance
    const messagesResult = await pool.query(
      `
      SELECT 
        m.id,
        m.conversation_id,
        m.direction,
        m.external_message_id,
        m.body,
        m.media,
        m.status,
        m.sent_at,
        m.metadata,
        m.created_at,
        c.phone_number,
        c.contact_name,
        c.profile_name,
        c.external_chat_id,
        c.instance_id
      FROM chat_messages m
      INNER JOIN chat_conversations c ON c.id = m.conversation_id
      WHERE m.conversation_id = ANY($1::uuid[])
      ORDER BY m.sent_at DESC NULLS LAST, m.created_at DESC
      LIMIT 500
      `,
      [conversationIds]
    );

    // Retornar mensagens e também a primeira conversation_id encontrada para facilitar envio
    const firstConversationId = conversationIds.length > 0 ? conversationIds[0] : null;
    
    res.json({
      messages: messagesResult.rows.reverse(),
      conversationId: firstConversationId,
      conversationIds: conversationIds,
    });
  } catch (error: any) {
    console.error('Error fetching client messages:', {
      error: error.message,
      code: error.code,
      detail: error.detail,
      stack: error.stack,
      clientId: req.params.id,
      userId,
    });
    res.status(500).json({ 
      error: 'Failed to fetch messages',
      message: error.message,
      detail: error.detail,
    });
  }
}

export async function syncConversationMessages(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const payload = syncMessagesSchema.safeParse(req.body || {});

    if (!payload.success) {
      res.status(400).json({ error: 'Invalid payload', details: payload.error.flatten() });
      return;
    }

    const conversationResult = await pool.query(
      `
        SELECT c.*, i.instance_token
        FROM chat_conversations c
        INNER JOIN chat_instances i ON i.id = c.instance_id
        WHERE c.id = $1 AND c.user_id = $2
      `,
      [id, userId]
    );

    if (conversationResult.rowCount === 0) {
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }

    const conversation = conversationResult.rows[0];
    const body: Record<string, unknown> = {
      chatid: conversation.external_chat_id,
      limit: payload.data.limit ?? 50,
    };

    if (payload.data.before) {
      body.before = payload.data.before;
    }
    if (payload.data.after) {
      body.after = payload.data.after;
    }

    const messagesResponse = await uazapiService.findMessages(conversation.instance_token, body);
    const remoteMessages =
      (Array.isArray((messagesResponse as AnyObject)?.messages) && (messagesResponse as AnyObject).messages) ||
      (Array.isArray((messagesResponse as AnyObject)?.data?.messages) && (messagesResponse as AnyObject).data.messages) ||
      (Array.isArray((messagesResponse as AnyObject)?.data) && (messagesResponse as AnyObject).data) ||
      (Array.isArray(messagesResponse) ? (messagesResponse as AnyObject[]) : []);

    let saved = 0;
    for (const entry of remoteMessages) {
      const message = (entry as AnyObject)?.message || entry;
      if (!message) continue;

      const direction = message.fromMe || message.wasSentByApi ? 'outgoing' : 'incoming';
      const timestamp = message.timestamp || message.messageTimestamp;
      let sentAt: Date | null = null;
      if (timestamp) {
        const numeric = Number(timestamp);
        if (!Number.isNaN(numeric)) {
          sentAt = new Date(numeric > 1e12 ? numeric : numeric * 1000);
        }
      }

      await saveMessage(conversation.id, direction, {
        externalMessageId: message.id || message.messageId || message.key?.id || randomUUID(),
        body: message.text || message.body || message.caption || null,
        media: message.media || [],
        status: message.status || null,
        sentAt,
        metadata: message,
        skipUnreadUpdate: true,
      });
      saved += 1;
    }

    res.json({
      synced: saved,
      totalReturned: remoteMessages.length,
      pagination: {
        returnedMessages: (messagesResponse as AnyObject)?.returnedMessages,
        limit: (messagesResponse as AnyObject)?.limit,
        offset: (messagesResponse as AnyObject)?.offset,
        nextOffset: (messagesResponse as AnyObject)?.nextOffset,
        hasMore: (messagesResponse as AnyObject)?.hasMore,
      },
    });
  } catch (error: any) {
    console.error('Error syncing messages:', error);
    res.status(500).json({ error: error.message || 'Failed to sync messages' });
  }
}

export async function sendMessage(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const data = sendMessageSchema.parse(req.body);

    const conversationResult = await pool.query(
      `
        SELECT c.*, i.instance_token, i.external_instance_name
        FROM chat_conversations c
        INNER JOIN chat_instances i ON i.id = c.instance_id
        WHERE c.id = $1 AND c.user_id = $2
      `,
      [data.conversationId, userId]
    );

    if (conversationResult.rowCount === 0) {
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }

    const conversation = conversationResult.rows[0];
    const messageResponse = (await uazapiService.sendTextMessage(
      conversation.instance_token,
      {
        number: conversation.phone_number || conversation.external_chat_id,
        text: data.text,
        readchat: data.readChat,
        readmessages: data.readMessages,
        delay: data.delay,
        track_source: 'painelcrm',
      }
    )) as AnyObject;

    await saveMessage(conversation.id, 'outgoing', {
      externalMessageId:
        messageResponse?.id ||
        messageResponse?.messageId ||
        messageResponse?.key?.id ||
        null,
      body: data.text,
      status: 'sent',
      sentAt: new Date(),
      metadata: messageResponse,
    });

    res.status(201).json({
      response: messageResponse,
    });
  } catch (error: any) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: error.message || 'Failed to send message' });
  }
}

export async function markConversationRead(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    
    console.log('[MarkRead] Starting mark conversation as read', {
      userId,
      conversationId: id,
    });

    const payload = markReadSchema.parse(req.body || { read: true });

    const conversationResult = await pool.query(
      `
        SELECT c.*, i.instance_token
        FROM chat_conversations c
        INNER JOIN chat_instances i ON i.id = c.instance_id
        WHERE c.id = $1 AND c.user_id = $2
      `,
      [id, userId]
    );

    if (conversationResult.rowCount === 0) {
      console.warn('[MarkRead] Conversation not found', { conversationId: id, userId });
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }

    const conversation = conversationResult.rows[0];
    const identifier =
      conversation.external_chat_id ||
      conversation.phone_number ||
      (conversation.metadata?.wa_chatid ?? null);

    if (!identifier) {
      console.warn('[MarkRead] No identifier found', {
        conversationId: id,
        external_chat_id: conversation.external_chat_id,
        phone_number: conversation.phone_number,
        metadata: conversation.metadata,
      });
      res.status(400).json({ error: 'Conversation has no WhatsApp identifier' });
      return;
    }

    // Tentar marcar como lida na UazAPI (pode falhar, mas não é crítico)
    try {
      await uazapiService.readChat(conversation.instance_token, {
        number: identifier,
        read: payload.read,
      });
      console.log('[MarkRead] Successfully marked as read in UazAPI', {
        conversationId: id,
        identifier,
      });
    } catch (uazapiError: any) {
      // Não falhar se UazAPI der erro - apenas logar
      console.warn('[MarkRead] Failed to mark as read in UazAPI (non-critical):', {
        error: uazapiError.message,
        conversationId: id,
        identifier,
      });
    }

    // Sempre atualizar no banco de dados local
    if (payload.read) {
      await pool.query(
        `
          UPDATE chat_conversations
          SET unread_count = 0, updated_at = now()
          WHERE id = $1
        `,
        [conversation.id]
      );
      console.log('[MarkRead] Updated unread_count to 0 in database', {
        conversationId: id,
      });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('[MarkRead] Error updating read status:', {
      error: error.message,
      stack: error.stack,
      conversationId: req.params.id,
      userId: req.userId,
    });
    res.status(500).json({ error: error.message || 'Failed to update read status' });
  }
}

/**
 * Extrai informações de mensagem de diferentes formatos de payload
 */
function extractMessageData(payload: any): {
  message: any;
  chatId: string | null;
  direction: 'incoming' | 'outgoing';
  messageType: string | null;
  isGroup: boolean;
} {
  // Tentar diferentes formatos de payload
      const data = payload.data || payload.message || payload;
      const message = data.message || data;

  // Extrair chatId de múltiplas fontes
      const chatId =
        data.wa_chatid ||
        message.chatid ||
        message.chatId ||
        message.chat?.id ||
        message.key?.remoteJid ||
    message.remoteJid ||
        message.number ||
    data.number ||
        null;

  // Determinar direção
  const direction: 'incoming' | 'outgoing' =
    message.fromMe || message.wasSentByApi ? 'outgoing' : 'incoming';

  // Tipo de mensagem
  const messageType =
    message.type ||
    message.messageType ||
    message.msgType ||
    (message.text ? 'text' : null) ||
    (message.image ? 'image' : null) ||
    (message.video ? 'video' : null) ||
    (message.audio ? 'audio' : null) ||
    (message.document ? 'document' : null) ||
    (message.sticker ? 'sticker' : null) ||
    (message.location ? 'location' : null) ||
    (message.contact ? 'contact' : null) ||
    null;

  // Verificar se é grupo
  const isGroup =
    chatId?.endsWith('@g.us') ||
    chatId?.includes('@g.us') ||
    message.isGroup ||
    data.isGroup ||
    false;

  return {
    message,
    chatId,
    direction,
    messageType,
    isGroup,
  };
}

/**
 * Extrai corpo da mensagem de diferentes tipos
 */
function extractMessageBody(message: any): string {
  // Texto direto
  if (message.text) return message.text;
  if (message.body) return message.body;

  // Caption de mídia
  if (message.caption) return message.caption;

  // Mensagens de sistema
  if (message.notify) return message.notify;
  if (message.content) return String(message.content);

  // Tipos específicos
  if (message.type === 'location') {
    return `📍 Localização: ${message.latitude}, ${message.longitude}`;
  }
  if (message.type === 'contact') {
    return `👤 Contato: ${message.displayName || message.name || 'Contato compartilhado'}`;
  }
  if (message.type === 'document') {
    return `📄 ${message.fileName || 'Documento'}`;
  }
  if (message.type === 'image') {
    return message.caption || '🖼️ Imagem';
  }
  if (message.type === 'video') {
    return message.caption || '🎥 Vídeo';
  }
  if (message.type === 'audio') {
    return '🎵 Áudio';
  }
  if (message.type === 'sticker') {
    return '🎨 Sticker';
  }

  return '';
}

/**
 * Extrai informações de mídia da mensagem
 */
function extractMediaInfo(message: any): any[] {
  const media: any[] = [];

  // Se já existe array de media
  if (Array.isArray(message.media)) {
    return message.media;
  }

  // Extrair mídia individual
  if (message.image || message.video || message.audio || message.document || message.sticker) {
    const mediaItem: any = {};

    if (message.image) {
      mediaItem.type = 'image';
      mediaItem.url = message.image.url || message.image;
      mediaItem.mimetype = message.image.mimetype || 'image/jpeg';
    } else if (message.video) {
      mediaItem.type = 'video';
      mediaItem.url = message.video.url || message.video;
      mediaItem.mimetype = message.video.mimetype || 'video/mp4';
    } else if (message.audio) {
      mediaItem.type = 'audio';
      mediaItem.url = message.audio.url || message.audio;
      mediaItem.mimetype = message.audio.mimetype || 'audio/ogg';
      mediaItem.seconds = message.audio.seconds;
    } else if (message.document) {
      mediaItem.type = 'document';
      mediaItem.url = message.document.url || message.document;
      mediaItem.mimetype = message.document.mimetype;
      mediaItem.fileName = message.document.fileName || message.fileName;
    } else if (message.sticker) {
      mediaItem.type = 'sticker';
      mediaItem.url = message.sticker.url || message.sticker;
      mediaItem.mimetype = message.sticker.mimetype || 'image/webp';
    }

    if (Object.keys(mediaItem).length > 0) {
      media.push(mediaItem);
    }
  }

  return media;
}

/**
 * Converte timestamp para Date
 */
function parseTimestamp(timestamp: any): Date | null {
  if (!timestamp) return null;

  // Se já é Date
  if (timestamp instanceof Date) return timestamp;

  // Se é número
  const numeric = Number(timestamp);
  if (!Number.isNaN(numeric)) {
    // Se está em segundos (menor que 1e12), converter para milissegundos
    return new Date(numeric > 1e12 ? numeric : numeric * 1000);
  }

  // Se é string, tentar parse
  if (typeof timestamp === 'string') {
    const parsed = Date.parse(timestamp);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed);
    }
  }

  return null;
}

/**
 * Processa eventos de webhook de forma assíncrona
 * Esta função é chamada após responder ao webhook para não bloquear a resposta
 */
async function processWebhookEvent(instance: ChatInstanceRow, payload: any, event: string) {
  const startTime = Date.now();
  const webhookId = randomUUID();

  try {
    console.log(`[Webhook ${webhookId}] ===== STARTING EVENT PROCESSING =====`, {
      instanceId: instance.id,
      instanceName: instance.name,
      instanceExternalName: instance.external_instance_name,
      event,
      timestamp: new Date().toISOString(),
      payloadSize: JSON.stringify(payload).length,
      payloadKeys: Object.keys(payload),
      payloadPreview: JSON.stringify(payload).substring(0, 500),
    });

    if (event === 'messages' || payload.message) {
      const extracted = extractMessageData(payload);

      // Ignorar mensagens enviadas pela API para evitar loops
      if (extracted.message.wasSentByApi || extracted.message.fromMe) {
        console.log(`[Webhook ${webhookId}] Skipping API-sent message`, {
          messageId: extracted.message.id || extracted.message.messageId,
          direction: extracted.direction,
        });
        return;
      }

      if (!extracted.chatId) {
        console.warn(`[Webhook ${webhookId}] No chatId found in message payload`, {
          payloadKeys: Object.keys(payload),
        });
        return;
      }

      // Extrair informações adicionais do payload
      const data = payload.data || payload.message || payload;
      const message = extracted.message;

      // Muitos provedores (incluindo UazAPI) enviam um objeto de chat separado
      // com campos como wa_contactName, name, image, etc.
      // Damos preferência a essas informações para preencher corretamente
      // o nome e a foto do contato no CRM.
      const baseChat =
        (data && (data.chat || data.contact || data.conversation)) ||
        (message && (message.chat || message.contact || message.conversation)) ||
        {};

      // Preparar dados para conversa, combinando:
      // - dados do chat (nome, imagem, etc.)
      // - dados do payload/data
      // - dados da mensagem
      const chatData = normalizeChatPayload({
        ...baseChat,
          ...data,
          ...message,
        wa_chatid: extracted.chatId,
          wa_lastMsgTimestamp: message.timestamp || message.messageTimestamp,
        wa_lastMsgText: extractMessageBody(message),
        isGroup: extracted.isGroup,
      });

      if (!chatData) {
        console.warn(`[Webhook ${webhookId}] Failed to normalize chat payload`);
        return;
      }

      // Criar ou atualizar conversa
      console.log(`[Webhook ${webhookId}] Attempting to upsert conversation`, {
        chatId: extracted.chatId,
        chatDataKeys: Object.keys(chatData),
        hasExternalChatId: !!chatData.externalChatId,
        hasContactName: !!chatData.contactName,
      });

      const conversation = await upsertConversation(instance, chatData);

      if (!conversation) {
        console.error(`[Webhook ${webhookId}] Failed to upsert conversation`, {
          chatId: extracted.chatId,
          chatData: {
            externalChatId: chatData.externalChatId,
            contactName: chatData.contactName,
            phoneNumber: chatData.phoneNumber,
          },
        });
        return;
      }

      console.log(`[Webhook ${webhookId}] Conversation upserted successfully`, {
        conversationId: conversation.id,
        externalChatId: conversation.external_chat_id,
        contactName: conversation.contact_name,
      });

      // Emitir evento WebSocket para atualizar conversa em tempo real
      // OTIMIZAÇÃO: Usar dados já em memória (sem query adicional)
      try {
        const conversationWithInstance = {
          ...conversation,
          instance_name: instance.name,
        };
        emitConversationUpdate(instance.user_id, conversationWithInstance);
      } catch (wsError: any) {
        console.warn(`[Webhook ${webhookId}] Failed to emit conversation update:`, wsError.message);
      }

      // Extrair informações da mensagem
      const messageBody = extractMessageBody(message);
      const media = extractMediaInfo(message);
      const sentAt = parseTimestamp(message.timestamp || message.messageTimestamp);
      const messageId =
        message.id ||
        message.messageId ||
        message.key?.id ||
        data.external_message_id ||
        null;

      if (!messageId) {
        console.warn(`[Webhook ${webhookId}] No messageId found`, {
          messageKeys: Object.keys(message),
        });
        // Continuar mesmo sem messageId, mas gerar um
      }

      // Salvar mensagem
      console.log(`[Webhook ${webhookId}] Attempting to save message`, {
        conversationId: conversation.id,
        messageId,
        direction: extracted.direction,
        bodyPreview: messageBody?.substring(0, 50),
        hasMedia: media.length > 0,
      });

      await saveMessage(conversation.id, extracted.direction, {
        externalMessageId: messageId,
        body: messageBody || null,
        media: media.length > 0 ? media : null,
        status: message.status || (extracted.direction === 'outgoing' ? 'sent' : null),
        sentAt: sentAt || new Date(),
        metadata: {
          ...message,
          messageType: extracted.messageType,
          isGroup: extracted.isGroup,
          originalPayload: payload,
        },
      });

      console.log(`[Webhook ${webhookId}] Message saved successfully`, {
        conversationId: conversation.id,
        messageId,
      });

      // Emitir evento WebSocket para atualizar conversa e mensagem em tempo real
      // OTIMIZAÇÃO: Usar dados já em memória (conversation) ao invés de query adicional
      // Isso reduz carga no banco e melhora performance em produção
      try {
        // Usar conversation já carregada (mais leve e rápido)
        // Adicionar apenas instance_name se necessário
        const conversationWithInstance = {
          ...conversation,
          instance_name: instance.name,
        };
        
        console.log(`[Webhook ${webhookId}] Emitting conversation update via WebSocket`, {
          userId: instance.user_id,
          conversationId: conversation.id,
        });
        emitConversationUpdate(instance.user_id, conversationWithInstance);
        
        console.log(`[Webhook ${webhookId}] Emitting new message via WebSocket`, {
          userId: instance.user_id,
          conversationId: conversation.id,
          messageId,
        });
        // Enviar apenas dados essenciais (leve para produção)
        emitNewMessage(instance.user_id, {
          id: messageId,
          conversation_id: conversation.id,
          direction: extracted.direction,
          body: messageBody,
          sent_at: sentAt || new Date(),
        }, conversation.id);
      } catch (wsError: any) {
        console.error(`[Webhook ${webhookId}] Failed to emit WebSocket events:`, {
          error: wsError.message,
          stack: wsError.stack,
        });
      }

      // Criar notificação para mensagens recebidas (incoming)
      if (extracted.direction === 'incoming') {
        try {
          await notificationService.notifyNewMessage(instance.user_id, {
            conversationId: conversation.id,
            conversationName: conversation.contact_name || conversation.profile_name || conversation.phone_number,
            messagePreview: messageBody,
            messageId: messageId || undefined,
            isGroup: extracted.isGroup,
          });
        } catch (notifError: any) {
          // Não falhar o processamento se notificação falhar
          console.warn(`[Webhook ${webhookId}] Failed to create notification:`, {
            error: notifError.message,
          });
        }
      }

      console.log(`[Webhook ${webhookId}] Message saved successfully`, {
        conversationId: conversation.id,
        messageId: messageId,
        direction: extracted.direction,
        messageType: extracted.messageType,
        isGroup: extracted.isGroup,
        hasMedia: media.length > 0,
        bodyLength: messageBody?.length || 0,
        processingTime: Date.now() - startTime,
      });
    } else if (event === 'messages_update') {
      // Atualizar status de mensagens existentes
      const data = payload.data || payload;
      const messageUpdate = data.message || data;

      const messageId =
        messageUpdate.id ||
        messageUpdate.messageId ||
        messageUpdate.key?.id ||
        data.external_message_id ||
        null;

      if (!messageId) {
        console.warn(`[Webhook ${webhookId}] No messageId in messages_update event`);
        return;
      }

      const status = messageUpdate.status || messageUpdate.messageStatus;
      const readAt = messageUpdate.readTimestamp
        ? parseTimestamp(messageUpdate.readTimestamp)
        : null;
      const deliveredAt = messageUpdate.deliveredTimestamp
        ? parseTimestamp(messageUpdate.deliveredTimestamp)
        : null;

      // Atualizar mensagem
      const updateResult = await pool.query(
        `
        UPDATE chat_messages
        SET 
          status = COALESCE($1, status),
          metadata = metadata || $2::jsonb,
          updated_at = now()
        WHERE external_message_id = $3
        RETURNING conversation_id, direction
        `,
        [
          status,
          JSON.stringify({
            ...messageUpdate,
            readAt: readAt?.toISOString(),
            deliveredAt: deliveredAt?.toISOString(),
            updatedAt: new Date().toISOString(),
          }),
          messageId,
        ]
      );

      if (updateResult.rowCount === 0) {
        console.warn(`[Webhook ${webhookId}] Message not found for update`, {
          messageId,
        });
        return;
      }

      const updatedMessage = updateResult.rows[0];

      // Se mensagem foi lida e é incoming, atualizar contador de não lidas
      if (status === 'read' && updatedMessage.direction === 'incoming' && readAt) {
        await pool.query(
          `
          UPDATE chat_conversations
          SET 
            unread_count = GREATEST(0, unread_count - 1),
            updated_at = now()
          WHERE id = $1 AND unread_count > 0
          `,
          [updatedMessage.conversation_id]
        );
      }

      // NOTA: Notificações de mensagem entregue/lida removidas
      // O cliente já visualiza o status na conversa, não precisa de notificação separada

      console.log(`[Webhook ${webhookId}] Message status updated`, {
        messageId,
        status,
        conversationId: updatedMessage.conversation_id,
        readAt: readAt?.toISOString(),
        deliveredAt: deliveredAt?.toISOString(),
        processingTime: Date.now() - startTime,
      });
    } else if (event === 'chats' || payload.chat) {
      // Atualizar informações da conversa (sem criar mensagem)
      const data = payload.data || payload.chat || payload;
      const chatData = normalizeChatPayload(data);

      if (!chatData) {
        console.warn(`[Webhook ${webhookId}] Failed to normalize chat data in chats event`);
        return;
      }

      const conversation = await upsertConversation(instance, chatData);

      if (conversation) {
        // Verificar se é uma nova conversa (sem mensagens ainda)
        const messageCount = await pool.query(
          'SELECT COUNT(*) as count FROM chat_messages WHERE conversation_id = $1',
          [conversation.id]
        );
        const isNewConversation = parseInt(messageCount.rows[0].count, 10) === 0;

        // Criar notificação para nova conversa
        if (isNewConversation) {
          try {
            await notificationService.notifyNewConversation(instance.user_id, {
              conversationId: conversation.id,
              conversationName: chatData.contactName || chatData.profileName,
              phoneNumber: chatData.phoneNumber,
              isGroup: chatData.externalChatId?.endsWith('@g.us') || false,
            });
          } catch (notifError: any) {
            console.warn(`[Webhook ${webhookId}] Failed to create new conversation notification:`, {
              error: notifError.message,
            });
          }
        }

        console.log(`[Webhook ${webhookId}] Chat updated`, {
          conversationId: conversation.id,
          externalChatId: chatData.externalChatId,
          contactName: chatData.contactName,
          unreadCount: chatData.unreadCount,
          isNewConversation,
          processingTime: Date.now() - startTime,
        });
      } else {
        console.warn(`[Webhook ${webhookId}] Failed to upsert conversation in chats event`);
      }
    } else if (event === 'connection') {
      const data = payload.data || payload;
      const state = data.state || data.status;

      // Buscar estado anterior para detectar mudanças
      const previousState = instance.metadata?.connection?.state || instance.status;

      // Atualizar status da conexão na instância
      await pool.query(
        `
        UPDATE chat_instances
        SET 
          status = CASE 
            WHEN $1 = 'open' OR $1 = 'connected' THEN 'connected'
            WHEN $1 = 'close' OR $1 = 'disconnected' THEN 'disconnected'
            ELSE status
          END,
          metadata = metadata || $2::jsonb, 
          updated_at = now()
        WHERE id = $3
        `,
        [
          state,
          JSON.stringify({
            connection: {
              state,
              lastUpdate: new Date().toISOString(),
            },
          }),
          instance.id,
        ]
      );

      // Se conectou pela primeira vez, configurar webhook automaticamente
      if ((state === 'open' || state === 'connected') && 
          (previousState !== 'open' && previousState !== 'connected')) {
        try {
          // Buscar instância atualizada
          const updatedInstance = await pool.query<ChatInstanceRow>(
            'SELECT * FROM chat_instances WHERE id = $1',
            [instance.id]
          );
          if (updatedInstance.rows[0]) {
            console.log(`[Webhook ${webhookId}] Instance connected, auto-configuring webhook...`);
            await autoConfigureWebhook(updatedInstance.rows[0]);
          }
        } catch (webhookError: any) {
          console.warn(`[Webhook ${webhookId}] Failed to auto-configure webhook:`, {
            error: webhookError.message,
          });
        }
      }

      // Criar notificações para mudanças de conexão
      try {
        if (previousState !== state) {
          if (state === 'open' || state === 'connected') {
            if (previousState === 'close' || previousState === 'disconnected') {
              // Conexão restaurada
              await notificationService.notifyConnectionRestored(instance.user_id, {
                instanceId: instance.id,
                instanceName: instance.name,
              });
            } else {
              // Primeira conexão
              await notificationService.notifyInstanceConnected(instance.user_id, {
                instanceId: instance.id,
                instanceName: instance.name,
              });
            }
          } else if (state === 'close' || state === 'disconnected') {
            // Conexão perdida
            await notificationService.notifyConnectionLost(instance.user_id, {
              instanceId: instance.id,
              instanceName: instance.name,
            });
          }
        }
      } catch (notifError: any) {
        console.warn(`[Webhook ${webhookId}] Failed to create connection notification:`, {
          error: notifError.message,
        });
      }

      console.log(`[Webhook ${webhookId}] Connection status updated`, {
        instanceId: instance.id,
        previousState,
        newState: state,
        processingTime: Date.now() - startTime,
      });
    } else if (event === 'leads') {
      const data = payload.data || payload;
      console.log(`[Webhook ${webhookId}] Lead event received`, {
        leadData: data,
        processingTime: Date.now() - startTime,
      });
      // TODO: Implementar processamento de leads quando necessário
    } else {
      console.log(`[Webhook ${webhookId}] Unhandled event type`, {
        event,
        payload: JSON.stringify(payload).substring(0, 200),
      });
    }
  } catch (error: any) {
    console.error(`[Webhook ${webhookId}] Error processing event:`, {
      error: error.message,
      stack: error.stack,
      event,
      instance: instance.external_instance_name,
      processingTime: Date.now() - startTime,
    });
    // Não relançar erro para não quebrar o fluxo
  }
}

/**
 * Handler principal para webhooks da UazAPI
 * Responde rapidamente e processa eventos de forma assíncrona
 */
export async function handleWebhook(req: Request, res: Response) {
  const startTime = Date.now();
  const webhookId = randomUUID();

  // Log inicial de TODAS as requisições recebidas
  console.log(`[Webhook ${webhookId}] ===== WEBHOOK RECEIVED =====`, {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    contentType: req.get('content-type'),
    headers: {
      'x-uazapi-instance': req.headers['x-uazapi-instance'],
      'x-uazapi-secret': req.headers['x-uazapi-secret'] ? '***' : undefined,
    },
    query: req.query,
    bodyKeys: req.body ? Object.keys(req.body) : [],
    timestamp: new Date().toISOString(),
  });

  try {
    // 1. Validar secret (se configurado e enviado)
    // A UazAPI pode não enviar o secret mesmo se configurado
    // Por isso, só validamos se o secret for enviado
    const secret = process.env.UAZAPI_WEBHOOK_SECRET;
    const receivedSecret = 
      req.headers['x-uazapi-secret'] || 
      req.body?.secret || 
      req.body?.data?.secret ||
      req.query?.secret;
    
    if (secret && receivedSecret) {
      // Só validar se ambos secret e receivedSecret existem
      if (receivedSecret !== secret) {
        console.warn(`[Webhook ${webhookId}] Invalid secret`, {
          ip: req.ip,
          userAgent: req.get('user-agent'),
          hasSecret: !!secret,
          receivedSecretHeader: !!req.headers['x-uazapi-secret'],
          receivedSecretBody: !!req.body?.secret,
          receivedSecretQuery: !!req.query?.secret,
        });
        res.status(401).json({ error: 'Invalid webhook secret' });
        return;
      }
      
      console.log(`[Webhook ${webhookId}] Secret validated successfully`);
    } else if (secret && !receivedSecret) {
      // Secret configurado mas não enviado - permitir (UazAPI pode não enviar)
      console.log(`[Webhook ${webhookId}] Secret configured but not received, allowing webhook`, {
        hasSecret: !!secret,
        receivedSecretHeader: !!req.headers['x-uazapi-secret'],
        receivedSecretBody: !!req.body?.secret,
      });
    } else {
      console.log(`[Webhook ${webhookId}] No secret configured, skipping validation`);
    }

    // 2. Validar e extrair payload
    const payload = req.body || {};
    if (!payload || Object.keys(payload).length === 0) {
      console.warn(`[Webhook ${webhookId}] Empty payload`, {
        ip: req.ip,
        bodyType: typeof req.body,
      });
      res.status(400).json({ error: 'Empty payload' });
      return;
    }

    // 3. Identificar instância - tentar múltiplas formas
    const instanceName =
      payload.instance ||
      payload.instanceName ||
      payload.data?.instance ||
      payload.data?.instanceName ||
      req.query.instance ||
      req.headers['x-uazapi-instance'];

    console.log(`[Webhook ${webhookId}] Instance identification attempt:`, {
      fromPayloadInstance: payload.instance,
      fromPayloadInstanceName: payload.instanceName,
      fromPayloadDataInstance: payload.data?.instance,
      fromPayloadDataInstanceName: payload.data?.instanceName,
      fromQuery: req.query.instance,
      fromHeader: req.headers['x-uazapi-instance'],
      resolvedInstanceName: instanceName,
    });

    if (!instanceName || typeof instanceName !== 'string') {
      console.warn(`[Webhook ${webhookId}] Missing instance identifier`, {
        payload: JSON.stringify(payload).substring(0, 500),
        allPayloadKeys: Object.keys(payload),
      });
      res.status(400).json({ error: 'Missing instance identifier' });
      return;
    }

    // 4. Buscar instância no banco - tentar por external_instance_name e também por name
    let instanceResult = await pool.query<ChatInstanceRow>(
      'SELECT * FROM chat_instances WHERE external_instance_name = $1 LIMIT 1',
      [instanceName]
    );

    // Se não encontrou por external_instance_name, tentar por name
    if (instanceResult.rowCount === 0) {
      console.log(`[Webhook ${webhookId}] Instance not found by external_instance_name, trying by name...`, {
        instanceName,
      });
      instanceResult = await pool.query<ChatInstanceRow>(
        'SELECT * FROM chat_instances WHERE name = $1 LIMIT 1',
        [instanceName]
      );
    }

    // Listar todas as instâncias para debug se ainda não encontrou
    if (instanceResult.rowCount === 0) {
      const allInstances = await pool.query<ChatInstanceRow>(
        'SELECT id, name, external_instance_name FROM chat_instances LIMIT 10'
      );
      console.warn(`[Webhook ${webhookId}] Instance not found`, {
        instanceName,
        searchedBy: ['external_instance_name', 'name'],
        availableInstances: allInstances.rows.map(i => ({
          name: i.name,
          external_instance_name: i.external_instance_name,
        })),
        ip: req.ip,
      });
      res.status(404).json({ error: 'Instance not registered' });
      return;
    }

    const instance = instanceResult.rows[0];

    // 5. Identificar tipo de evento
    const event = payload.event || req.query.event || payload.type || 'unknown';

    // 6. Log do recebimento com mais detalhes
    console.log(`[Webhook ${webhookId}] Webhook received and instance found`, {
      instanceName,
      instanceId: instance.id,
      instanceExternalName: instance.external_instance_name,
      event,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      payloadSize: JSON.stringify(payload).length,
      payloadPreview: JSON.stringify(payload).substring(0, 300),
      receiveTime: Date.now() - startTime,
    });

    // 7. Responder rapidamente (antes de processar)
    res.status(200).json({
      received: true,
      webhookId,
      event,
      instance: instanceName,
    });

    // 8. Processar evento de forma assíncrona (não bloqueia a resposta)
    processWebhookEvent(instance, payload, event).catch((error) => {
      console.error(`[Webhook ${webhookId}] Async processing error:`, {
        error: error.message,
        stack: error.stack,
        event,
        instance: instanceName,
      });
    });
  } catch (error: any) {
    console.error(`[Webhook ${webhookId}] Error handling webhook:`, {
      error: error.message,
      stack: error.stack,
      ip: req.ip,
      processingTime: Date.now() - startTime,
    });

    // Se ainda não respondeu, responder com erro
    if (!res.headersSent) {
      res.status(500).json({
        error: error.message || 'Failed to process webhook',
        webhookId,
      });
    }
  }
}

