/**
 * MB-026/027 — configuração oficial Redis Socket.IO Adapter.
 *
 * Env:
 *   SOCKET_IO_REDIS_ADAPTER=1     → força tentativa de adapter (mesmo sem flag UI)
 *   CHAT_REDIS_WS via painel      → alternativa (lida em runtime no attach)
 *   REDIS_URL=redis://...         → URL completa (prioritária)
 *   REDIS_HOST / REDIS_PORT / REDIS_PASSWORD / REDIS_TLS=1
 *   SOCKET_IO_REDIS_KEY_PREFIX    → default "painelcrm-socket.io"
 *   SOCKET_IO_NODE_ID             → id estável da réplica (default hostname:pid)
 *   SOCKET_IO_REDIS_CONNECT_MS    → timeout connect (default 5000)
 */

import os from 'os';

function boolEnv(name: string): boolean {
  const v = String(process.env[name] || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function numEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : fallback;
}

export type RedisSocketAdapterConfig = {
  envForceEnable: boolean;
  url: string | null;
  host: string;
  port: number;
  password: string | null;
  tls: boolean;
  keyPrefix: string;
  nodeId: string;
  connectTimeoutMs: number;
};

export function getRedisSocketAdapterConfig(): RedisSocketAdapterConfig {
  const url = String(process.env.REDIS_URL || '').trim() || null;
  const host = String(process.env.REDIS_HOST || '127.0.0.1').trim() || '127.0.0.1';
  const port = Math.max(1, numEnv('REDIS_PORT', 6379));
  const password = String(process.env.REDIS_PASSWORD || '').trim() || null;
  const tls = boolEnv('REDIS_TLS');
  const keyPrefix =
    String(process.env.SOCKET_IO_REDIS_KEY_PREFIX || 'painelcrm-socket.io').trim() ||
    'painelcrm-socket.io';
  const nodeId =
    String(process.env.SOCKET_IO_NODE_ID || '').trim() ||
    `${os.hostname()}:${process.pid}`;
  return {
    envForceEnable: boolEnv('SOCKET_IO_REDIS_ADAPTER'),
    url,
    host,
    port,
    password,
    tls,
    keyPrefix,
    nodeId,
    connectTimeoutMs: Math.max(500, numEnv('SOCKET_IO_REDIS_CONNECT_MS', 5000)),
  };
}

export function hasRedisEndpoint(cfg = getRedisSocketAdapterConfig()): boolean {
  return Boolean(cfg.url) || Boolean(cfg.host);
}

export function buildRedisConnectionOptions(cfg = getRedisSocketAdapterConfig()) {
  if (cfg.url) {
    return {
      url: cfg.url,
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      connectTimeout: cfg.connectTimeoutMs,
      lazyConnect: true,
    } as const;
  }
  return {
    host: cfg.host,
    port: cfg.port,
    password: cfg.password || undefined,
    tls: cfg.tls ? {} : undefined,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    connectTimeout: cfg.connectTimeoutMs,
    lazyConnect: true,
  } as const;
}
