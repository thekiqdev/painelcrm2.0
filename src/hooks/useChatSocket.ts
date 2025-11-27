import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getSocket, disconnectSocket, subscribeToInstance, subscribeToConversation, ChatSocketEvents } from '@/services/socketClient';

interface UseChatSocketOptions {
  instanceIds?: string[];
  conversationIds?: string[];
  onMessageNew?: (data: ChatSocketEvents['message:new']) => void;
  onMessageUpdate?: (data: ChatSocketEvents['message:update']) => void;
  onConversationUpdate?: (data: ChatSocketEvents['conversation:update']) => void;
  onConnectionStatus?: (data: ChatSocketEvents['connection:status']) => void;
  onPresenceUpdate?: (data: ChatSocketEvents['presence:update']) => void;
}

export function useChatSocket(options: UseChatSocketOptions = {}) {
  const { session } = useAuth();
  const socketRef = useRef<any>(null);
  const {
    instanceIds = [],
    conversationIds = [],
    onMessageNew,
    onMessageUpdate,
    onConversationUpdate,
    onConnectionStatus,
    onPresenceUpdate,
  } = options;

  useEffect(() => {
    if (!session?.token) {
      return;
    }

    const socket = getSocket(session.token);
    if (!socket) {
      return;
    }

    socketRef.current = socket;

    // Subscribir a instâncias
    instanceIds.forEach((instanceId) => {
      subscribeToInstance(instanceId);
    });

    // Subscribir a conversas
    conversationIds.forEach((conversationId) => {
      subscribeToConversation(conversationId);
    });

    // Event listeners
    if (onMessageNew) {
      socket.on('message:new', onMessageNew);
    }

    if (onMessageUpdate) {
      socket.on('message:update', onMessageUpdate);
    }

    if (onConversationUpdate) {
      socket.on('conversation:update', onConversationUpdate);
    }

    if (onConnectionStatus) {
      socket.on('connection:status', onConnectionStatus);
    }

    if (onPresenceUpdate) {
      socket.on('presence:update', onPresenceUpdate);
    }

    // Cleanup
    return () => {
      if (socket) {
        if (onMessageNew) socket.off('message:new', onMessageNew);
        if (onMessageUpdate) socket.off('message:update', onMessageUpdate);
        if (onConversationUpdate) socket.off('conversation:update', onConversationUpdate);
        if (onConnectionStatus) socket.off('connection:status', onConnectionStatus);
        if (onPresenceUpdate) socket.off('presence:update', onPresenceUpdate);
      }
    };
  }, [
    session?.token,
    instanceIds.join(','),
    conversationIds.join(','),
    onMessageNew,
    onMessageUpdate,
    onConversationUpdate,
    onConnectionStatus,
    onPresenceUpdate,
  ]);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      if (!socketRef.current) {
        return;
      }
      // Não desconectar completamente, apenas remover listeners
      // A conexão será mantida para outros componentes
    };
  }, []);

  return {
    socket: socketRef.current,
    isConnected: socketRef.current?.connected || false,
  };
}

