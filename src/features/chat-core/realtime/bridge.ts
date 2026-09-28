/**
 * Chat Realtime Bridge — F1 Single Socket.
 *
 * Flag ON → uma única conexão Socket.IO por sessão; payloads e nomes de evento
 * idênticos ao `realtimeClient` legado. Flag OFF → `not_wired` (fluxos legados).
 */

import { io, type Socket } from 'socket.io-client';
import { getDevApiBaseUrl } from '@/lib/devBackendOrigin';
import { SOCKET_IO_CLIENT_TRANSPORTS } from '@/lib/socketIoClientOptions';
import { isChatPhaseFlagEnabled } from '../feature-flags';
import type { ChatDomainEvent } from '../domain/types';
import { normalizeSocketEventByName } from './normalize';
import {
  recordChatRealtimeUpdate,
  recordChatSocket,
} from '../metrics/baseline';
import { CHAT_WS_EVENTS_V2, CHAT_WS_EVENTS_LEGACY } from './contracts';

export type ChatRealtimeBridgeStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'not_wired';

export type ChatRealtimeEventHandler = (event: ChatDomainEvent) => void;

/** CustomEvents idênticos ao realtimeClient — contratos estáveis. */
const WINDOW_EVENTS = {
  messageCreated: 'painelcrm:realtime:message.created',
  conversationUpdated: 'painelcrm:realtime:conversation.updated',
  conversationDeleted: 'painelcrm:realtime:conversation.deleted',
  notificationCreated: 'painelcrm:realtime:notification.created',
  channelStatusChanged: 'painelcrm:realtime:channel.status_changed',
  whatsappInstanceRemoved: 'painelcrm:realtime:whatsapp.instance_removed',
} as const;

type BridgeInternal = {
  socket: Socket | null;
  token: string | null;
  status: ChatRealtimeBridgeStatus;
  windowForwardAttached: boolean;
  connectStartedAt: number | null;
  reconnectCount: number;
  logicalConsumers: number;
};

const internal: BridgeInternal = {
  socket: null,
  token: null,
  status: 'not_wired',
  windowForwardAttached: false,
  connectStartedAt: null,
  reconnectCount: 0,
  logicalConsumers: 0,
};

function setBridgeStatus(next: ChatRealtimeBridgeStatus): void {
  if (internal.status === next) return;
  internal.status = next;
  for (const listener of statusListeners) {
    try {
      listener(next);
    } catch {
      /* ignore */
    }
  }
}

const statusListeners = new Set<(status: ChatRealtimeBridgeStatus) => void>();
const domainHandlers = new Set<ChatRealtimeEventHandler>();

/** TF8 E1 — soft reconcile inbox quando o bridge passa a connected. */
export function subscribeChatRealtimeBridgeStatus(
  listener: (status: ChatRealtimeBridgeStatus) => void,
): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

function bridgeDevLog(message: string, detail?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  if (detail) console.info(`[ChatRealtimeBridge] ${message}`, detail);
  else console.info(`[ChatRealtimeBridge] ${message}`);
}

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
    const viteApi = import.meta.env.VITE_API_URL;
    if (typeof viteApi === 'string' && viteApi.trim()) return viteApi.trim();
    return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001';
  }
  return typeof window !== 'undefined' ? window.location.origin : '';
}

function emitWindowEvent<T>(name: string, payload: T): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name, { detail: payload }));
}

function forwardDomainEvent(eventName: string, payload: unknown): void {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const event = normalizeSocketEventByName(eventName, payload);
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  recordChatRealtimeUpdate({
    eventKind: event.kind,
    applyMs: Math.max(0, Math.round(t1 - t0)),
    source: 'chat_realtime_bridge',
  });
  for (const h of domainHandlers) {
    try {
      h(event);
    } catch {
      /* ignore */
    }
  }
}

function attachSocketDomainForwarder(socket: Socket, eventName: string): void {
  socket.on(eventName, (payload) => {
    forwardDomainEvent(eventName, payload);
  });
}

function attachWindowForwarders(socket: Socket): void {
  if (internal.windowForwardAttached) return;
  internal.windowForwardAttached = true;

  socket.on(CHAT_WS_EVENTS_V2.messageCreated, (payload) =>
    emitWindowEvent(WINDOW_EVENTS.messageCreated, payload),
  );
  socket.on(CHAT_WS_EVENTS_V2.conversationUpdated, (payload) =>
    emitWindowEvent(WINDOW_EVENTS.conversationUpdated, payload),
  );
  socket.on(CHAT_WS_EVENTS_V2.conversationDeleted, (payload) =>
    emitWindowEvent(WINDOW_EVENTS.conversationDeleted, payload),
  );
  socket.on('conversation_deleted', (payload) =>
    emitWindowEvent(WINDOW_EVENTS.conversationDeleted, payload),
  );
  socket.on(CHAT_WS_EVENTS_V2.notificationCreated, (payload) =>
    emitWindowEvent(WINDOW_EVENTS.notificationCreated, payload),
  );
  socket.on(CHAT_WS_EVENTS_V2.channelStatusChanged, (payload) =>
    emitWindowEvent(WINDOW_EVENTS.channelStatusChanged, payload),
  );
  socket.on(CHAT_WS_EVENTS_V2.whatsappInstanceRemoved, (payload) =>
    emitWindowEvent(WINDOW_EVENTS.whatsappInstanceRemoved, payload),
  );

  const domainEvents = [
    CHAT_WS_EVENTS_V2.messageCreated,
    CHAT_WS_EVENTS_LEGACY.newMessage,
    CHAT_WS_EVENTS_V2.conversationUpdated,
    CHAT_WS_EVENTS_LEGACY.conversationUpdated,
    CHAT_WS_EVENTS_V2.conversationDeleted,
    CHAT_WS_EVENTS_LEGACY.conversationDeleted,
    'conversation_deleted',
    CHAT_WS_EVENTS_V2.messageUpdated,
    CHAT_WS_EVENTS_LEGACY.messageUpdated,
    CHAT_WS_EVENTS_V2.conversationAttendanceUpdated,
    CHAT_WS_EVENTS_LEGACY.conversationAttendanceUpdated,
  ];
  for (const eventName of domainEvents) {
    attachSocketDomainForwarder(socket, eventName);
  }
}

function attachLifecycleMetrics(socket: Socket): void {
  socket.on('connect', () => {
    setBridgeStatus('connected');
    const durationMs =
      internal.connectStartedAt != null
        ? Math.round(performance.now() - internal.connectStartedAt)
        : undefined;
    recordChatSocket({
      action: 'open',
      socketId: socket.id,
      source: 'chat_realtime_bridge',
    });
    bridgeDevLog('connected', {
      socketId: socket.id,
      transport: socket.io.engine?.transport?.name,
      durationMs,
      subscribers: domainHandlers.size,
      logicalConsumers: internal.logicalConsumers,
      featureFlag: 'CHAT_SINGLE_SOCKET',
      totalSockets: 1,
    });
  });

  socket.on('disconnect', (reason) => {
    setBridgeStatus('disconnected');
    recordChatSocket({
      action: 'close',
      socketId: socket.id,
      source: 'chat_realtime_bridge',
    });
    bridgeDevLog('disconnected', { reason });
  });

  socket.on('reconnect', (attempt) => {
    internal.reconnectCount += 1;
    setBridgeStatus('connected');
    recordChatSocket({
      action: 'observed',
      socketId: socket.id,
      source: 'chat_realtime_bridge_reconnect',
    });
    bridgeDevLog('reconnect', { attempt, totalReconnects: internal.reconnectCount });
  });

  socket.on('connect_error', (error) => {
    recordChatSocket({
      action: 'observed',
      socketId: socket.id ?? null,
      source: 'chat_realtime_bridge_connect_error',
    });
    bridgeDevLog('connect_error', { message: error?.message ?? String(error) });
  });
}

function ensureSocket(token: string): Socket {
  if (internal.socket && internal.token === token) {
    return internal.socket;
  }

  if (internal.socket) {
    internal.socket.removeAllListeners();
    internal.socket.disconnect();
    internal.socket = null;
    internal.windowForwardAttached = false;
  }

  internal.token = token;
  setBridgeStatus('connecting');
  internal.connectStartedAt = performance.now();

  const socket = io(getSocketUrl(), {
    auth: { token },
    query: { token },
    transports: [...SOCKET_IO_CLIENT_TRANSPORTS],
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    reconnectionAttempts: 8,
    timeout: 20000,
    path: '/socket.io/',
    withCredentials: true,
    forceNew: false,
  });

  internal.socket = socket;
  attachLifecycleMetrics(socket);
  attachWindowForwarders(socket);
  bridgeDevLog('ensureSocket', { totalSockets: 1, featureFlag: true });
  return socket;
}

function hardDisconnect(): void {
  if (internal.socket) {
    bridgeDevLog('forceDisconnect', { socketId: internal.socket.id });
    internal.socket.removeAllListeners();
    internal.socket.disconnect();
    internal.socket = null;
  }
  internal.token = null;
  setBridgeStatus('idle');
  internal.windowForwardAttached = false;
  internal.connectStartedAt = null;
  internal.logicalConsumers = 0;
}

export type ChatRealtimeBridge = {
  readonly status: ChatRealtimeBridgeStatus;
  /** Garante socket único (idempotente). */
  connect(token: string): Socket | null;
  /** Alias de forceDisconnect (logout). */
  disconnect(): void;
  forceDisconnect(): void;
  getSocket(): Socket | null;
  getReconnectCount(): number;
  /** Marca consumidor lógico (Chat page, Kanban, …) — só métricas/logs. */
  registerConsumer(name: string): () => void;
  subscribe(handler: ChatRealtimeEventHandler): () => void;
  normalizeForObservability(eventName: string, payload: unknown): ChatDomainEvent;
};

function createChatRealtimeBridgeImpl(): ChatRealtimeBridge {
  return {
    get status() {
      if (!isChatPhaseFlagEnabled('CHAT_SINGLE_SOCKET')) return 'not_wired';
      return internal.status === 'not_wired' ? 'idle' : internal.status;
    },

    connect(token: string): Socket | null {
      if (!isChatPhaseFlagEnabled('CHAT_SINGLE_SOCKET')) {
        bridgeDevLog('connect ignored — flag OFF');
        return null;
      }
      if (!token) return null;
      return ensureSocket(token);
    },

    disconnect(): void {
      if (!isChatPhaseFlagEnabled('CHAT_SINGLE_SOCKET')) return;
      hardDisconnect();
    },

    forceDisconnect(): void {
      hardDisconnect();
    },

    getSocket(): Socket | null {
      return internal.socket;
    },

    getReconnectCount(): number {
      return internal.reconnectCount;
    },

    registerConsumer(name: string) {
      internal.logicalConsumers += 1;
      bridgeDevLog('consumer_register', { name, logicalConsumers: internal.logicalConsumers });
      return () => {
        internal.logicalConsumers = Math.max(0, internal.logicalConsumers - 1);
        bridgeDevLog('consumer_unregister', { name, logicalConsumers: internal.logicalConsumers });
      };
    },

    subscribe(handler: ChatRealtimeEventHandler) {
      domainHandlers.add(handler);
      bridgeDevLog('subscribe', { subscribers: domainHandlers.size });
      return () => {
        domainHandlers.delete(handler);
        bridgeDevLog('unsubscribe', { subscribers: domainHandlers.size });
      };
    },

    normalizeForObservability(eventName: string, payload: unknown) {
      const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const event = normalizeSocketEventByName(eventName, payload);
      const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      recordChatRealtimeUpdate({
        eventKind: event.kind,
        applyMs: Math.max(0, t1 - t0),
        source: 'normalize_only',
      });
      for (const h of domainHandlers) {
        try {
          h(event);
        } catch {
          /* ignore */
        }
      }
      return event;
    },
  };
}

export const chatRealtimeBridge = createChatRealtimeBridgeImpl();

export function createChatRealtimeBridge(): ChatRealtimeBridge {
  return chatRealtimeBridge;
}

/** Retorna o socket compartilhado (F1 ON) ou null (flag OFF → legado). */
export function acquireSharedChatSocket(token: string): Socket | null {
  return chatRealtimeBridge.connect(token);
}

/** @deprecated Prefer forceDisconnect via disconnectRealtime no logout. No-op release. */
export function releaseSharedChatSocket(): void {
  /* F1: conexão é owned pelo AppShell/realtimeClient até logout — não desconecta por página. */
}

export function shouldUseSingleChatSocket(): boolean {
  return isChatPhaseFlagEnabled('CHAT_SINGLE_SOCKET');
}
