import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { uazapiService } from '../services/uazapi.js';
import { randomUUID } from 'crypto';
import {
  emitMessage,
  emitMessageUpdate,
  emitConversationUpdate,
  emitConnectionStatus,
  emitPresenceUpdate,
} from '../services/socketService.js';

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
  excludeMessages: z.boolean().optional(),
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
  if (!chatData) return null;

  const result = await pool.query(
    `
    INSERT INTO chat_conversations (
      user_id, instance_id, external_chat_id, external_fast_id,
      contact_name, profile_name, phone_number, status,
      last_message_preview, last_message_at, unread_count, metadata
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'open'), $9, $10, COALESCE($11, 0), $12::jsonb)
    ON CONFLICT (instance_id, external_chat_id)
    DO UPDATE SET
      external_fast_id = EXCLUDED.external_fast_id,
      contact_name = COALESCE(EXCLUDED.contact_name, chat_conversations.contact_name),
      profile_name = COALESCE(EXCLUDED.profile_name, chat_conversations.profile_name),
      phone_number = COALESCE(EXCLUDED.phone_number, chat_conversations.phone_number),
      status = COALESCE(EXCLUDED.status, chat_conversations.status),
      last_message_preview = COALESCE(EXCLUDED.last_message_preview, chat_conversations.last_message_preview),
      last_message_at = COALESCE(EXCLUDED.last_message_at, chat_conversations.last_message_at),
      unread_count = COALESCE(EXCLUDED.unread_count, chat_conversations.unread_count),
      metadata = EXCLUDED.metadata,
      updated_at = now()
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
    ]
  );

  return result.rows[0];
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
  await pool.query(
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

  const unreadShouldReset = payload.resetUnread === true;
  const skipUnread = payload.skipUnreadUpdate === true;
  const effectiveSentAt = payload.sentAt || new Date();

  await pool.query(
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
    ensureAdminToken();
    const userId = req.userId!;
    const data = instanceSchema.parse(req.body);

    const remoteInstance = (await uazapiService.createInstance(
      data.name,
      data.metadata
    )) as AnyObject;
    
    console.log('UazAPI createInstance response:', JSON.stringify(remoteInstance, null, 2));
    
    const instanceInfo = remoteInstance?.instance || remoteInstance;
    const instanceToken = instanceInfo?.token || remoteInstance?.token;
    const instanceName = instanceInfo?.name || instanceInfo?.instanceName || data.name;
    const instanceStatus = instanceInfo?.status || 'disconnected';
    
    if (!instanceToken) {
      throw new Error('Token da instância não foi retornado pela UazAPI');
    }

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

    const newInstance = inserted.rows[0];

    // Configurar webhook automaticamente
    try {
      const webhookUrl = process.env.UAZAPI_WEBHOOK_URL || 
        `${process.env.FRONTEND_URL || process.env.BACKEND_URL || 'http://localhost:3001'}/webhooks/uazapi`;
      
      await uazapiService.configureWebhook(instanceToken, {
        url: webhookUrl,
        events: ['messages', 'messages_update', 'chats', 'connection', 'presence'],
        excludeMessages: ['wasSentByApi'],
        addUrlEvents: false,
        addUrlTypesMessages: false,
      });
      
      console.log(`[Webhook] Configurado para instância ${instanceName}: ${webhookUrl}`);
    } catch (webhookError: any) {
      console.error('[Webhook] Erro ao configurar webhook (não crítico):', webhookError.message);
      // Não falhar a criação da instância se o webhook falhar
    }

    res.status(201).json(newInstance);
  } catch (error: any) {
    console.error('Error creating instance:', error);
    res.status(500).json({ error: error.message || 'Failed to create instance' });
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

    await pool.query(
      `
      UPDATE chat_instances
      SET status = $1,
          metadata = metadata || $2::jsonb,
          updated_at = now()
      WHERE id = $3
    `,
      [response?.status || 'connecting', JSON.stringify({ lastConnect: response }), instance.id]
    );

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

export async function configureInstanceWebhook(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const payload = webhookConfigSchema.parse(req.body || {});

    const instance = await loadInstance(userId, id, res);
    if (!instance) return;

    const resolvedUrl =
      payload.url ||
      process.env.UAZAPI_WEBHOOK_URL ||
      (process.env.PUBLIC_API_URL
        ? `${process.env.PUBLIC_API_URL.replace(/\/$/, '')}/webhooks/uazapi`
        : null);

    if (!resolvedUrl) {
      res.status(400).json({ error: 'Webhook URL is not configured. Provide url or set UAZAPI_WEBHOOK_URL/PUBLIC_API_URL.' });
      return;
    }

    const body = {
      url: resolvedUrl,
      events: payload.events || ['messages', 'messages_update', 'chats', 'connection', 'leads'],
      AddUrlTypesMessages: payload.addUrlTypesMessages ?? true,
      addUrlEvents: payload.addUrlEvents ?? true,
      excludeMessages: payload.excludeMessages ?? false,
      secret: payload.secret || process.env.UAZAPI_WEBHOOK_SECRET || undefined,
    };

    const response = await uazapiService.configureWebhook(instance.instance_token, body);

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
            events: body.events,
            configuredAt: new Date().toISOString(),
          },
        }),
        instance.id,
      ]
    );

    res.json({ configured: true, url: resolvedUrl, response });
  } catch (error: any) {
    console.error('Error configuring webhook:', error);
    res.status(500).json({ error: error.message || 'Failed to configure webhook' });
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
    
    // Determinar status final
    let finalStatus = instance.status;
    if (newStatus === 'open' || newStatus === 'connected' || connected === true || loggedIn === true) {
      finalStatus = 'connected';
    } else if (newStatus === 'connecting') {
      finalStatus = 'connecting';
    } else if (newStatus) {
      finalStatus = newStatus;
    }
    
    // Atualizar no banco se mudou
    if (finalStatus !== instance.status) {
      await pool.query(
        'UPDATE chat_instances SET status = $1, updated_at = now() WHERE id = $2',
        [finalStatus, instance.id]
      );
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
    const { instanceId, search } = req.query;
    const params: any[] = [userId];
    let query = `
      SELECT c.*, i.name as instance_name
      FROM chat_conversations c
      INNER JOIN chat_instances i ON i.id = c.instance_id
      WHERE c.user_id = $1
    `;

    if (instanceId) {
      params.push(instanceId);
      query += ` AND c.instance_id = $${params.length}`;
    }

    if (search && typeof search === 'string') {
      params.push(`%${search.toLowerCase()}%`);
      query += ` AND (
        LOWER(COALESCE(c.contact_name, '')) LIKE $${params.length} OR
        LOWER(COALESCE(c.profile_name, '')) LIKE $${params.length} OR
        LOWER(COALESCE(c.phone_number, '')) LIKE $${params.length}
      )`;
    }

    query += ' ORDER BY c.last_message_at DESC NULLS LAST, c.updated_at DESC LIMIT 200';

    const conversations = await pool.query(query, params);
    res.json(conversations.rows);
  } catch (error: any) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
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
    const payload = markReadSchema.parse(req.body || {});

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
    const identifier =
      conversation.external_chat_id ||
      conversation.phone_number ||
      (conversation.metadata?.wa_chatid ?? null);

    if (!identifier) {
      res.status(400).json({ error: 'Conversation has no WhatsApp identifier' });
      return;
    }

    await uazapiService.readChat(conversation.instance_token, {
      number: identifier,
      read: payload.read,
    });

    if (payload.read) {
      await pool.query(
        `
          UPDATE chat_conversations
          SET unread_count = 0, updated_at = now()
          WHERE id = $1
        `,
        [conversation.id]
      );
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating read status:', error);
    res.status(500).json({ error: error.message || 'Failed to update read status' });
  }
}

export async function handleWebhook(req: Request, res: Response) {
  try {
    const secret = process.env.UAZAPI_WEBHOOK_SECRET;
    if (secret && req.headers['x-uazapi-secret'] !== secret) {
      res.status(401).json({ error: 'Invalid webhook secret' });
      return;
    }

    const payload = req.body || {};
    const instanceName =
      payload.instance ||
      payload.instanceName ||
      req.query.instance ||
      req.headers['x-uazapi-instance'];

    if (!instanceName || typeof instanceName !== 'string') {
      res.status(400).json({ error: 'Missing instance identifier' });
      return;
    }

    const instanceResult = await pool.query<ChatInstanceRow>(
      'SELECT * FROM chat_instances WHERE external_instance_name = $1 LIMIT 1',
      [instanceName]
    );

    if (instanceResult.rowCount === 0) {
      res.status(404).json({ error: 'Instance not registered' });
      return;
    }

    const instance = instanceResult.rows[0];
    const event = payload.event || req.query.event || payload.type;

    if (event === 'messages' || payload.message) {
      const data = payload.data || payload.message || payload;
      const message = data.message || data;

      const chatId =
        data.wa_chatid ||
        message.chatid ||
        message.chatId ||
        message.chat?.id ||
        message.key?.remoteJid ||
        message.number ||
        null;

      const conversation = await upsertConversation(
        instance,
        normalizeChatPayload({
          ...data,
          ...message,
          wa_chatid: chatId,
          wa_lastMsgTimestamp: message.timestamp || message.messageTimestamp,
          wa_lastMsgText: message.text || message.body,
        })
      );

      if (conversation) {
        const direction = message.fromMe || message.wasSentByApi ? 'outgoing' : 'incoming';
        const sentAtValue = message.timestamp || message.messageTimestamp;
        let sentAt: Date | null = null;
        if (sentAtValue) {
          const numeric = Number(sentAtValue);
          if (!Number.isNaN(numeric)) {
            sentAt = new Date(numeric > 1e12 ? numeric : numeric * 1000);
          }
        }

        await saveMessage(conversation.id, direction, {
          externalMessageId:
            message.id || message.messageId || message.key?.id || data.external_message_id,
          body: message.text || message.body || message.caption || '',
          media: message.media || [],
          status: message.status || null,
          sentAt,
          metadata: message,
        });

        // Buscar mensagem salva para emitir via Socket.IO
        const messageResult = await pool.query(
          `SELECT * FROM chat_messages 
           WHERE conversation_id = $1 
           AND external_message_id = $2 
           ORDER BY created_at DESC 
           LIMIT 1`,
          [conversation.id, message.id || message.messageId || message.key?.id || data.external_message_id]
        );

        // Emitir evento Socket.IO para nova mensagem
        if (messageResult.rowCount && messageResult.rowCount > 0) {
          const savedMessage = messageResult.rows[0];
          // Normalizar formato da mensagem para o frontend
          const normalizedMessage = {
            id: savedMessage.id,
            conversation_id: savedMessage.conversation_id,
            direction: savedMessage.direction,
            external_message_id: savedMessage.external_message_id,
            body: savedMessage.body,
            status: savedMessage.status,
            sentAt: savedMessage.sent_at || savedMessage.created_at,
            metadata: savedMessage.metadata,
            created_at: savedMessage.created_at,
          };
          emitMessage(instance.id, conversation.id, normalizedMessage, instance.user_id);
        }
      }
    } else if (event === 'chats' || payload.chat) {
      const data = payload.data || payload.chat || payload;
      const updatedConversation = await upsertConversation(instance, normalizeChatPayload(data));
      
      // Emitir evento Socket.IO para atualização de conversa
      if (updatedConversation) {
        emitConversationUpdate(instance.id, updatedConversation.id, updatedConversation, instance.user_id);
      }
    } else if (event === 'messages_update' || payload.messages_update) {
      const data = payload.data || payload.messages_update || payload;
      const message = data.message || data;
      const messageId = message.id || message.messageId || message.key?.id;
      
      if (messageId) {
        // Buscar conversa relacionada
        const chatId = message.chatid || message.chatId || message.key?.remoteJid;
        if (chatId) {
          const conversationResult = await pool.query(
            'SELECT id FROM chat_conversations WHERE external_chat_id = $1 OR phone_number = $1 LIMIT 1',
            [chatId]
          );
          
          if (conversationResult.rowCount && conversationResult.rowCount > 0) {
            const conversation = conversationResult.rows[0];
            const updates: any = {};
            
            if (message.status) updates.status = message.status;
            if (message.text || message.body) updates.body = message.text || message.body;
            if (message.timestamp || message.messageTimestamp) {
              const timestamp = message.timestamp || message.messageTimestamp;
              const numeric = Number(timestamp);
              if (!Number.isNaN(numeric)) {
                updates.sentAt = new Date(numeric > 1e12 ? numeric : numeric * 1000);
              }
            }
            
            // Atualizar mensagem no banco
            await pool.query(
              `UPDATE chat_messages 
               SET status = COALESCE($1, status),
                   body = COALESCE($2, body),
                   sent_at = COALESCE($3, sent_at),
                   updated_at = now()
               WHERE external_message_id = $4`,
              [updates.status, updates.body, updates.sentAt, messageId]
            );
            
            // Emitir evento Socket.IO
            emitMessageUpdate(instance.id, conversation.id, messageId, updates, instance.user_id);
          }
        }
      }
    } else if (event === 'connection' || payload.connection) {
      const data = payload.data || payload.connection || payload;
      const status = data.state || data.status || (data.connected ? 'connected' : 'disconnected');
      
      // Atualizar status da instância no banco
      await pool.query(
        'UPDATE chat_instances SET status = $1, updated_at = now() WHERE id = $2',
        [status, instance.id]
      );
      
      // Emitir evento Socket.IO
      emitConnectionStatus(instance.id, status as 'connected' | 'disconnected' | 'connecting', instance.user_id);
    } else if (event === 'presence' || payload.presence) {
      const data = payload.data || payload.presence || payload;
      const chatId = data.chatid || data.chatId || data.id;
      const isOnline = data.isOnline !== undefined ? data.isOnline : (data.presence === 'available' || data.presence === 'composing');
      
      if (chatId) {
        // Emitir evento Socket.IO
        emitPresenceUpdate(instance.id, chatId, isOnline, instance.user_id);
      }
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error('Error handling webhook:', error);
    res.status(500).json({ error: error.message || 'Failed to process webhook' });
  }
}

