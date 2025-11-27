import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';

let io: SocketIOServer | null = null;

interface SocketUser {
  userId: string;
  instanceIds?: string[];
}

interface MessageEvent {
  instanceId: string;
  conversationId: string;
  message: any;
}

interface ConversationUpdateEvent {
  instanceId: string;
  conversationId: string;
  conversation: any;
}

interface ConnectionStatusEvent {
  instanceId: string;
  status: 'connected' | 'disconnected' | 'connecting';
}

interface PresenceUpdateEvent {
  instanceId: string;
  chatId: string;
  isOnline: boolean;
}

export function initializeSocketIO(httpServer: HTTPServer) {
  const corsOrigins = process.env.FRONTEND_URLS 
    ? process.env.FRONTEND_URLS.split(',').map(url => url.trim())
    : process.env.FRONTEND_URL 
      ? [process.env.FRONTEND_URL]
      : ['http://localhost:5173', 'http://localhost:8080', 'http://localhost:8081'];

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: corsOrigins,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    path: '/socket.io',
    connectTimeout: 45000, // 45 segundos
    pingTimeout: 20000, // 20 segundos
    pingInterval: 25000, // 25 segundos
  });

  // Namespace para chat
  const chatNamespace = io.of('/chat');

  // Middleware de autenticação
  chatNamespace.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        return next(new Error('Authentication error: JWT_SECRET not configured'));
      }

      const decoded = jwt.verify(token, jwtSecret) as { userId: string };
      (socket as any).user = { userId: decoded.userId } as SocketUser;
      
      next();
    } catch (error: any) {
      console.error('Socket authentication error:', error.message);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  // Gerenciar conexão
  chatNamespace.on('connection', (socket) => {
    const user = (socket as any).user as SocketUser;
    const userId = user.userId;

    console.log(`[Socket.IO] User ${userId} connected (socket ${socket.id})`);

    // Entrar na room do usuário
    socket.join(`user:${userId}`);

    // Evento para subscrever a uma instância
    socket.on('subscribe:instance', (data: { instanceId: string }) => {
      if (data.instanceId) {
        socket.join(`instance:${data.instanceId}`);
        socket.join(`user:${userId}:instance:${data.instanceId}`);
        console.log(`[Socket.IO] User ${userId} subscribed to instance ${data.instanceId}`);
      }
    });

    // Evento para subscrever a uma conversa
    socket.on('subscribe:conversation', (data: { conversationId: string }) => {
      if (data.conversationId) {
        socket.join(`conversation:${data.conversationId}`);
        console.log(`[Socket.IO] User ${userId} subscribed to conversation ${data.conversationId}`);
      }
    });

    // Desconexão
    socket.on('disconnect', () => {
      console.log(`[Socket.IO] User ${userId} disconnected (socket ${socket.id})`);
    });
  });

  return io;
}

export function getSocketIO(): SocketIOServer | null {
  return io;
}

// Funções para emitir eventos

export function emitMessage(instanceId: string, conversationId: string, message: any, userId?: string) {
  if (!io) return;

  const chatNamespace = io.of('/chat');
  
  // Emitir para a room da conversa
  chatNamespace.to(`conversation:${conversationId}`).emit('message:new', {
    instanceId,
    conversationId,
    message,
  } as MessageEvent);

  // Emitir para a room da instância
  chatNamespace.to(`instance:${instanceId}`).emit('message:new', {
    instanceId,
    conversationId,
    message,
  } as MessageEvent);

  // Se userId fornecido, emitir para a room do usuário
  if (userId) {
    chatNamespace.to(`user:${userId}`).emit('message:new', {
      instanceId,
      conversationId,
      message,
    } as MessageEvent);
  }
}

export function emitMessageUpdate(
  instanceId: string,
  conversationId: string,
  messageId: string,
  updates: Partial<any>,
  userId?: string
) {
  if (!io) return;

  const chatNamespace = io.of('/chat');
  
  chatNamespace.to(`conversation:${conversationId}`).emit('message:update', {
    instanceId,
    conversationId,
    messageId,
    updates,
  });

  chatNamespace.to(`instance:${instanceId}`).emit('message:update', {
    instanceId,
    conversationId,
    messageId,
    updates,
  });

  if (userId) {
    chatNamespace.to(`user:${userId}`).emit('message:update', {
      instanceId,
      conversationId,
      messageId,
      updates,
    });
  }
}

export function emitConversationUpdate(
  instanceId: string,
  conversationId: string,
  conversation: any,
  userId?: string
) {
  if (!io) return;

  const chatNamespace = io.of('/chat');
  
  chatNamespace.to(`conversation:${conversationId}`).emit('conversation:update', {
    instanceId,
    conversationId,
    conversation,
  } as ConversationUpdateEvent);

  chatNamespace.to(`instance:${instanceId}`).emit('conversation:update', {
    instanceId,
    conversationId,
    conversation,
  } as ConversationUpdateEvent);

  if (userId) {
    chatNamespace.to(`user:${userId}`).emit('conversation:update', {
      instanceId,
      conversationId,
      conversation,
    } as ConversationUpdateEvent);
  }
}

export function emitConnectionStatus(
  instanceId: string,
  status: 'connected' | 'disconnected' | 'connecting',
  userId?: string
) {
  if (!io) return;

  const chatNamespace = io.of('/chat');
  
  chatNamespace.to(`instance:${instanceId}`).emit('connection:status', {
    instanceId,
    status,
  } as ConnectionStatusEvent);

  if (userId) {
    chatNamespace.to(`user:${userId}`).emit('connection:status', {
      instanceId,
      status,
    } as ConnectionStatusEvent);
  }
}

export function emitPresenceUpdate(
  instanceId: string,
  chatId: string,
  isOnline: boolean,
  userId?: string
) {
  if (!io) return;

  const chatNamespace = io.of('/chat');
  
  chatNamespace.to(`instance:${instanceId}`).emit('presence:update', {
    instanceId,
    chatId,
    isOnline,
  } as PresenceUpdateEvent);

  if (userId) {
    chatNamespace.to(`user:${userId}`).emit('presence:update', {
      instanceId,
      chatId,
      isOnline,
    } as PresenceUpdateEvent);
  }
}

