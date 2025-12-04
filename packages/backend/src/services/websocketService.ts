import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { verifyToken } from '../utils/jwt.js';
import { pool } from '../utils/db.js';
import type { Notification } from './notifications.js';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

let io: SocketIOServer | null = null;

/**
 * Inicializa o servidor WebSocket
 */
export function initializeWebSocket(httpServer: HttpServer): SocketIOServer {
  // Configurar CORS para Socket.IO - aceitar todas as origens em produção (Nginx já faz o controle)
  const corsOrigins = process.env.FRONTEND_URL 
    ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
    : true; // Aceitar todas em produção (Nginx controla)

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: corsOrigins,
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
      console.log('[WebSocket] Connection attempt', {
        id: socket.id,
        transport: socket.conn.transport.name,
        handshake: {
          auth: socket.handshake.auth ? 'present' : 'missing',
          headers: Object.keys(socket.handshake.headers),
          query: socket.handshake.query,
        },
      });

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
      console.log('[WebSocket] Token verified', {
        socketId: socket.id,
        userId: payload.userId,
      });

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
      console.log('[WebSocket] Authentication successful', {
        socketId: socket.id,
        userId: payload.userId,
      });
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
    console.log('[WebSocket] Engine connection:', {
      id: socket.id,
      transport: socket.transport?.name,
      readyState: socket.readyState,
    });
    
    socket.on('error', (err) => {
      console.error('[WebSocket] Socket transport error:', {
        socketId: socket.id,
        error: err.message,
        stack: err.stack,
      });
    });
  });

  // Gerenciar conexões
  io.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.userId;

    if (!userId) {
      console.warn('[WebSocket] Connection without userId, disconnecting', {
        socketId: socket.id,
      });
      socket.disconnect();
      return;
    }

    console.log(`[WebSocket] User connected: ${userId} (socket: ${socket.id}, transport: ${socket.conn.transport.name})`);

    // Juntar usuário a uma sala específica para receber suas notificações
    socket.join(`user:${userId}`);
    console.log(`[WebSocket] User ${userId} joined room user:${userId}`);

    // Enviar confirmação de conexão
    socket.emit('connected', {
      message: 'Connected to notification server',
      userId,
      timestamp: new Date().toISOString(),
    });
    console.log(`[WebSocket] Sent connected event to user ${userId}`);

    // Evento para ping/pong (manter conexão viva)
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date().toISOString() });
    });

    // Desconexão
    socket.on('disconnect', (reason) => {
      console.log(`[WebSocket] User disconnected: ${userId} (reason: ${reason})`);
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

  console.log(`[WebSocket] Emitting notification to user ${userId}:`, {
    notificationId: notification.id,
    type: notification.type,
  });

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
export function emitConversationUpdate(userId: string, conversation: any): void {
  if (!io) {
    console.warn('[WebSocket] Cannot emit conversation update: WebSocket server not initialized');
    return;
  }

  console.log(`[WebSocket] Emitting conversation update to user ${userId}:`, {
    conversationId: conversation.id,
    externalChatId: conversation.external_chat_id,
  });

  io.to(`user:${userId}`).emit('conversation_updated', conversation);
}

/**
 * Emite nova mensagem para um usuário específico
 */
export function emitNewMessage(userId: string, message: any, conversationId: string): void {
  if (!io) {
    console.warn('[WebSocket] Cannot emit new message: WebSocket server not initialized');
    return;
  }

  console.log(`[WebSocket] Emitting new message to user ${userId}:`, {
    messageId: message.id,
    conversationId,
  });

  io.to(`user:${userId}`).emit('new_message', {
    message,
    conversationId,
  });
}

/**
 * Obtém o servidor WebSocket (para uso externo se necessário)
 */
export function getIO(): SocketIOServer | null {
  return io;
}

