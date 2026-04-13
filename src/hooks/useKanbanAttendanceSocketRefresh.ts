import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

type AttendancePayload = { conversation?: { id?: string } };

/**
 * Quando o atendimento (ou um ping mínimo pós-regras de organização) é emitido para o tenant,
 * recarrega os cartões do quadro se a conversa estiver presente — evita F5 para ver operador / encerrada / metadata.
 */
export function useKanbanAttendanceSocketRefresh(
  token: string | undefined,
  boardActive: boolean,
  getConversationIds: () => string[],
  refreshCards: () => void,
) {
  const refreshRef = useRef(refreshCards);
  refreshRef.current = refreshCards;
  const idsFnRef = useRef(getConversationIds);
  idsFnRef.current = getConversationIds;

  useEffect(() => {
    if (!token || !boardActive) return;

    const isDev = import.meta.env.DEV;
    const socketUrl = isDev
      ? (import.meta.env.VITE_API_URL || 'http://localhost:3001')
      : window.location.origin;

    const socket: Socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      path: '/socket.io/',
      query: { token },
      withCredentials: true,
    });

    let debounce: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        refreshRef.current();
      }, 200);
    };

    const onAttendance = (raw: AttendancePayload) => {
      const id = raw?.conversation?.id;
      if (!id) return;
      if (!idsFnRef.current().includes(id)) return;
      scheduleRefresh();
    };

    socket.on('conversation_attendance_updated', onAttendance);

    return () => {
      if (debounce) clearTimeout(debounce);
      socket.disconnect();
    };
  }, [token, boardActive]);
}
