import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import {
  attachRedisSocketAdapter,
  detachRedisSocketAdapter,
  shouldAttemptRedisAdapter,
} from './redisSocketAdapter.js';

describe('MB-026 redis socket adapter', () => {
  const envKeys = [
    'SOCKET_IO_REDIS_ADAPTER',
    'REDIS_HOST',
    'REDIS_PORT',
    'REDIS_URL',
    'SOCKET_IO_REDIS_CONNECT_MS',
  ] as const;
  const prev: Record<string, string | undefined> = {};

  beforeEach(async () => {
    for (const k of envKeys) {
      prev[k] = process.env[k];
      delete process.env[k];
    }
    await detachRedisSocketAdapter();
  });

  afterEach(async () => {
    await detachRedisSocketAdapter();
    for (const k of envKeys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it('shouldAttemptRedisAdapter is false when disabled', () => {
    expect(shouldAttemptRedisAdapter()).toBe(false);
  });

  it('shouldAttemptRedisAdapter true when SOCKET_IO_REDIS_ADAPTER=1', () => {
    process.env.SOCKET_IO_REDIS_ADAPTER = '1';
    process.env.REDIS_HOST = '127.0.0.1';
    expect(shouldAttemptRedisAdapter()).toBe(true);
  });

  it('falls back to memory when Redis port is closed', async () => {
    process.env.SOCKET_IO_REDIS_ADAPTER = '1';
    process.env.REDIS_HOST = '127.0.0.1';
    process.env.REDIS_PORT = '6399';
    process.env.SOCKET_IO_REDIS_CONNECT_MS = '400';

    const httpServer = createServer();
    const io = new SocketIOServer(httpServer);
    const result = await attachRedisSocketAdapter(io);
    expect(result.mode).toBe('memory-fallback');
    io.close();
    httpServer.close();
  }, 15_000);

  it('stays memory when adapter disabled', async () => {
    const httpServer = createServer();
    const io = new SocketIOServer(httpServer);
    const result = await attachRedisSocketAdapter(io);
    expect(result.mode).toBe('memory');
    io.close();
    httpServer.close();
  });
});
