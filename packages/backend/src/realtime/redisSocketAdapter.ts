/**
 * MB-026 — Socket.IO Redis Adapter (multi-réplica) com fallback single-node.
 */
import type { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { appLogger } from '../observability/appLogger.js';
import {
  buildRedisConnectionOptions,
  getRedisSocketAdapterConfig,
  hasRedisEndpoint,
} from '../config/redisSocketAdapterEnv.js';
import { isChatMigrationFlagEnabled } from '../services/chatMigrationFlags/service.js';
import {
  markRedisAdapterActive,
  markRedisAdapterFallback,
  markRedisAdapterHealth,
  recordRedisAdapterReconnect,
  setSocketNodeId,
} from '../observability/redisAdapterMetrics.js';

export type RedisAdapterAttachResult =
  | { mode: 'redis'; nodeId: string; keyPrefix: string }
  | { mode: 'memory'; reason: string; nodeId: string }
  | { mode: 'memory-fallback'; reason: string; nodeId: string };

type RedisClient = InstanceType<typeof Redis>;

let pubClient: RedisClient | null = null;
let subClient: RedisClient | null = null;
let healthTimer: ReturnType<typeof setInterval> | null = null;
let attachedIo: SocketIOServer | null = null;

export function shouldAttemptRedisAdapter(): boolean {
  const cfg = getRedisSocketAdapterConfig();
  if (!hasRedisEndpoint(cfg)) return false;
  if (cfg.envForceEnable) return true;
  try {
    return isChatMigrationFlagEnabled('CHAT_REDIS_WS');
  } catch {
    return false;
  }
}

function createRedisClient(label: string): RedisClient {
  const cfg = getRedisSocketAdapterConfig();
  const opts = buildRedisConnectionOptions(cfg);
  const client = 'url' in opts && opts.url
    ? new Redis(opts.url, {
        maxRetriesPerRequest: opts.maxRetriesPerRequest,
        enableReadyCheck: opts.enableReadyCheck,
        connectTimeout: opts.connectTimeout,
        lazyConnect: true,
      })
    : new Redis({
        host: (opts as { host: string }).host,
        port: (opts as { port: number }).port,
        password: (opts as { password?: string }).password,
        tls: (opts as { tls?: object }).tls,
        maxRetriesPerRequest: (opts as { maxRetriesPerRequest: number }).maxRetriesPerRequest,
        enableReadyCheck: (opts as { enableReadyCheck: boolean }).enableReadyCheck,
        connectTimeout: (opts as { connectTimeout: number }).connectTimeout,
        lazyConnect: true,
      });

  client.on('error', (err: Error) => {
    appLogger.warn('redis-adapter', `${label} error`, { err: String(err?.message || err) });
    markRedisAdapterHealth(false);
  });
  client.on('reconnecting', () => {
    recordRedisAdapterReconnect(label);
  });
  client.on('ready', () => {
    markRedisAdapterHealth(true);
  });
  return client;
}

async function connectWithTimeout(client: RedisClient, ms: number): Promise<void> {
  await Promise.race([
    client.connect(),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`redis_connect_timeout_${ms}ms`)), ms);
    }),
  ]);
}

/**
 * Anexa adapter Redis ao Server. Idempotente. Nunca lança — faz fallback memory.
 */
export async function attachRedisSocketAdapter(io: SocketIOServer): Promise<RedisAdapterAttachResult> {
  const cfg = getRedisSocketAdapterConfig();
  setSocketNodeId(cfg.nodeId);

  if (attachedIo === io && pubClient && subClient) {
    return { mode: 'redis', nodeId: cfg.nodeId, keyPrefix: cfg.keyPrefix };
  }

  if (!shouldAttemptRedisAdapter()) {
    markRedisAdapterFallback('disabled');
    return { mode: 'memory', reason: 'adapter_disabled', nodeId: cfg.nodeId };
  }

  try {
    await detachRedisSocketAdapter();

    pubClient = createRedisClient('pub');
    subClient = createRedisClient('sub');

    await Promise.all([
      connectWithTimeout(pubClient, cfg.connectTimeoutMs),
      connectWithTimeout(subClient, cfg.connectTimeoutMs),
    ]);

    io.adapter(
      createAdapter(pubClient, subClient, {
        key: cfg.keyPrefix,
      }),
    );
    attachedIo = io;
    markRedisAdapterActive(cfg.nodeId, cfg.keyPrefix);
    startHealthPoll();

    appLogger.boot('redis-adapter', 'Socket.IO Redis adapter active', {
      nodeId: cfg.nodeId,
      keyPrefix: cfg.keyPrefix,
      host: cfg.url ? 'url' : `${cfg.host}:${cfg.port}`,
    });
    return { mode: 'redis', nodeId: cfg.nodeId, keyPrefix: cfg.keyPrefix };
  } catch (err) {
    const reason = String((err as Error)?.message || err);
    appLogger.warn('redis-adapter', 'fallback to in-memory adapter', { reason });
    await safeQuit();
    markRedisAdapterFallback(reason);
    return { mode: 'memory-fallback', reason, nodeId: cfg.nodeId };
  }
}

function startHealthPoll(): void {
  if (healthTimer) return;
  healthTimer = setInterval(() => {
    void (async () => {
      if (!pubClient) return;
      try {
        const t0 = process.hrtime.bigint();
        await pubClient.ping();
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        markRedisAdapterHealth(true, ms);
      } catch {
        markRedisAdapterHealth(false);
      }
    })();
  }, 10_000);
  if (typeof healthTimer.unref === 'function') healthTimer.unref();
}

async function safeQuit(): Promise<void> {
  if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = null;
  }
  const clients = [pubClient, subClient];
  pubClient = null;
  subClient = null;
  attachedIo = null;
  await Promise.all(
    clients.map(async (c) => {
      if (!c) return;
      try {
        c.disconnect();
      } catch {
        /* ignore */
      }
    }),
  );
}

export async function detachRedisSocketAdapter(): Promise<void> {
  await safeQuit();
}

export function getRedisAdapterRuntimeStatus(): {
  mode: 'redis' | 'memory' | 'unknown';
  nodeId: string;
  ready: boolean;
} {
  const cfg = getRedisSocketAdapterConfig();
  if (pubClient && subClient && attachedIo) {
    return { mode: 'redis', nodeId: cfg.nodeId, ready: pubClient.status === 'ready' };
  }
  return { mode: attachedIo ? 'memory' : 'unknown', nodeId: cfg.nodeId, ready: false };
}
