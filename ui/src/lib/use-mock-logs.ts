import { useCallback, useEffect, useMemo, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { app } from './firebase';
import { trpc } from './trpc';
import type { MockRequestLogEntry } from '@server/lib/mock-request-logs';

const MAX_DISPLAY = 200;

const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5500';

type UseMockLogsOptions = {
  teamId: string;
  projectId: string;
  enabled: boolean;
};

function attachSocketHandlers(
  socket: Socket,
  teamId: string,
  projectId: string,
  cancelled: () => boolean,
  onLiveEntry: (entry: MockRequestLogEntry) => void,
  onHistory: (entries: MockRequestLogEntry[]) => void,
  setConnected: (v: boolean) => void,
  setFailed: (v: boolean) => void,
  setSubscribeError: (v: string | null) => void
) {
  const subscribe = () => {
    socket.emit('subscribe', { teamId, projectId });
  };

  socket.off('connect');
  socket.off('disconnect');
  socket.off('connect_error');
  socket.off('history');
  socket.off('request');
  socket.off('subscribe_error');

  socket.on('connect', () => {
    if (cancelled()) {
      return;
    }
    setConnected(true);
    setFailed(false);
    setSubscribeError(null);
    subscribe();
  });

  socket.on('disconnect', () => {
    setConnected(false);
  });

  socket.on('connect_error', () => {
    setConnected(false);
    setFailed(true);
  });

  socket.on('history', (entries: MockRequestLogEntry[]) => {
    if (!cancelled()) {
      setSubscribeError(null);
      onHistory(entries.slice(0, MAX_DISPLAY));
    }
  });

  socket.on('request', (entry: MockRequestLogEntry) => {
    if (!cancelled()) {
      onLiveEntry(entry);
    }
  });

  socket.on('subscribe_error', (payload: { message?: string }) => {
    if (!cancelled()) {
      setSubscribeError(payload?.message ?? 'Could not subscribe to logs');
    }
  });
}

function mergeLogEntries(...sources: (MockRequestLogEntry[] | undefined)[]): MockRequestLogEntry[] {
  const byId = new Map<string, MockRequestLogEntry>();
  for (const source of sources) {
    for (const entry of source ?? []) {
      byId.set(entry.id, entry);
    }
  }
  return [...byId.values()]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, MAX_DISPLAY);
}

export function useMockLogs({ teamId, projectId, enabled }: UseMockLogsOptions) {
  const [socketLogs, setSocketLogs] = useState<MockRequestLogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [failed, setFailed] = useState(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);
  const [hideBeforeMs, setHideBeforeMs] = useState<number | null>(null);

  const polledQuery = trpc.mockApi.logs.recent.useQuery(
    { teamId, projectId },
    {
      enabled: enabled && !!teamId && !!projectId,
      refetchInterval: 1500,
    }
  );

  const onLiveEntry = useCallback((entry: MockRequestLogEntry) => {
    setSocketLogs((prev) => mergeLogEntries([entry], prev));
  }, []);

  const onHistory = useCallback((entries: MockRequestLogEntry[]) => {
    setSocketLogs(entries);
  }, []);

  useEffect(() => {
    if (!enabled || !teamId || !projectId) {
      return;
    }

    let socket: Socket | null = null;
    let cancelled = false;
    const isCancelled = () => cancelled;

    const unsubscribeAuth = onAuthStateChanged(getAuth(app), async (user) => {
      if (cancelled) {
        return;
      }

      if (!user) {
        setFailed(true);
        setConnected(false);
        socket?.disconnect();
        socket = null;
        return;
      }

      setFailed(false);
      const token = await user.getIdToken();
      if (cancelled) {
        return;
      }

      if (socket) {
        socket.auth = { token };
        attachSocketHandlers(
          socket,
          teamId,
          projectId,
          isCancelled,
          onLiveEntry,
          onHistory,
          setConnected,
          setFailed,
          setSubscribeError
        );
        if (socket.connected) {
          setConnected(true);
          socket.emit('subscribe', { teamId, projectId });
        } else {
          socket.connect();
        }
        return;
      }

      socket = io(apiBaseUrl, {
        auth: { token },
        transports: ['websocket', 'polling'],
        autoConnect: false,
      });

      attachSocketHandlers(
        socket,
        teamId,
        projectId,
        isCancelled,
        onLiveEntry,
        onHistory,
        setConnected,
        setFailed,
        setSubscribeError
      );

      socket.connect();
    });

    return () => {
      cancelled = true;
      unsubscribeAuth();
      if (socket) {
        socket.emit('unsubscribe', { projectId });
        socket.disconnect();
      }
      setConnected(false);
    };
  }, [teamId, projectId, enabled, onLiveEntry, onHistory]);

  const logs = useMemo(() => {
    const merged = mergeLogEntries(polledQuery.data, socketLogs);
    if (hideBeforeMs === null) {
      return merged;
    }
    return merged.filter((entry) => new Date(entry.timestamp).getTime() > hideBeforeMs);
  }, [polledQuery.data, socketLogs, hideBeforeMs]);

  const clearLogs = useCallback(() => {
    setHideBeforeMs(Date.now());
    setSocketLogs([]);
  }, []);

  const pollActive = polledQuery.isSuccess || polledQuery.isFetching;
  const showDisconnected = failed && !connected && !pollActive;

  return {
    logs,
    connected: connected || pollActive,
    failed: showDisconnected,
    subscribeError: polledQuery.error?.message ?? subscribeError,
    clearLogs,
    pollError: polledQuery.error,
  };
}

export type { MockRequestLogEntry };
