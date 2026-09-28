/**
 * Validação cross-node (2 Server Socket.IO + 1 Redis).
 * Skipped se Redis indisponível.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';

async function redisUp(): Promise<boolean> {
  const r = new Redis({ host: '127.0.0.1', port: 6379, connectTimeout: 800, lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await r.connect();
    await r.ping();
    r.disconnect();
    return true;
  } catch {
    try { r.disconnect(); } catch { /* */ }
    return false;
  }
}

async function makeNode(port: number): Promise<{
  httpServer: ReturnType<typeof createServer>;
  io: SocketIOServer;
  pub: Redis;
  sub: Redis;
}> {
  const pub = new Redis({ host: '127.0.0.1', port: 6379, lazyConnect: true });
  const sub = pub.duplicate();
  await Promise.all([pub.connect(), sub.connect()]);
  const httpServer = createServer();
  const io = new SocketIOServer(httpServer, { path: '/socket.io/' });
  io.adapter(createAdapter(pub, sub, { key: 'painelcrm-phase8-test' }));
  io.on('connection', (socket) => {
    socket.join('room:cluster');
  });
  await new Promise<void>((resolve) => httpServer.listen(port, '127.0.0.1', () => resolve()));
  return { httpServer, io, pub, sub };
}

function connectClient(port: number): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioc(`http://127.0.0.1:${port}`, {
      path: '/socket.io/',
      transports: ['websocket'],
      forceNew: true,
    });
    const t = setTimeout(() => reject(new Error('client_timeout')), 5000);
    socket.on('connect', () => {
      clearTimeout(t);
      resolve(socket);
    });
    socket.on('connect_error', (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

describe('PHASE8 cluster validation (2 nodes)', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length) {
      const fn = cleanups.pop();
      if (fn) await fn();
    }
  });

  it('broadcast from node A reaches client on node B', async () => {
    if (!(await redisUp())) {
      console.warn('[skip] Redis unavailable');
      return;
    }

    const a = await makeNode(19081);
    const b = await makeNode(19082);
    cleanups.push(async () => {
      a.io.close();
      b.io.close();
      a.httpServer.close();
      b.httpServer.close();
      a.pub.disconnect();
      a.sub.disconnect();
      b.pub.disconnect();
      b.sub.disconnect();
    });

    const clientB = await connectClient(19082);
    cleanups.push(async () => {
      clientB.close();
    });

    // wait for join room to settle
    await new Promise((r) => setTimeout(r, 100));

    const received = new Promise<unknown>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('cross_node_timeout')), 5000);
      clientB.on('cluster_ping', (payload) => {
        clearTimeout(t);
        resolve(payload);
      });
    });

    const t0 = process.hrtime.bigint();
    a.io.to('room:cluster').emit('cluster_ping', { from: 'A', ts: Date.now() });
    const payload = await received;
    const latencyMs = Number(process.hrtime.bigint() - t0) / 1e6;

    expect(payload).toMatchObject({ from: 'A' });
    console.log(JSON.stringify({ cross_node_broadcast_ms: Number(latencyMs.toFixed(3)), ok: true }));
  }, 30_000);
});
