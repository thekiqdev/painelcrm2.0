import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export interface ChatSocketEvents {
  'message:new': {
    instanceId: string;
    conversationId: string;
    message: any;
  };
  'message:update': {
    instanceId: string;
    conversationId: string;
    messageId: string;
    updates: Partial<any>;
  };
  'conversation:update': {
    instanceId: string;
    conversationId: string;
    conversation: any;
  };
  'connection:status': {
    instanceId: string;
    status: 'connected' | 'disconnected' | 'connecting';
  };
  'presence:update': {
    instanceId: string;
    chatId: string;
    isOnline: boolean;
  };
}

export function getSocket(token: string): Socket | null {
  if (socket?.connected) {
    return socket;
  }

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const socketUrl = apiUrl.replace(/\/$/, '');

  socket = io(`${socketUrl}/chat`, {
    auth: {
      token,
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
  });

  socket.on('connect', () => {
    console.log('[Socket.IO] Connected to server');
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket.IO] Disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('[Socket.IO] Connection error:', error.message);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function subscribeToInstance(instanceId: string) {
  if (socket?.connected) {
    socket.emit('subscribe:instance', { instanceId });
  }
}

export function subscribeToConversation(conversationId: string) {
  if (socket?.connected) {
    socket.emit('subscribe:conversation', { conversationId });
  }
}

