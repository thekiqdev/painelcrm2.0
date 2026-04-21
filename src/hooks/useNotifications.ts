import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/integrations/api/client';
import { toast } from '@/components/ui/sonner';

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string | null;
  data: Record<string, any>;
  read: boolean;
  read_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface UseNotificationsOptions {
  autoConnect?: boolean;
  onNotification?: (notification: Notification) => void;
  onUnreadCountChange?: (count: number) => void;
}

const getSocketUrl = () => {
  if (import.meta.env.DEV) {
    const envUrl = import.meta.env.VITE_API_URL;
    return envUrl || 'http://localhost:3001';
  }
  
  if (typeof window !== 'undefined') {
    if (window.location.protocol === 'https:') {
      return window.location.origin;
    }
    
    const envUrl = import.meta.env.VITE_API_URL;
    if (!envUrl || envUrl.trim() === '') {
      return window.location.origin;
    }
    
    if (envUrl.includes('painelcrm:')) {
      return window.location.origin;
    }
    
    return envUrl;
  }
  
  return '';
};

export function useNotifications(options: UseNotificationsOptions = {}) {
  const { autoConnect = true, onNotification, onUnreadCountChange } = options;
  const { session } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  // Conectar ao WebSocket
  const connect = useCallback(() => {
    if (!session?.token) {
      console.warn('[Notifications] No token available, cannot connect');
      return;
    }

    if (socket?.connected) {
      console.log('[Notifications] Already connected');
      return;
    }

    const socketUrl = getSocketUrl();
    console.log('[Notifications] Connecting to:', socketUrl);

    const newSocket = io(socketUrl, {
      auth: {
        token: session.token,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: maxReconnectAttempts,
    });

    newSocket.on('connect', () => {
      console.log('[Notifications] Connected to WebSocket server');
      setConnected(true);
      setSocket(newSocket);
      reconnectAttempts.current = 0;
      
      // Limpar timeout de reconexão manual
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    });

    newSocket.on('connected', (data) => {
      console.log('[Notifications] Server confirmed connection:', data);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('[Notifications] Disconnected:', reason);
      setConnected(false);
      
      // Tentar reconectar manualmente se não foi desconexão intencional
      if (reason !== 'io client disconnect' && reconnectAttempts.current < maxReconnectAttempts) {
        reconnectAttempts.current++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 10000);
        console.log(`[Notifications] Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempts.current})`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      }
    });

    newSocket.on('connect_error', (error) => {
      console.error('[Notifications] Connection error:', error);
      setConnected(false);
    });

    newSocket.on('notification', (notification: Notification) => {
      console.log('[Notifications] New notification received:', notification);
      
      setNotifications((prev) => [notification, ...prev]);
      setUnreadCount((prev) => prev + 1);
      
      // Callback personalizado
      if (onNotification) {
        onNotification(notification);
      }
      
      // Toast de notificação
      toast.info(notification.title, {
        description: notification.message || undefined,
        duration: 5000,
      });
    });

    newSocket.on('unread_count', (data: { count: number }) => {
      console.log('[Notifications] Unread count updated:', data.count);
      setUnreadCount(data.count);
      
      if (onUnreadCountChange) {
        onUnreadCountChange(data.count);
      }
    });

    newSocket.on('pong', (data) => {
      console.log('[Notifications] Pong received:', data);
    });

    newSocket.on('error', (error) => {
      console.error('[Notifications] Socket error:', error);
    });

    setSocket(newSocket);
  }, [session?.token, onNotification, onUnreadCountChange]);

  // Desconectar
  const disconnect = useCallback(() => {
    if (socket) {
      console.log('[Notifications] Disconnecting...');
      socket.disconnect();
      setSocket(null);
      setConnected(false);
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, [socket]);

  // Carregar notificações iniciais
  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get<{
        notifications: Notification[];
        pagination: { total: number; limit: number; offset: number; hasMore: boolean };
      }>('/api/notifications?limit=50&offset=0');

      if (response.data) {
        setNotifications(response.data.notifications);
      }
    } catch (error) {
      console.error('[Notifications] Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Carregar contador de não lidas
  const loadUnreadCount = useCallback(async () => {
    try {
      const response = await apiClient.get<{ count: number }>('/api/notifications/unread-count');
      if (response.data) {
        setUnreadCount(response.data.count);
      }
    } catch (error) {
      console.error('[Notifications] Error loading unread count:', error);
    }
  }, []);

  // Marcar notificação como lida
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      const response = await apiClient.patch(`/api/notifications/${notificationId}/read`);
      if (response.data) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('[Notifications] Error marking as read:', error);
    }
  }, []);

  // Marcar todas como lidas
  const markAllAsRead = useCallback(async () => {
    try {
      const response = await apiClient.patch('/api/notifications/read-all');
      if (response.data) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        setUnreadCount(0);
      }
    } catch (error) {
      console.error('[Notifications] Error marking all as read:', error);
    }
  }, []);

  // Efeito para conectar/desconectar baseado no token
  useEffect(() => {
    if (autoConnect && session?.token) {
      connect();
    } else if (!session?.token) {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, session?.token, connect, disconnect]);

  // Carregar dados iniciais
  useEffect(() => {
    if (session?.token) {
      loadNotifications();
      loadUnreadCount();
    }
  }, [session?.token, loadNotifications, loadUnreadCount]);

  return {
    socket,
    connected,
    notifications,
    unreadCount,
    loading,
    connect,
    disconnect,
    loadNotifications,
    loadUnreadCount,
    markAsRead,
    markAllAsRead,
  };
}

