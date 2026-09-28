import { apiClient } from '@/integrations/api/client';
import { getActiveChatCacheSession } from '@/lib/queryClient';
import { kanbanTagsCache } from '@/services/shellPollHttpCaches';

export const CHAT_KANBAN_BASE = '/api/chat/kanban';
/** Alias do contrato pedido (também registado em `/api/chat/kanban/attach-conversation`). */
const LEGACY_ATTACH_CONVERSATION_PATH = '/api/kanban/attach-conversation';

export type ChatKanbanBoardVisibilityMode = 'tenant_all' | 'restricted';

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
  /** Quando presente (API recente): se o utilizador atual pode abrir a engrenagem de definições. */
  current_user_can_manage?: boolean;
  visibility_mode?: ChatKanbanBoardVisibilityMode | string | null;
  is_active?: boolean;
}

export interface ChatKanbanBoardSettingsPayload {
  board: ChatKanbanBoard;
  allowed_user_ids: string[];
  allowed_team_ids: string[];
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
  conversation_id: string | null;
  acquisition_lead_id?: string | null;
  position: number;
  metadata: Record<string, unknown>;
  archived_at: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Presente só nas respostas de criar/mover cartão quando a coluna criou proposta automaticamente. */
export type KanbanAutoCreatedProposalPayload = {
  id: string;
  title: string;
  public_link_path: string | null;
};

/** Cartão com JOIN a `chat_conversations` (listagem do board). */
/** Tags globais do Kanban por tenant (`chat_kanban_tags`). */
export type ChatKanbanTenantTag = {
  id: string;
  label: string;
  color?: string | null;
  created_at?: string;
};

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
  /** Soma de propostas `sent` para o cliente/lead da conversa (ver API). */
  proposal_pending_total?: number | null;
  /** Soma de propostas `accepted` para o cliente/lead da conversa. */
  proposal_accepted_total?: number | null;
  /** Só em respostas de PATCH/POST do cartão; não vem na listagem do quadro. */
  kanban_auto_created_proposal?: KanbanAutoCreatedProposalPayload;
  /** Cartão operacional Super Admin (acquisition_leads). */
  op_lead_name?: string | null;
  op_lead_email?: string | null;
  op_lead_phone?: string | null;
  op_lead_source?: string | null;
  op_lead_stage?: string | null;
  op_activation_score?: string | null;
}

export type ChatKanbanService = ReturnType<typeof createChatKanbanService>;

export function createChatKanbanService(
  base: string,
  opts?: {
    /** Compat: alguns fluxos usam `/api/kanban/attach-conversation` (alias legado). */
    useLegacyAttachAlias?: boolean;
    /** Kanban operacional Super Admin — não usa APIs de funil do tenant. */
    isOpsLayer?: boolean;
  },
) {
  const attachPath = opts?.useLegacyAttachAlias ? LEGACY_ATTACH_CONVERSATION_PATH : `${base}/attach-conversation`;
  const isOpsLayer = opts?.isOpsLayer ?? base.includes('/superadmin/ops/kanban');

  return {
  isOpsLayer,
  async listTenantKanbanTags(options?: { force?: boolean }): Promise<ChatKanbanTenantTag[]> {
    const scope = getActiveChatCacheSession();
    const keyBase = scope ? `${scope.tenantId}:${scope.userId}` : '__session__';
    const cacheKey = `${keyBase}:kanban-tags:${base}`;
    return kanbanTagsCache.get(
      cacheKey,
      async () => {
        const res = await apiClient.get<ChatKanbanTenantTag[]>(`${base}/tags`);
        if (res.error) throw new Error(res.error);
        const data = res.data as unknown;
        return Array.isArray(data) ? data : [];
      },
      options,
    ) as Promise<ChatKanbanTenantTag[]>;
  },

  async createTenantKanbanTag(label: string, color?: string): Promise<ChatKanbanTenantTag> {
    const res = await apiClient.post<ChatKanbanTenantTag>(`${base}/tags`, {
      label: label.trim(),
      ...(color?.trim() ? { color: color.trim() } : {}),
    });
    if (res.error) throw new Error(res.error);
    if (!res.data) throw new Error('Falha ao criar tag');
    const scope = getActiveChatCacheSession();
    const keyBase = scope ? `${scope.tenantId}:${scope.userId}` : '__session__';
    kanbanTagsCache.invalidate(`${keyBase}:kanban-tags:${base}`);
    return res.data;
  },

  async patchTenantKanbanTag(
    tagId: string,
    body: { label?: string; color?: string | null },
  ): Promise<ChatKanbanTenantTag> {
    const res = await apiClient.patch<ChatKanbanTenantTag>(`${base}/tags/${tagId}`, body);
    if (res.error) throw new Error(res.error);
    if (!res.data) throw new Error('Falha ao atualizar tag');
    const scope = getActiveChatCacheSession();
    const keyBase = scope ? `${scope.tenantId}:${scope.userId}` : '__session__';
    kanbanTagsCache.invalidate(`${keyBase}:kanban-tags:${base}`);
    return res.data;
  },

  async listBoards(includeArchived = false): Promise<ChatKanbanBoard[]> {
    const q = includeArchived ? '?includeArchived=true' : '';
    const res = await apiClient.get<ChatKanbanBoard[]>(`${base}/boards${q}`);
    if (res.error) throw new Error(res.error);
    const data = res.data as unknown;
    return Array.isArray(data) ? data : [];
  },

  async getBoard(boardId: string): Promise<ChatKanbanBoard> {
    const res = await apiClient.get<ChatKanbanBoard>(`${base}/boards/${boardId}`);
    if (res.error) throw new Error(res.error);
    if (!res.data) throw new Error('Board não encontrado');
    return res.data as ChatKanbanBoard;
  },

  async getBoardSettings(boardId: string): Promise<ChatKanbanBoardSettingsPayload> {
    const res = await apiClient.get<ChatKanbanBoardSettingsPayload>(`${base}/boards/${boardId}/settings`);
    if (res.error) throw new Error(res.error);
    if (!res.data) throw new Error('Definições do quadro indisponíveis');
    return res.data;
  },

  async createBoard(payload: {
    name: string;
    description?: string | null;
    sort_order?: number;
    linked_sales_funnel_id?: string | null;
  }): Promise<ChatKanbanBoard> {
    const res = await apiClient.post<ChatKanbanBoard>(`${base}/boards`, payload);
    if (res.error) throw new Error(res.error);
    if (!res.data) throw new Error('Falha ao criar board');
    return res.data as ChatKanbanBoard;
  },

  async patchBoard(
    boardId: string,
    payload: {
      name?: string;
      description?: string | null;
      sort_order?: number;
      archived_at?: string | null;
      linked_sales_funnel_id?: string | null;
      visibility_mode?: ChatKanbanBoardVisibilityMode;
      is_active?: boolean;
      allowed_user_ids?: string[];
      allowed_team_ids?: string[];
    },
  ): Promise<ChatKanbanBoard> {
    const res = await apiClient.patch<ChatKanbanBoard>(`${base}/boards/${boardId}`, payload);
    if (res.error) throw new Error(res.error);
    if (!res.data) throw new Error('Falha ao atualizar board');
    return res.data as ChatKanbanBoard;
  },

  async deleteBoard(boardId: string): Promise<void> {
    const res = await apiClient.delete(`${base}/boards/${boardId}`);
    if (res.error) throw new Error(res.error);
  },

  async listColumns(boardId: string): Promise<ChatKanbanColumn[]> {
    const res = await apiClient.get<ChatKanbanColumn[]>(`${base}/boards/${boardId}/columns`);
    if (res.error) throw new Error(res.error);
    const data = res.data as unknown;
    return Array.isArray(data) ? data : [];
  },

  async listCards(boardId: string, includeArchived = false): Promise<ChatKanbanBoardCard[]> {
    const q = includeArchived ? '?includeArchived=true' : '';
    const res = await apiClient.get<ChatKanbanBoardCard[]>(`${base}/boards/${boardId}/cards${q}`);
    if (res.error) throw new Error(res.error);
    const data = res.data as unknown;
    return Array.isArray(data) ? data : [];
  },

  async createColumn(
    boardId: string,
    payload: {
      name: string;
      color?: string | null;
      position?: number;
      funnel_stage_id?: string | null;
      metadata?: Record<string, unknown>;
    },
  ): Promise<ChatKanbanColumn> {
    const res = await apiClient.post<ChatKanbanColumn>(`${base}/boards/${boardId}/columns`, payload);
    if (res.error) throw new Error(res.error);
    if (!res.data) throw new Error('Falha ao criar coluna');
    return res.data as ChatKanbanColumn;
  },

  async patchColumn(
    columnId: string,
    payload: { name?: string; color?: string | null; position?: number; metadata?: Record<string, unknown> },
  ): Promise<ChatKanbanColumn> {
    const res = await apiClient.patch<ChatKanbanColumn>(`${base}/columns/${columnId}`, payload);
    if (res.error) throw new Error(res.error);
    if (!res.data) throw new Error('Falha ao atualizar coluna');
    return res.data as ChatKanbanColumn;
  },

  async deleteColumn(columnId: string): Promise<void> {
    const res = await apiClient.delete(`${base}/columns/${columnId}`);
    if (res.error) throw new Error(res.error);
  },

  async createCard(
    boardId: string,
    payload: { conversation_id: string; column_id: string; position?: number },
  ): Promise<ChatKanbanCard & { kanban_auto_created_proposal?: KanbanAutoCreatedProposalPayload }> {
    const res = await apiClient.post<ChatKanbanCard & { kanban_auto_created_proposal?: KanbanAutoCreatedProposalPayload }>(
      `${base}/boards/${boardId}/cards`,
      payload,
    );
    if (res.error) throw new Error(res.error);
    if (!res.data) throw new Error('Falha ao criar card');
    return res.data;
  },

  async patchCard(
    cardId: string,
    payload: { column_id?: string; position?: number; move_reason?: string; move_confirmed?: boolean },
  ): Promise<ChatKanbanBoardCard> {
    const res = await apiClient.patch<ChatKanbanBoardCard>(`${base}/cards/${cardId}`, payload);
    if (res.error) throw new Error(res.error);
    if (!res.data) throw new Error('Falha ao atualizar card');
    return res.data as ChatKanbanBoardCard;
  },

  /** Remove o cartão do quadro (a conversa permanece; só some desta coluna). */
  async deleteCard(cardId: string): Promise<void> {
    const res = await apiClient.delete(`${base}/cards/${cardId}`);
    if (res.error) throw new Error(res.error);
  },

  /**
   * Cria cartão no quadro ou move o existente (uma conversa por board).
   * Erros com `code` KANBAN_MOVE_* devem ser tratados na UI (motivo / confirmação).
   */
  async attachConversation(payload: {
    board_id: string;
    column_id: string;
    conversation_id: string;
    move_reason?: string;
    move_confirmed?: boolean;
  }): Promise<ChatKanbanBoardCard & { kanban_auto_created_proposal?: KanbanAutoCreatedProposalPayload }> {
    const res = await apiClient.post<
      ChatKanbanBoardCard & { kanban_auto_created_proposal?: KanbanAutoCreatedProposalPayload }
    >(attachPath, payload);
    if (res.error) {
      const err = new Error(res.error) as Error & { code?: string };
      if (res.code) err.code = res.code;
      throw err;
    }
    if (!res.data) throw new Error('Falha ao anexar conversa ao quadro');
    return res.data;
  },
  };
}

export const chatKanbanService = createChatKanbanService(CHAT_KANBAN_BASE, { useLegacyAttachAlias: true });
