import { io, type Socket } from 'socket.io-client';
import { getDevApiBaseUrl } from '@/lib/devBackendOrigin';

export const REALTIME_EVENTS = {
  messageCreated: 'message.created',
  conversationUpdated: 'conversation.updated',
  notificationCreated: 'notification.created',
  channelStatusChanged: 'channel.status_changed',
  /** Instância WhatsApp removida no backend — limpar caches de chat */
  whatsappInstanceRemoved: 'whatsapp.instance_removed',
} as const;

export const REALTIME_WINDOW_EVENTS = {
  messageCreated: 'painelcrm:realtime:message.created',
  conversationUpdated: 'painelcrm:realtime:conversation.updated',
  notificationCreated: 'painelcrm:realtime:notification.created',
  channelStatusChanged: 'painelcrm:realtime:channel.status_changed',
  whatsappInstanceRemoved: 'painelcrm:realtime:whatsapp.instance_removed',
} as const;

let socket: Socket | null = null;
let currentToken: string | null = null;

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

export function connectRealtime(token: string): Socket {
  if (socket && socket.connected && currentToken === token) return socket;
  if (socket && currentToken !== token) {
    socket.disconnect();
    socket = null;
  }

  currentToken = token;
  socket = io(getSocketUrl(), {
    auth: { token },
    query: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    path: '/socket.io/',
  });

  socket.on(REALTIME_EVENTS.messageCreated, (payload) =>
    emitWindowEvent(REALTIME_WINDOW_EVENTS.messageCreated, payload)
  );
  socket.on(REALTIME_EVENTS.conversationUpdated, (payload) =>
    emitWindowEvent(REALTIME_WINDOW_EVENTS.conversationUpdated, payload)
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

  return socket;
}

export function disconnectRealtime(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  currentToken = null;
}

