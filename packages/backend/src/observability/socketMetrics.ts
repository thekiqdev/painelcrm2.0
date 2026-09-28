import type { Server as SocketIOServer } from 'socket.io';
import { getObservabilityConfig } from './config.js';
import { ensureCounter, ensureGauge, incCounter, setGauge } from './registry.js';

let attached: SocketIOServer | null = null;
let pollStarted = false;

export function registerSocketMetricDefs(): void {
  ensureCounter('socketio_connections_total', 'Socket.IO connections accepted');
  ensureCounter('socketio_disconnects_total', 'Socket.IO disconnects');
  ensureCounter('socketio_reconnects_total', 'Client reconnect hints');
  ensureCounter('socketio_broadcasts_total', 'Broadcast ops (external record API)');
  ensureGauge('socketio_connected', 'Current connected sockets');
  ensureGauge('socketio_rooms', 'Approx room count');
  ensureCounter('socketio_fanout_total', 'Fan-out size sum (external record API)');
}

/**
 * Listeners no Server — não altera auth/handlers de negócio do websocketService.
 */
export function attachSocketObservability(io: SocketIOServer): void {
  const cfg = getObservabilityConfig();
  if (!cfg.enabled) return;
  if (attached === io) return;
  attached = io;
  registerSocketMetricDefs();

  io.on('connection', (socket) => {
    incCounter('socketio_connections_total', {
      transport: socket.conn?.transport?.name || 'unknown',
    });
    const q = socket.handshake?.query?.reconnect;
    if (q === '1' || q === 'true') incCounter('socketio_reconnects_total');
    refreshGauges(io);
    socket.on('disconnect', (reason) => {
      incCounter('socketio_disconnects_total', {
        reason: String(reason || 'unknown').slice(0, 40),
      });
      refreshGauges(io);
    });
  });

  if (!pollStarted) {
    pollStarted = true;
    const t = setInterval(() => refreshGauges(io), 10_000);
    if (typeof t.unref === 'function') t.unref();
  }
}

/** API opcional para emitters de domínio sem patch do Server. */
export function recordSocketBroadcast(event: string, fanout = 1): void {
  const cfg = getObservabilityConfig();
  if (!cfg.enabled) return;
  registerSocketMetricDefs();
  const ev = String(event).slice(0, 64);
  incCounter('socketio_broadcasts_total', { event: ev });
  incCounter('socketio_fanout_total', { event: ev }, Math.max(0, fanout));
}

function refreshGauges(io: SocketIOServer): void {
  try {
    setGauge('socketio_connected', io.engine?.clientsCount ?? 0);
    setGauge('socketio_rooms', io.sockets?.adapter?.rooms?.size ?? 0);
  } catch {
    /* ignore */
  }
}
