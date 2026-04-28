import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { verifyToken } from '../utils/jwt.js';
import { pool } from '../utils/db.js';
import { isUazIntegrationVerboseLogs } from '../utils/chatObservability.js';
import { conversationRowForClientApi } from '../utils/uazapiIdentityResolve.js';
import type { Notification } from './notifications.js';
import { getAllowedCorsOrigins } from '../config/corsOrigins.js';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

let io: SocketIOServer | null = null;

const wsVerbose = () => isUazIntegrationVerboseLogs();

/**
 * Inicializa o servidor WebSocket
 */
export function initializeWebSocket(httpServer: HttpServer): SocketIOServer {
  // Mesma lista que Express (inclui localhost:8081 etc.) — FRONTEND_URL só prod não bloqueia dev
  const corsOrigins = getAllowedCorsOrigins();

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: corsOrigins.length > 0 ? corsOrigins : true,
      methods: ['GET', 'POST', 'OPTIONS'],
      credentials: true,
      allowedHeaders: ['Authorization', 'Content-Type'],
    },
    transports: ['polling', 'websocket'], // Polling primeiro (mais confiável através de proxy)
    path: '/socket.io/',
    // Permitir upgrade de polling para websocket
    allowUpgrades: true,
    // Timeout mais longo para conexões através de proxy
    pingTimeout: 60000,
    pingInterval: 25000,
    // Configurações adicionais para melhor compatibilidade
    connectTimeout: 45000,
    // Permitir polling longo para evitar timeouts
    maxHttpBufferSize: 1e8,
  });

  // Middleware de autenticação
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      if (wsVerbose()) {
        console.log('[WebSocket] Connection attempt', {
          id: socket.id,
          transport: socket.conn.transport.name,
          handshake: {
            auth: socket.handshake.auth ? 'present' : 'missing',
            headerKeys: Object.keys(socket.handshake.headers),
            queryKeys: Object.keys(socket.handshake.query || {}),
          },
        });
      }

      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers.authorization?.split(' ')[1] ||
        (typeof socket.handshake.query?.token === 'string'
          ? socket.handshake.query?.token
          : Array.isArray(socket.handshake.query?.token)
          ? socket.handshake.query?.token[0]
          : undefined);

      if (!token) {
        console.warn('[WebSocket] No token provided', {
          socketId: socket.id,
          authKeys: Object.keys(socket.handshake.auth || {}),
          authHeaders: socket.handshake.headers.authorization ? 'present' : 'missing',
        });
        return next(new Error('Authentication token required'));
      }

      const payload = verifyToken(token);
      if (wsVerbose()) {
        console.log('[WebSocket] Token verified', {
          socketId: socket.id,
          userId: payload.userId,
        });
      }

      // Verificar se usuário existe
      const result = await pool.query('SELECT id FROM users WHERE id = $1', [payload.userId]);

      if (result.rowCount === 0) {
        console.warn('[WebSocket] User not found', {
          socketId: socket.id,
          userId: payload.userId,
        });
        return next(new Error('User not found'));
      }

      socket.userId = payload.userId;
      if (wsVerbose()) {
        console.log('[WebSocket] Authentication successful', {
          socketId: socket.id,
          userId: payload.userId,
        });
      }
      next();
    } catch (error: any) {
      console.error('[WebSocket] Authentication error', {
        socketId: socket.id,
        error: error.message,
        stack: error.stack,
      });
      next(new Error('Invalid or expired token'));
    }
  });

  // Log de todas as requisições de polling
  io.engine.on('connection', (socket) => {
    if (wsVerbose()) {
      console.log('[WebSocket] Engine connection:', {
        id: socket.id,
        transport: socket.transport?.name,
        readyState: socket.readyState,
      });
    }

    socket.on('error', (err: any) => {
      console.error('[WebSocket] Socket transport error:', {
        socketId: socket.id,
        error: err.message,
        stack: err.stack,
      });
    });
  });

  // Gerenciar conexões
  io.on('connection', async (socket: AuthenticatedSocket) => {
    const userId = socket.userId;

    if (!userId) {
      console.warn('[WebSocket] Connection without userId, disconnecting', {
        socketId: socket.id,
      });
      socket.disconnect();
      return;
    }

    if (wsVerbose()) {
      console.log(
        `[WebSocket] User connected: ${userId} (socket: ${socket.id}, transport: ${socket.conn.transport.name})`
      );
    }
    console.log('[realtime_socket_connected]', {
      socketId: socket.id,
      userId,
      transport: socket.conn.transport.name,
    });

    // Juntar usuário a uma sala específica para receber suas notificações
    socket.join(`user:${userId}`);

    // Etapa 5 — sala por tenant para eventos de atendimento (inbox partilhado)
    try {
      const tq = await pool.query<{ tenant_id: string | null }>(
        `SELECT tenant_id FROM users WHERE id = $1 LIMIT 1`,
        [userId]
      );
      const tid = tq.rows[0]?.tenant_id;
      if (tid) {
        socket.join(`tenant:${tid}`);
      }
    } catch (e) {
      console.warn('[WebSocket] Falha ao resolver tenant_id para sala de atendimento', {
        userId,
        message: (e as Error)?.message,
      });
    }

    // Enviar confirmação de conexão
    socket.emit('connected', {
      message: 'Connected to notification server',
      userId,
      timestamp: new Date().toISOString(),
    });

    // Evento para ping/pong (manter conexão viva)
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date().toISOString() });
    });

    // Desconexão
    socket.on('disconnect', (reason) => {
      if (wsVerbose()) {
        console.log(`[WebSocket] User disconnected: ${userId} (reason: ${reason})`);
      }
      console.log('[realtime_socket_disconnected]', {
        socketId: socket.id,
        userId,
        reason,
      });
    });

    // Erro
    socket.on('error', (error) => {
      console.error(`[WebSocket] Error for user ${userId}:`, error);
    });
  });

  // Log de tentativas de conexão que falharam
  io.engine.on('connection_error', (err) => {
    console.error('[WebSocket] Connection error:', {
      message: err.message,
      description: err.description,
      context: err.context,
      req: err.req ? {
        method: err.req.method,
        url: err.req.url,
        headers: Object.keys(err.req.headers || {}),
      } : undefined,
    });
  });
  
  // Log de erros de transporte
  io.engine.on('error', (err) => {
    console.error('[WebSocket] Engine error:', {
      message: err.message,
      stack: err.stack,
    });
  });

  console.log('[WebSocket] Server initialized');
  return io;
}

/**
 * Emite uma notificação para um usuário específico
 */
export function emitNotification(userId: string, notification: Notification): void {
  if (!io) {
    console.warn('[WebSocket] Cannot emit notification: WebSocket server not initialized');
    return;
  }

  if (wsVerbose()) {
    console.log(`[WebSocket] Emitting notification to user ${userId}:`, {
      notificationId: notification.id,
      type: notification.type,
    });
  }

  io.to(`user:${userId}`).emit('notification', notification);
}

/**
 * Emite atualização de contador de não lidas
 */
export function emitUnreadCount(userId: string, count: number): void {
  if (!io) {
    console.warn('[WebSocket] Cannot emit unread count: WebSocket server not initialized');
    return;
  }

  io.to(`user:${userId}`).emit('unread_count', { count });
}

/**
 * Emite evento genérico para um usuário
 */
export function emitToUser(userId: string, event: string, data: any): void {
  if (!io) {
    console.warn('[WebSocket] Cannot emit to user: WebSocket server not initialized');
    return;
  }

  io.to(`user:${userId}`).emit(event, data);
}

/**
 * Emite evento para todos os usuários conectados
 */
export function emitToAll(event: string, data: any): void {
  if (!io) {
    console.warn('[WebSocket] Cannot emit to all: WebSocket server not initialized');
    return;
  }

  io.emit(event, data);
}

/**
 * Emite atualização de conversa para um usuário específico
 */
/**
 * Atualização mínima da conversa para todos os sockets do tenant (ex.: Kanban após automação).
 * O cliente usa `id` para refetch do quadro.
 */
export function emitConversationUpdatedToTenant(tenantId: string, payload: { id: string }): void {
  if (!io) {
    return;
  }
  io.to(`tenant:${tenantId}`).emit('conversation_updated', payload);
}

export function emitConversationUpdate(userId: string, conversation: any): void {
  if (!io) {
    console.warn('[WebSocket] Cannot emit conversation update: WebSocket server not initialized');
    return;
  }

  console.log(`[WebSocket] Emitting conversation update to user ${userId}:`, {
    conversationId: conversation.id,
    externalChatId: conversation.external_chat_id,
    lastMessageAt: conversation.last_message_at,
    updatedAt: conversation.updated_at,
    previewLen:
      typeof conversation.last_message_preview === 'string'
        ? conversation.last_message_preview.length
        : 0,
  });

  if (wsVerbose()) {
    const prev =
      typeof conversation.last_message_preview === 'string'
        ? conversation.last_message_preview.slice(0, 80)
        : undefined;
    console.log(`[WebSocket] conversation update (verbose preview):`, prev);
  }

  const payload =
    conversation && typeof conversation === 'object'
      ? conversationRowForClientApi(conversation as Record<string, unknown>)
      : conversation;
  io.to(`user:${userId}`).emit('conversation_updated', payload);
}

/**
 * Emite nova mensagem para um usuário específico
 */
export function emitNewMessage(userId: string, message: any, conversationId: string): void {
  if (!io) {
    console.warn('[WebSocket] Cannot emit new message: WebSocket server not initialized');
    return;
  }

  if (wsVerbose()) {
    console.log(`[WebSocket] Emitting new message to user ${userId}:`, {
      messageId: message.id,
      conversationId,
    });
  }

  io.to(`user:${userId}`).emit('new_message', {
    message,
    conversationId,
  });
}

/**
 * Emite atualização de mensagem (status/metadata) para um usuário específico.
 * Payload padronizado com `new_message` para reuso no frontend.
 */
export function emitMessageUpdated(userId: string, message: any, conversationId: string): void {
  if (!io) {
    console.warn('[WebSocket] Cannot emit message update: WebSocket server not initialized');
    return;
  }

  if (wsVerbose()) {
    console.log(`[WebSocket] Emitting message update to user ${userId}:`, {
      messageId: message?.id,
      conversationId,
      status: message?.status,
      externalMessageId: message?.external_message_id,
    });
  }

  io.to(`user:${userId}`).emit('message_updated', {
    message,
    conversationId,
  });
}

/**
 * Etapa 5 — evento único de atendimento (merge no cliente com a conversa existente).
 * Com tenant: emite para `tenant:{id}`; sem tenant (conta isolada): só para o dono da instância.
 */
export function emitConversationAttendanceUpdated(
  tenantId: string | null,
  ownerUserId: string,
  conversationPartial: Record<string, unknown>
): void {
  if (!io) {
    return;
  }
  const payload = {
    v: 1 as const,
    type: 'conversation_attendance_updated' as const,
    conversation: conversationPartial,
    ts: new Date().toISOString(),
  };
  if (tenantId) {
    io.to(`tenant:${tenantId}`).emit('conversation_attendance_updated', payload);
  } else {
    io.to(`user:${ownerUserId}`).emit('conversation_attendance_updated', payload);
  }
}

/** Fase 5 — eventos adicionais (payload merge-friendly no cliente). */
export function emitChatProfessionalPayload(
  tenantId: string | null,
  ownerUserId: string,
  eventName:
    | 'assignment.changed'
    | 'conversation.transferred'
    | 'conversation.status_changed',
  data: Record<string, unknown>
): void {
  if (!io) return;
  const payload = {
    v: 1 as const,
    type: eventName,
    data,
    ts: new Date().toISOString(),
  };
  if (tenantId) {
    io.to(`tenant:${tenantId}`).emit(eventName, payload);
  } else {
    io.to(`user:${ownerUserId}`).emit(eventName, payload);
  }
}

/**
 * Obtém o servidor WebSocket (para uso externo se necessário)
 */
export function getIO(): SocketIOServer | null {
  return io;
}

