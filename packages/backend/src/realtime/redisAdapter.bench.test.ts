/**
 * Benchmark real — requer Redis em 127.0.0.1:6379.
 * Se Redis estiver off, o teste é skipped.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import Redis from 'ioredis';
import { attachRedisSocketAdapter, detachRedisSocketAdapter } from './redisSocketAdapter.js';

async function redisAvailable(): Promise<boolean> {
  const r = new Redis({
    host: '127.0.0.1',
    port: 6379,
    connectTimeout: 800,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  try {
    await r.connect();
    await r.ping();
    r.disconnect();
    return true;
  } catch {
    try {
      r.disconnect();
    } catch {
      /* ignore */
    }
    return false;
  }
}

describe('MB-026 redis adapter live bench', () => {
  afterEach(async () => {
    await detachRedisSocketAdapter();
    delete process.env.SOCKET_IO_REDIS_ADAPTER;
  });

  it('attaches redis adapter and measures ping', async () => {
    if (!(await redisAvailable())) {
      console.warn('[skip] Redis not available for live bench');
      return;
    }
    process.env.SOCKET_IO_REDIS_ADAPTER = '1';
    process.env.REDIS_HOST = '127.0.0.1';
    process.env.REDIS_PORT = '6379';

    const httpServer = createServer();
    const io = new SocketIOServer(httpServer);
    const t0 = process.hrtime.bigint();
    const result = await attachRedisSocketAdapter(io);
    const attachMs = Number(process.hrtime.bigint() - t0) / 1e6;
    expect(result.mode).toBe('redis');

    const mem = process.memoryUsage();
    console.log(
      JSON.stringify({
        mode: result.mode,
        attach_ms: Number(attachMs.toFixed(3)),
        rss_mb: Number((mem.rss / 1048576).toFixed(2)),
        heap_mb: Number((mem.heapUsed / 1048576).toFixed(2)),
      }),
    );

    io.close();
    httpServer.close();
  }, 20_000);
});
