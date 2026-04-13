import { apiClient } from '@/integrations/api/client';

const BASE = '/api/chat/kanban';

export interface ChatKanbanBoard {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  archived_at: string | null;
  created_by_user_id: string;
  updated_by_user_id: string | null;
  linked_sales_funnel_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatKanbanColumn {
  id: string;
  board_id: string;
  tenant_id: string;
  name: string;
  color: string | null;
  position: number;
  funnel_stage_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ChatKanbanCard {
  id: string;
  board_id: string;
  column_id: string;
  tenant_id: string;
  conversation_id: string;
  position: number;
  metadata: Record<string, unknown>;
  archived_at: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Cartão com JOIN a `chat_conversations` (listagem do board). */
export interface ChatKanbanBoardCard extends ChatKanbanCard {
  conv_display_name?: string | null;
  conv_contact_name?: string | null;
  conv_profile_name?: string | null;
  conv_phone_number?: string | null;
  conv_canonical_phone?: string | null;
  conv_last_message_preview?: string | null;
  conv_last_message_at?: string | null;
  conv_unread_count?: number | null;
  conv_client_id?: string | null;
  conv_lead_id?: string | null;
  conv_avatar_url?: string | null;
  conv_attendance_status?: string | null;
  conv_assigned_to_user_id?: string | null;
  conv_assigned_team_id?: string | null;
  conv_assignee_display?: string | null;
  conv_assigned_team_name?: string | null;
  conv_link_state?: string | null;
  /** Snapshot de `chat_conversations.metadata` (ex.: kanban_labels, kanban_priority). */
  conv_metadata?: Record<string, unknown> | null;
}

export const chatKanbanService = {
  async listBoards(includeArchived = false): Promise<ChatKanbanBoard[]> {
    const q = includeArchived ? '?includeArchived=true' : '';
    const res = await apiClient.get<ChatKanbanBoard[]>(`${BASE}/boards${q}`);
    if (res.error) throw new Error(res.error);
    const data = res.data as unknown;
    return Array.isArray(data) ? data : [];
  },

  async getBoard(boardId: string): Promise<ChatKanbanBoard> {
    const res = await apiClient.get<ChatKanbanBoard>(`${BASE}/boards/${boardId}`);
    if (res.error) throw new Error(res.error);
    if (!res.data) throw new Error('Board não encontrado');
    return res.data as ChatKanbanBoard;
  },

  async createBoard(payload: { name: string; description?: string | null; sort_order?: number }): Promise<ChatKanbanBoard> {
    const res = await apiClient.post<ChatKanbanBoard>(`${BASE}/boards`, payload);
    if (res.error) throw new Error(res.error);
    if (!res.data) throw new Error('Falha ao criar board');
    return res.data as ChatKanbanBoard;
  },

  async listColumns(boardId: string): Promise<ChatKanbanColumn[]> {
    const res = await apiClient.get<ChatKanbanColumn[]>(`${BASE}/boards/${boardId}/columns`);
    if (res.error) throw new Error(res.error);
    const data = res.data as unknown;
    return Array.isArray(data) ? data : [];
  },

  async listCards(boardId: string, includeArchived = false): Promise<ChatKanbanBoardCard[]> {
    const q = includeArchived ? '?includeArchived=true' : '';
    const res = await apiClient.get<ChatKanbanBoardCard[]>(`${BASE}/boards/${boardId}/cards${q}`);
    if (res.error) throw new Error(res.error);
    const data = res.data as unknown;
    return Array.isArray(data) ? data : [];
  },

  async createColumn(
    boardId: string,
    payload: { name: string; color?: string | null; position?: number; metadata?: Record<string, unknown> },
  ): Promise<ChatKanbanColumn> {
    const res = await apiClient.post<ChatKanbanColumn>(`${BASE}/boards/${boardId}/columns`, payload);
    if (res.error) throw new Error(res.error);
    if (!res.data) throw new Error('Falha ao criar coluna');
    return res.data as ChatKanbanColumn;
  },

  async patchColumn(
    columnId: string,
    payload: { name?: string; color?: string | null; position?: number; metadata?: Record<string, unknown> },
  ): Promise<ChatKanbanColumn> {
    const res = await apiClient.patch<ChatKanbanColumn>(`${BASE}/columns/${columnId}`, payload);
    if (res.error) throw new Error(res.error);
    if (!res.data) throw new Error('Falha ao atualizar coluna');
    return res.data as ChatKanbanColumn;
  },

  async deleteColumn(columnId: string): Promise<void> {
    const res = await apiClient.delete(`${BASE}/columns/${columnId}`);
    if (res.error) throw new Error(res.error);
  },

  async createCard(
    boardId: string,
    payload: { conversation_id: string; column_id: string; position?: number },
  ): Promise<ChatKanbanCard> {
    const res = await apiClient.post<ChatKanbanCard>(`${BASE}/boards/${boardId}/cards`, payload);
    if (res.error) throw new Error(res.error);
    if (!res.data) throw new Error('Falha ao criar card');
    return res.data as ChatKanbanCard;
  },

  async patchCard(
    cardId: string,
    payload: { column_id?: string; position?: number; move_reason?: string; move_confirmed?: boolean },
  ): Promise<ChatKanbanBoardCard> {
    const res = await apiClient.patch<ChatKanbanBoardCard>(`${BASE}/cards/${cardId}`, payload);
    if (res.error) throw new Error(res.error);
    if (!res.data) throw new Error('Falha ao atualizar card');
    return res.data as ChatKanbanBoardCard;
  },
};
