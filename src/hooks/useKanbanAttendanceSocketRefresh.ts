import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

type AttendancePayload = { conversation?: { id?: string } };

/**
 * Mantém o quadro Kanban alinhado com o servidor sem F5:
 * - atendimento / metadata (`conversation_attendance_updated`)
 * - nova mensagem ou última mensagem da conversa (`new_message`, `conversation_updated`), ex.: automação por template
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

    const isBoardConversation = (id: string | undefined): id is string => {
      if (!id) return false;
      return idsFnRef.current().includes(id);
    };

    const onAttendance = (raw: AttendancePayload) => {
      const id = raw?.conversation?.id;
      if (!isBoardConversation(id)) return;
      scheduleRefresh();
    };

    const onNewMessage = (data: { conversationId?: string }) => {
      if (!isBoardConversation(data?.conversationId)) return;
      scheduleRefresh();
    };

    const onConversationUpdated = (raw: { id?: string }) => {
      if (!isBoardConversation(raw?.id)) return;
      scheduleRefresh();
    };

    socket.on('conversation_attendance_updated', onAttendance);
    socket.on('new_message', onNewMessage);
    socket.on('conversation_updated', onConversationUpdated);

    return () => {
      if (debounce) clearTimeout(debounce);
      socket.off('conversation_attendance_updated', onAttendance);
      socket.off('new_message', onNewMessage);
      socket.off('conversation_updated', onConversationUpdated);
      socket.disconnect();
    };
  }, [token, boardActive]);
}
