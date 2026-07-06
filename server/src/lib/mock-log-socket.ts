import type { ServerType } from '@hono/node-server';
import { Server as SocketIOServer } from 'socket.io';
import { getDatabase } from './db';
import { getDatabaseUrl } from './env';
import { upsertUserFromIdToken } from './auth';
import { requireProjectAccess } from './project-auth';
import { getRecentLogs, setMockLogEmitter, type MockRequestLogEntry } from './mock-request-logs';

function roomForProject(projectId: string): string {
  return `mock-logs:${projectId}`;
}

let io: SocketIOServer | null = null;

function emitMockRequestLog(entry: MockRequestLogEntry): void {
  io?.to(roomForProject(entry.projectId)).emit('request', entry);
}

export function initMockLogSocket(httpServer: ServerType): void {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
    path: '/socket.io',
  });

  setMockLogEmitter(emitMockRequestLog);

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || !token) {
      next(new Error('Authentication required'));
      return;
    }

    try {
      const db = await getDatabase(getDatabaseUrl());
      const user = await upsertUserFromIdToken(token, db);
      socket.data.userId = user.id;
      next();
    } catch {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;

    socket.on('subscribe', async (payload: { teamId?: string; projectId?: string }) => {
      const { teamId, projectId } = payload ?? {};
      if (!teamId || !projectId) {
        socket.emit('subscribe_error', { message: 'teamId and projectId are required' });
        return;
      }

      try {
        const db = await getDatabase(getDatabaseUrl());
        await requireProjectAccess(db, teamId, projectId, userId);
        await socket.join(roomForProject(projectId));
        socket.emit('history', getRecentLogs(projectId));
      } catch (err) {
        console.error('Mock log subscribe denied:', err);
        socket.emit('subscribe_error', { message: 'Access denied' });
      }
    });

    socket.on('unsubscribe', (payload: { projectId?: string }) => {
      const projectId = payload?.projectId;
      if (projectId) {
        void socket.leave(roomForProject(projectId));
      }
    });
  });

  console.log('📡 Mock request log socket ready');
}
