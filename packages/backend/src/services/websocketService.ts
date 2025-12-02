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
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    // Otimizações para produção
    pingTimeout: 60000, // 60 segundos
    pingInterval: 25000, // 25 segundos
    maxHttpBufferSize: 1e6, // 1MB
    allowEIO3: true, // Compatibilidade com versões antigas
    // Timeout de conexão
    connectTimeout: 45000, // 45 segundos
  });

  // Middleware de autenticação otimizado (sem query desnecessária)
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const payload = verifyToken(token);
      
      // Não fazer query no banco - confiar no JWT (mais leve para produção)
      // O JWT já valida o userId, não precisa verificar no banco a cada conexão
      socket.userId = payload.userId;
      next();
    } catch (error: any) {
      console.warn('[WebSocket] Authentication failed:', error.message);
      next(new Error('Invalid or expired token'));
    }
  });

  // Gerenciar conexões
  io.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.userId;

    if (!userId) {
      socket.disconnect();
      return;
    }

    console.log(`[WebSocket] User connected: ${userId} (socket: ${socket.id})`);

    // Juntar usuário a uma sala específica para receber suas notificações
    socket.join(`user:${userId}`);

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
      console.log(`[WebSocket] User disconnected: ${userId} (reason: ${reason})`);
    });

    // Erro
    socket.on('error', (error) => {
      console.error(`[WebSocket] Error for user ${userId}:`, error);
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

