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

// Usar a mesma lógica de URL do apiClient
const getSocketUrl = () => {
  // Em desenvolvimento, sempre usar VITE_API_URL ou localhost:3001
  if (import.meta.env.DEV) {
    const envUrl = import.meta.env.VITE_API_URL;
    return envUrl || 'http://localhost:3001';
  }
  
  // Em produção (navegador)
  if (typeof window !== 'undefined') {
    // Se está em HTTPS, usar URL relativa (o Nginx faz proxy)
    if (window.location.protocol === 'https:') {
      return window.location.origin;
    }
    
    const envUrl = import.meta.env.VITE_API_URL;
    
    // Se VITE_API_URL não está definido ou está vazio, usar URL relativa
    if (!envUrl || envUrl.trim() === '') {
      return window.location.origin;
    }
    
    // Se VITE_API_URL contém hostname interno do Docker, usar URL relativa
    if (envUrl.includes('painelcrm:')) {
      return window.location.origin;
    }
    
    return envUrl;
  }
  
  // Fallback
  return 'http://localhost:3001';
};

export function getSocket(token: string): Socket | null {
  if (socket?.connected) {
    return socket;
  }

  const socketUrl = getSocketUrl();
  const fullUrl = socketUrl.replace(/\/$/, '');
  
  // Socket.IO usa o path base /socket.io e depois o namespace /chat
  const socketPath = `${fullUrl}/socket.io`;
  
  console.log('[Socket.IO] Connecting to:', socketPath, 'namespace: /chat');
  console.log('[Socket.IO] Token present:', !!token);

  socket = io(socketPath, {
    path: '/socket.io',
    namespace: '/chat',
    auth: {
      token,
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
    timeout: 20000, // 20 segundos
    forceNew: false,
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

