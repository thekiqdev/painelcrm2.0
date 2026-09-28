import { io, type Socket } from 'socket.io-client';
import { getDevApiBaseUrl } from '@/lib/devBackendOrigin';
import { SOCKET_IO_CLIENT_TRANSPORTS } from '@/lib/socketIoClientOptions';
import {
  acquireSharedChatSocket,
  shouldUseSingleChatSocket,
  chatRealtimeBridge,
} from '@/features/chat-core/realtime/bridge';

export const REALTIME_EVENTS = {
  messageCreated: 'message.created',
  conversationUpdated: 'conversation.updated',
  conversationDeleted: 'conversation.deleted',
  notificationCreated: 'notification.created',
  channelStatusChanged: 'channel.status_changed',
  /** Instância WhatsApp removida no backend — limpar caches de chat */
  whatsappInstanceRemoved: 'whatsapp.instance_removed',
} as const;

export const REALTIME_WINDOW_EVENTS = {
  messageCreated: 'painelcrm:realtime:message.created',
  conversationUpdated: 'painelcrm:realtime:conversation.updated',
  conversationDeleted: 'painelcrm:realtime:conversation.deleted',
  notificationCreated: 'painelcrm:realtime:notification.created',
  channelStatusChanged: 'painelcrm:realtime:channel.status_changed',
  whatsappInstanceRemoved: 'painelcrm:realtime:whatsapp.instance_removed',
} as const;

/** Socket legado (CHAT_SINGLE_SOCKET OFF). */
let legacySocket: Socket | null = null;
let legacyToken: string | null = null;
let legacyForwardersAttached = false;

function getSocketUrl(): string {
  if (import.meta.env.DEV) {
    const base = getDevApiBaseUrl();
    if (base !== '') {
      try {
        return new URL(base).origin;
      } catch {
        /* fallback */
      }
    }
    return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001';
  }
  return window.location.origin;
}

function emitWindowEvent<T>(name: string, payload: T): void {
  window.dispatchEvent(new CustomEvent(name, { detail: payload }));
}

function attachLegacyWindowForwarders(socket: Socket): void {
  if (legacyForwardersAttached) return;
  legacyForwardersAttached = true;

  socket.on(REALTIME_EVENTS.messageCreated, (payload) =>
    emitWindowEvent(REALTIME_WINDOW_EVENTS.messageCreated, payload)
  );
  socket.on(REALTIME_EVENTS.conversationUpdated, (payload) =>
    emitWindowEvent(REALTIME_WINDOW_EVENTS.conversationUpdated, payload)
  );
  socket.on(REALTIME_EVENTS.conversationDeleted, (payload) =>
    emitWindowEvent(REALTIME_WINDOW_EVENTS.conversationDeleted, payload)
  );
  socket.on('conversation_deleted', (payload) =>
    emitWindowEvent(REALTIME_WINDOW_EVENTS.conversationDeleted, payload)
  );
  socket.on(REALTIME_EVENTS.notificationCreated, (payload) =>
    emitWindowEvent(REALTIME_WINDOW_EVENTS.notificationCreated, payload)
  );
  socket.on(REALTIME_EVENTS.channelStatusChanged, (payload) =>
    emitWindowEvent(REALTIME_WINDOW_EVENTS.channelStatusChanged, payload)
  );
  socket.on(REALTIME_EVENTS.whatsappInstanceRemoved, (payload) =>
    emitWindowEvent(REALTIME_WINDOW_EVENTS.whatsappInstanceRemoved, payload)
  );
}

function connectLegacy(token: string): Socket {
  if (legacySocket && legacySocket.connected && legacyToken === token) return legacySocket;
  if (legacySocket && legacyToken !== token) {
    legacySocket.removeAllListeners();
    legacySocket.disconnect();
    legacySocket = null;
    legacyForwardersAttached = false;
  }

  legacyToken = token;
  legacySocket = io(getSocketUrl(), {
    auth: { token },
    query: { token },
    transports: [...SOCKET_IO_CLIENT_TRANSPORTS],
    reconnection: true,
    path: '/socket.io/',
  });

  attachLegacyWindowForwarders(legacySocket);
  return legacySocket;
}

/**
 * Conecta o realtime da app.
 * F1 ON → ChatRealtimeBridge (único socket).
 * F1 OFF → comportamento pré-F1 (socket próprio deste módulo).
 */
export function connectRealtime(token: string): Socket {
  if (shouldUseSingleChatSocket()) {
    if (legacySocket) {
      legacySocket.removeAllListeners();
      legacySocket.disconnect();
      legacySocket = null;
      legacyToken = null;
      legacyForwardersAttached = false;
    }
    const shared = acquireSharedChatSocket(token);
    if (shared) return shared;
    return connectLegacy(token);
  }
  return connectLegacy(token);
}

export function disconnectRealtime(): void {
  if (shouldUseSingleChatSocket()) {
    chatRealtimeBridge.forceDisconnect();
    return;
  }
  if (legacySocket) {
    legacySocket.removeAllListeners();
    legacySocket.disconnect();
    legacySocket = null;
  }
  legacyToken = null;
  legacyForwardersAttached = false;
}
