import type { Socket, Server as SocketIOServer } from 'socket.io';
import { verifyToken } from '../utils/jwt.js';
import { pool } from '../utils/db.js';
import { getIO } from './websocketService.js';

type AuthenticatedSocket = Socket & { userId?: string; tenantId?: string | null };

export function getTenantRoom(tenantId: string): string {
  return `tenant:${tenantId}`;
}

export function emitToTenant(tenantId: string, eventName: string, payload: unknown): void {
  const io = getIO();
  if (!io) {
    console.warn('[realtime_emit_failed] io_not_initialized', { tenantId, eventName });
    return;
  }
  try {
    io.to(getTenantRoom(tenantId)).emit(eventName, payload);
    console.log('[realtime_emit_to_tenant]', { tenantId, eventName });
  } catch (error: any) {
    console.error('[realtime_emit_failed]', {
      tenantId,
      eventName,
      message: error?.message ?? String(error),
    });
  }
}

export function emitToUser(userId: string, eventName: string, payload: unknown): void {
  const io = getIO();
  if (!io) {
    console.warn('[realtime_emit_failed] io_not_initialized', { userId, eventName });
    return;
  }
  try {
    io.to(`user:${userId}`).emit(eventName, payload);
  } catch (error: any) {
    console.error('[realtime_emit_failed]', {
      userId,
      eventName,
      message: error?.message ?? String(error),
    });
  }
}

export function registerSocketHandlers(io: SocketIOServer): void {
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers.authorization?.split(' ')[1] ||
        (typeof socket.handshake.query?.token === 'string'
          ? socket.handshake.query.token
          : undefined);
      if (!token) return next(new Error('Authentication token required'));

      const payload = verifyToken(token);
      const userRow = await pool.query<{ id: string; tenant_id: string | null }>(
        `SELECT id, tenant_id FROM users WHERE id = $1 LIMIT 1`,
        [payload.userId]
      );
      if ((userRow.rowCount ?? 0) === 0) {
        return next(new Error('User not found'));
      }

      socket.userId = payload.userId;
      socket.tenantId = userRow.rows[0].tenant_id ?? null;
      next();
    } catch (error) {
      next(error as Error);
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.userId;
    if (!userId) {
      socket.disconnect();
      return;
    }
    socket.join(`user:${userId}`);
    if (socket.tenantId) socket.join(getTenantRoom(socket.tenantId));
    console.log('[realtime_socket_connected]', {
      socketId: socket.id,
      userId,
      tenantId: socket.tenantId ?? null,
    });
    socket.on('disconnect', (reason) => {
      console.log('[realtime_socket_disconnected]', {
        socketId: socket.id,
        userId,
        tenantId: socket.tenantId ?? null,
        reason,
      });
    });
  });
}

