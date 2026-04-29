import { apiClient } from '@/integrations/api/client';
import type { CommunicationProvider } from '@/types/communication';
import { DEFAULT_COMMUNICATION_PROVIDER } from '@/types/communication';
import { chatAvatarUrlForImgSrc } from '@/lib/chatAvatarUrl';
import { chatAvatarDebugLog } from '@/lib/chatAvatarDebug';

/** Etapa 4 — mesmos valores persistidos em `chat_instances.metadata`. */
export type InstanceSyncMode = 'none' | 'days_7' | 'days_30' | 'days_90' | 'full';

/** Estado da sincronização inicial (bootstrap) persistido em `chat_instances.metadata.bootstrap_sync` */
export type BootstrapSyncMeta = {
  sync_run_id?: string;
  status?: 'queued' | 'running' | 'completed' | 'failed';
  queued_at?: string;
  started_at?: string;
  finished_at?: string;
  trigger?: string;
  error?: string;
  /** Etapa 4 — auditoria */
  applied_sync_mode?: InstanceSyncMode;
  applied_since_ms?: number | null;
  conversations_total?: number;
  conversations_upserted?: number;
  messages_synced?: number;
  chats_messages_tried?: number;
};

export interface ChatInstance {
  id: string;
  user_id: string;
  name: string;
  external_instance_name?: string | null;
  instance_token?: string;
  status: string;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
  /** Mesmo tenant: pode usar no chat / sync; sempre true quando a linha é devolvida. */
  can_operate?: boolean;
  /** Apenas o criador da instância: QR, apagar, webhook, ativar no chat. */
  can_manage?: boolean;
}

/** Etapa 5 — estado de atendimento (Fase 5 inclui valores legacy para payloads antigos). */
export type ChatAttendanceStatus =
  | 'open'
  | 'pending'
  | 'in_progress'
  | 'waiting_customer'
  | 'closed'
  | 'archived'
  | 'unassigned'
  | 'queued'
  | 'in_service';

export interface ChatConversation {
  id: string;
  user_id: string;
  instance_id: string;
  /** Canal lógico (Chat Engine multicanal). */
  provider?: CommunicationProvider | string | null;
  instance_name?: string;
  client_id?: string | null;
  leadId?: string | null;
  lead_status?: string | null;
  external_chat_id: string;
  contactName?: string | null;
  profileName?: string | null;
  phoneNumber?: string | null;
  /**
   * URL efetiva para UI (prioridade: coluna `avatar_url` da API → metadata Uaz).
   */
  avatarUrl?: string | null;
  /** Espelho opcional da coluna/API `avatar_url` (só o que veio no payload; pode ser null se a foto veio só do metadata). */
  avatar_url?: string | null;
  /** Foto do registo `communication_contacts` (quando a API expõe separado da coluna da conversa). */
  communication_avatar_url?: string | null;
  /** Identidade canônica (backend / Postgres) — opcional em payloads antigos (camelCase). */
  canonicalChatId?: string | null;
  canonicalPhone?: string | null;
  /** Título seguro para UI; quando ausente, a UI pode cair em contactName / telefone. */
  displayName?: string | null;
  identityState?: string | null;
  identitySource?: string | null;
  identityStrength?: string | null;
  historySyncStatus?: string | null;
  lastHistorySyncReason?: string | null;
  /** Espelhos opcionais snake_case da API/Postgres (1:1 com o backend; debug / uso progressivo). */
  canonical_chat_id?: string | null;
  canonical_phone?: string | null;
  display_name?: string | null;
  identity_state?: string | null;
  identity_source?: string | null;
  identity_strength?: string | null;
  history_sync_status?: string | null;
  last_history_sync_reason?: string | null;
  status?: string | null;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
  unreadCount: number;
  link_state?: 'client_linked' | 'lead_linked' | 'review_required' | 'unlinked' | null;
  link_source?: 'auto' | 'manual' | 'system' | null;
  link_confidence?: 'high' | 'review' | 'manual' | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
  /** Etapa 5 */
  attendance_status?: ChatAttendanceStatus | null;
  assigned_to_user_id?: string | null;
  /** Fila de equipe (transferência para equipe); sem operador até assumir */
  assigned_team_id?: string | null;
  assigned_team_name?: string | null;
  queue_id?: string | null;
  assigned_at?: string | null;
  closed_at?: string | null;
  last_assignment_reason?: string | null;
  assignee_email?: string | null;
  assignee_display?: string | null;
  /** Fase 5 SLA — quando exposto pela API */
  first_response_at?: string | null;
  last_customer_message_at?: string | null;
  last_agent_message_at?: string | null;
}

export interface ConversationProfile {
  type: 'client' | 'lead' | null;
  profile: any | null;
}

/** Espelha `packages/backend/src/utils/chatMessageContract.ts` */
export type ChatMessageKind =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'unknown';

export interface ChatMediaItem {
  type: ChatMessageKind;
  url?: string | null;
  mimetype?: string | null;
  fileName?: string | null;
  seconds?: number | null;
  persistentStub?: boolean;
}

export interface ChatMessageContract {
  kind: ChatMessageKind;
  body: string | null;
  caption: string | null;
  direction: 'incoming' | 'outgoing';
  media: ChatMediaItem[];
  external_message_id?: string | null;
  status?: string | null;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  direction: 'incoming' | 'outgoing';
  external_message_id?: string | null;
  body?: string | null;
  status?: string | null;
  sentAt?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  /** JSONB no Postgres — lista de mídia normalizada */
  media?: ChatMediaItem[] | null;
  message_contract?: ChatMessageContract | null;
}

/** Normaliza linha de conversa (REST ou WebSocket) sem descartar campos canônicos de identidade. */
export function normalizeConversation(raw: any): ChatConversation {
  const metadata = raw?.metadata || {};

  const trimStr = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  const avatarColumn = trimStr(raw?.avatar_url);
  const communicationAvatarColumn = trimStr(raw?.communication_avatar_url);

  const avatarMerged =
    avatarColumn ||
    raw?.image ||
    raw?.image_preview ||
    raw?.imagePreview ||
    metadata.image ||
    metadata.image_preview ||
    metadata.imagePreview ||
    (typeof metadata.whatsapp_profile_photo === 'string' ? metadata.whatsapp_profile_photo : null) ||
    null;
  const avatarUrl = chatAvatarUrlForImgSrc(avatarMerged);

  if (avatarMerged) {
    chatAvatarDebugLog('normalizeConversation', {
      conversationId: raw?.id ?? null,
      raw_avatar_url: avatarColumn,
      raw_communication_avatar_url: communicationAvatarColumn,
      avatarMergedPrefix: avatarMerged.length > 120 ? `${avatarMerged.slice(0, 120)}…` : avatarMerged,
      avatarUrlAfterBrowserPolicy: avatarUrl,
    });
  }

  const canonical_chat_id = trimStr(raw?.canonical_chat_id);
  const canonical_phone = trimStr(raw?.canonical_phone);
  const display_name = trimStr(raw?.display_name);
  const identity_state = trimStr(raw?.identity_state);
  const identity_source = trimStr(raw?.identity_source);
  const identity_strength = trimStr(raw?.identity_strength);
  const history_sync_status = trimStr(raw?.history_sync_status);
  const last_history_sync_reason = trimStr(raw?.last_history_sync_reason);

  return {
    id: raw.id,
    user_id: raw.user_id,
    instance_id: raw.instance_id,
    provider: (raw.provider as CommunicationProvider | undefined) ?? DEFAULT_COMMUNICATION_PROVIDER,
    instance_name: raw.instance_name,
    client_id: raw.client_id ?? null,
    leadId: raw.lead_id ?? null,
    lead_status: raw.lead_status ?? null,
    external_chat_id: raw.external_chat_id,
    contactName: raw.contact_name ?? null,
    profileName: raw.profile_name ?? null,
    phoneNumber: raw.phone_number ?? null,
    avatarUrl,
    avatar_url: chatAvatarUrlForImgSrc(avatarColumn),
    communication_avatar_url: chatAvatarUrlForImgSrc(communicationAvatarColumn),
    canonicalChatId: canonical_chat_id,
    canonicalPhone: canonical_phone,
    displayName: display_name,
    identityState: identity_state,
    identitySource: identity_source,
    identityStrength: identity_strength,
    historySyncStatus: history_sync_status,
    lastHistorySyncReason: last_history_sync_reason,
    canonical_chat_id,
    canonical_phone,
    display_name,
    identity_state,
    identity_source,
    identity_strength,
    history_sync_status,
    last_history_sync_reason,
    status: raw.status ?? null,
    lastMessagePreview: raw.last_message_preview ?? null,
    lastMessageAt: raw.last_message_at ?? null,
    unreadCount: typeof raw.unread_count === 'number' ? raw.unread_count : 0,
    link_state: raw.link_state ?? metadata.link_state ?? null,
    link_source: raw.link_source ?? metadata.link_source ?? null,
    link_confidence: raw.link_confidence ?? metadata.link_confidence ?? null,
    metadata: metadata ?? null,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    attendance_status: (raw.attendance_status as ChatAttendanceStatus | undefined) ?? null,
    assigned_to_user_id: raw.assigned_to_user_id ?? null,
    assigned_team_id: raw.assigned_team_id ?? null,
    assigned_team_name: raw.assigned_team_name ?? null,
    queue_id: raw.queue_id ?? null,
    assigned_at: raw.assigned_at ?? null,
    closed_at: raw.closed_at ?? null,
    last_assignment_reason: raw.last_assignment_reason ?? null,
    assignee_email: raw.assignee_email ?? null,
    assignee_display: raw.assignee_display ?? null,
    first_response_at: raw.first_response_at ?? null,
    last_customer_message_at: raw.last_customer_message_at ?? null,
    last_agent_message_at: raw.last_agent_message_at ?? null,
  };
}

export function parseMediaField(raw: unknown): ChatMediaItem[] {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) return raw as ChatMediaItem[];
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? (p as ChatMediaItem[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Evita `[object Object]` na UI quando `body` veio como objeto (ex.: payload WhatsApp/UazAPI). */
export function coerceChatPlainText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>;
    if (typeof o.body === 'string' && o.body.trim()) return o.body.trim();
    if (typeof o.text === 'string' && o.text.trim()) return o.text.trim();
    if (typeof o.caption === 'string' && o.caption.trim()) return o.caption.trim();
    if (typeof o.message === 'string' && o.message.trim()) return o.message.trim();
    const nested = o.text;
    if (nested && typeof nested === 'object') {
      const t = nested as Record<string, unknown>;
      if (typeof t.body === 'string' && t.body.trim()) return t.body.trim();
    }
  }
  return '';
}

function coerceMediaUrl(u: unknown): string | null {
  if (u == null) return null;
  if (typeof u === 'string' && u.trim()) {
    const raw = u.trim();
    if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw;
    if (raw.startsWith('/media/')) {
      const base = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');
      return `${base}${raw}`;
    }
    return raw;
  }
  if (typeof u === 'object' && u !== null) {
    const o = u as Record<string, unknown>;
    for (const k of ['url', 'href', 'mediaUrl', 'directPath', 'downloadUrl', 'fileUrl', 'link', 'src']) {
      const s = coerceMediaUrl(o[k]);
      if (s) return s;
    }
  }
  return null;
}

function sanitizeMediaItems(items: ChatMediaItem[]): ChatMediaItem[] {
  return items.map((m) => ({
    ...m,
    url: coerceMediaUrl(m.url) ?? coerceMediaUrl(m) ?? undefined,
  }));
}

function sanitizeMessageContract(c: ChatMessageContract | null | undefined): ChatMessageContract | null {
  if (!c) return null;
  const body = coerceChatPlainText(c.body);
  const cap =
    typeof c.caption === 'string' ? c.caption.trim() : coerceChatPlainText(c.caption);
  return {
    ...c,
    body: body || null,
    caption: cap || null,
    media: sanitizeMediaItems(Array.isArray(c.media) ? c.media : []),
  };
}

/** Normaliza uma linha de mensagem (API REST ou WebSocket) para o estado da UI. */
export function normalizeChatMessage(raw: any): ChatMessage {
  const contract = (raw.message_contract as ChatMessageContract | undefined) ?? null;
  return {
    id: raw.id,
    conversation_id: raw.conversation_id,
    direction: raw.direction === 'outgoing' ? 'outgoing' : 'incoming',
    external_message_id: raw.external_message_id ?? null,
    body: coerceChatPlainText(raw.body) || null,
    status: raw.status ?? null,
    sentAt: raw.sent_at ?? raw.created_at ?? null,
    metadata: raw.metadata ?? null,
    created_at: raw.created_at,
    media: sanitizeMediaItems(parseMediaField(raw.media)),
    message_contract: sanitizeMessageContract(contract),
  };
}

export type ChatOperationalMetrics = {
  open_total: number;
  pending_attendance: number;
  in_progress: number;
  closed_today: number;
  avg_first_response_sec: number | null;
  avg_next_reply_sec: number | null;
  by_queue: Array<{ queue_id: string; name: string; n: number }>;
  by_queue_active: Array<{ queue_id: string; name: string; n: number }>;
  by_assignee: Array<{ user_id: string; email: string; display: string; n: number }>;
  by_assignee_active: Array<{ user_id: string; email: string; display: string; n: number }>;
};

export type ChatAutomationSettingsDto = {
  tenant_id: string;
  automation_enabled: boolean;
  auto_status_from_customer: boolean;
  auto_status_from_agent: boolean;
  distribution_enabled: boolean;
  sla_first_response_minutes: number | null;
  sla_next_response_minutes: number | null;
  inactivity_reset_minutes: number | null;
  sla_alerts_enabled?: boolean;
  sla_risk_percent?: number | null;
  updated_at: string;
};

export type ChatAutomationRuleDto = {
  id: string;
  tenant_id: string;
  name?: string | null;
  priority: number;
  is_active: boolean;
  match_type: 'keyword_body' | 'client_tag' | 'client_new' | 'client_existing';
  pattern: string;
  action: 'set_queue' | 'set_team' | 'set_priority' | 'assign_user';
  target_queue_id: string | null;
  target_team_id: string | null;
  target_user_id?: string | null;
  priority_value: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ChatAutomationRuleInput = {
  name?: string | null;
  priority?: number;
  is_active?: boolean;
  match_type: 'keyword_body' | 'client_tag' | 'client_new' | 'client_existing';
  pattern: string;
  action: 'set_queue' | 'set_team' | 'set_priority' | 'assign_user';
  target_queue_id?: string | null;
  target_team_id?: string | null;
  target_user_id?: string | null;
  priority_value?: string | null;
};

export type ChatQueueRowDto = {
  id: string;
  tenant_id?: string;
  name: string;
  description?: string | null;
  color?: string | null;
  is_active: boolean;
  sla_first_response_minutes?: number | null;
  sla_next_response_minutes?: number | null;
  created_at?: string;
  updated_at?: string;
};

export type ChatOperationsDashboardDto = {
  summary: {
    open: number;
    pending: number;
    in_progress: number;
    waiting_customer: number;
    closed_today: number;
    sla_at_risk: number;
    sla_breached: number;
    avg_first_response_sec: number | null;
    avg_next_reply_sec: number | null;
  };
  sla_context: {
    risk_percent: number;
    tenant_first_minutes: number | null;
    tenant_next_minutes: number | null;
  };
  by_queue: Array<{
    queue_id: string;
    name: string;
    open_count: number;
    sla_first_minutes: number | null;
    sla_next_minutes: number | null;
  }>;
  by_assignee: Array<unknown>;
  attendees: Array<{
    user_id: string;
    display: string;
    presence: 'online' | 'offline';
    in_progress: number;
    delayed: number;
    avg_first_response_sec: number | null;
  }>;
  automation_logs?: Array<ChatAutomationLogDto>;
};

export type ChatAutomationLogDto = {
  id: string;
  conversation_id: string;
  rule_id: string | null;
  event_type: string;
  action_type: string;
  result: string;
  error_message: string | null;
  metadata?: unknown;
  created_at: string;
};

export type ChatQueueDistributionRowDto = {
  queue_id: string;
  queue_name: string;
  distribution_row_id: string | null;
  team_id: string | null;
  strategy: string | null;
  auto_assign: boolean | null;
  distribution_updated_at?: string | null;
};

/** Fase 8 — chatbot básico (`chat_bot_rules`). */
export type ChatBotRuleDto = {
  id: string;
  tenant_id: string;
  name: string;
  type: 'welcome_message' | 'out_of_hours' | 'menu' | 'keyword';
  is_active: boolean;
  trigger_config: Record<string, unknown>;
  action_config: Record<string, unknown>;
  priority: number;
};

export type ChatBotRuleInput = {
  name: string;
  type: ChatBotRuleDto['type'];
  is_active?: boolean;
  trigger_config?: Record<string, unknown>;
  action_config?: Record<string, unknown>;
  priority?: number;
};

export const chatService = {
  async listInstances(): Promise<ChatInstance[]> {
    const response = await apiClient.get<ChatInstance[]>('/api/chat/instances');
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data || [];
  },

  async patchInstance(id: string, payload: { enabledInChat: boolean }) {
    const response = await apiClient.patch<ChatInstance>(`/api/chat/instances/${id}`, payload);
    if (response.error) {
      throw new Error(response.error);
    }
    if (!response.data) {
      throw new Error('Falha ao atualizar instância');
    }
    return response.data;
  },

  async createInstance(payload: { name: string; metadata?: Record<string, unknown> }) {
    const response = await apiClient.post<ChatInstance>('/api/chat/instances', payload);
    if (response.error) {
      throw new Error(response.error);
    }
    if (!response.data) {
      throw new Error('Falha ao criar instância');
    }
    return response.data;
  },

  async connectInstance(
    id: string,
    data?: {
      phone?: string;
      sync_on_connect?: boolean;
      sync_mode?: InstanceSyncMode;
      reset_chat_history?: boolean;
    }
  ) {
    const response = await apiClient.post(`/api/chat/instances/${id}/connect`, data || {});
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data;
  },

  async getInstanceStatus(id: string) {
    const response = await apiClient.get(`/api/chat/instances/${id}/status`);
    if (response.error) {
      const suffix = response.hint ? ` ${response.hint}` : '';
      throw new Error(`${response.error}${suffix}`);
    }
    return response.data;
  },

  async configureWebhook(id: string, data?: Record<string, unknown>) {
    const response = await apiClient.post(`/api/chat/instances/${id}/webhook`, data || {});
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data;
  },

  async syncConversations(instanceId: string, options?: { limit?: number; syncMode?: InstanceSyncMode }) {
    const response = await apiClient.post('/api/chat/conversations/sync', {
      instanceId,
      limit: options?.limit,
      ...(options?.syncMode ? { syncMode: options.syncMode } : {}),
    });
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data;
  },

  async getConversations(filters?: {
    instanceId?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
    /** Etapa 5: `tenant` = inbox do tenant; padrão `owner` */
    inboxScope?: 'owner' | 'tenant';
    /** `queue` = fila operacional (Etapa 5); `queued` aceite por compatibilidade */
    attendanceFilter?: 'mine' | 'unassigned' | 'queue' | 'queued' | 'closed' | 'team' | 'waiting';
  }) {
    const params = new URLSearchParams();
    if (filters?.instanceId) params.append('instanceId', filters.instanceId);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.inboxScope) params.append('inboxScope', filters.inboxScope);
    if (filters?.attendanceFilter) {
      const af =
        filters.attendanceFilter === 'queued' ? 'queue' : filters.attendanceFilter;
      params.append('attendanceFilter', af);
    }
    const chatListDiag =
      import.meta.env.DEV || import.meta.env.VITE_CHAT_LIST_DIAG === '1';
    if (chatListDiag) params.append('diag', '1');

    const url = `/api/chat/conversations${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await apiClient.get<ChatConversation[]>(url);
    if (response.error) {
      throw new Error(response.error);
    }
    return (response.data || []).map(normalizeConversation);
  },

  /** Etapa 5 — contagens por filtro (mesmo escopo que a listagem). */
  async getConversationAttendanceCounts(filters: {
    instanceIds: string[];
    inboxScope?: 'owner' | 'tenant';
  }): Promise<{
    queue: number;
    team: number;
    mine: number;
    unassigned: number;
    closed: number;
    unread: number;
  }> {
    const params = new URLSearchParams();
    params.set('instanceIds', filters.instanceIds.join(','));
    if (filters.inboxScope) params.append('inboxScope', filters.inboxScope);
    const response = await apiClient.get<{
      queue: number;
      mine: number;
      team: number;
      unassigned: number;
      closed: number;
      unread: number;
    }>(`/api/chat/conversations/attendance-counts?${params.toString()}`);
    if (response.error) {
      throw new Error(response.error);
    }
    const d = response.data;
    return {
      queue: d?.queue ?? 0,
      mine: d?.mine ?? 0,
      team: d?.team ?? 0,
      unassigned: d?.unassigned ?? 0,
      closed: d?.closed ?? 0,
      unread: d?.unread ?? 0,
    };
  },

  /** Transferir para operador (`toUserId`) ou para fila de equipe (`toTeamId`). */
  async transferConversation(
    conversationId: string,
    body: { toUserId: string; reason?: string } | { toTeamId: string; reason?: string }
  ) {
    const response = await apiClient.post<{
      ok: boolean;
      conversation?: Record<string, unknown>;
    }>(`/api/chat/conversations/${conversationId}/transfer`, body);
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data;
  },

  /** Etapa 5 — assume atendimento (atómico no servidor). */
  async attendConversation(conversationId: string, body?: { reason?: string }) {
    const response = await apiClient.post<{
      ok: boolean;
      conversation?: Record<string, unknown>;
    }>(`/api/chat/conversations/${conversationId}/attend`, body ?? {});
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data;
  },

  /** Etapa 5 — fila / encerrar / desatribuir / reatribuir. */
  async patchConversationAttendance(
    conversationId: string,
    body:
      | { action: 'queue'; queueId?: string | null; reason?: string }
      | { action: 'close'; reason?: string }
      | { action: 'unassign'; reason?: string }
      | { action: 'reassign'; toUserId: string; reason?: string }
      | { action: 'reassign_team'; toTeamId: string; reason?: string }
  ) {
    const response = await apiClient.patch<{
      ok: boolean;
      conversation?: Record<string, unknown>;
    }>(`/api/chat/conversations/${conversationId}/attendance`, body);
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data;
  },

  async getConversationMessages(conversationId: string) {
    const response = await apiClient.get<ChatMessage[]>(`/api/chat/conversations/${conversationId}/messages`);
    if (response.error) {
      throw new Error(response.error);
    }
    return (response.data || []).map(normalizeChatMessage);
  },

  async syncConversationMessages(
    conversationId: string,
    options?: {
      limit?: number;
      syncMode?: InstanceSyncMode;
      force?: boolean;
      /** Histórico amplo (respeita sync_mode da instância se não enviar syncMode). Omitido = sync leve no backend. */
      fullHistory?: boolean;
    }
  ): Promise<{
    synced?: number;
    totalReturned?: number;
    skipped?: boolean;
    reason?: string;
    sync_trigger_source?: string;
    identity_refresh_skipped?: boolean;
    skipped_existing_remote?: number;
    conversation?: ChatConversation;
    chat_sync_summary?: {
      messages_requested?: number;
      messages_returned?: number;
      messages_saved?: number;
      messages_skipped_existing?: number;
      identity_refreshed?: boolean;
      identity_skipped_cooldown?: boolean;
      contacts_called?: number;
      chat_find_called?: number;
      refresh_identity_endpoint_called?: boolean;
      duration_ms?: number;
    };
    [key: string]: unknown;
  }> {
    const response = await apiClient.post(`/api/chat/conversations/${conversationId}/messages/sync`, {
      limit: options?.limit,
      ...(options?.syncMode ? { syncMode: options.syncMode } : {}),
      ...(options?.force === true ? { force: true } : {}),
      ...(options?.fullHistory === true ? { fullHistory: true } : {}),
    });
    if (response.error) {
      throw new Error(response.error);
    }
    const raw = (response.data ?? {}) as Record<string, unknown>;
    const convRaw = raw.conversation;
    return {
      ...raw,
      conversation:
        convRaw && typeof convRaw === 'object'
          ? normalizeConversation(convRaw)
          : undefined,
    } as {
      synced?: number;
      totalReturned?: number;
      skipped?: boolean;
      reason?: string;
      sync_trigger_source?: string;
      identity_refresh_skipped?: boolean;
      skipped_existing_remote?: number;
      conversation?: ChatConversation;
      chat_sync_summary?: {
        messages_requested?: number;
        messages_returned?: number;
        messages_saved?: number;
        messages_skipped_existing?: number;
        identity_refreshed?: boolean;
        identity_skipped_cooldown?: boolean;
        contacts_called?: number;
        chat_find_called?: number;
        refresh_identity_endpoint_called?: boolean;
        duration_ms?: number;
      };
      [key: string]: unknown;
    };
  },

  /** Busca na UazAPI o chat por wa_chatid e reaplica upsert (nome, foto, metadata). Não sincroniza mensagens. */
  async refreshConversationIdentity(conversationId: string): Promise<{
    ok: boolean;
    updated: boolean;
    reason?: string;
    conversation?: ChatConversation;
  }> {
    const response = await apiClient.post<{
      ok: boolean;
      updated: boolean;
      reason?: string;
      conversation?: Record<string, unknown>;
    }>(`/api/chat/conversations/${conversationId}/refresh-identity`);
    if (response.error) {
      throw new Error(response.error);
    }
    const data = response.data;
    if (!data) {
      throw new Error('Resposta vazia ao atualizar contato');
    }
    return {
      ...data,
      conversation: data.conversation ? normalizeConversation(data.conversation) : undefined,
    };
  },

  async sendMessage(conversationId: string, text: string) {
    const response = await apiClient.post(`/api/chat/messages`, {
      conversationId,
      text,
    });
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data;
  },

  /** Agenda + Meet: cria compromisso imediato e envia link no WhatsApp (quando disponível). */
  async createMeetNowFromChat(
    conversationId: string,
    body?: { duration_minutes?: number; title?: string },
  ): Promise<{
    appointment: Record<string, unknown>;
    meet_link: string | null;
    message_sent: boolean;
    message_error: string | null;
    warnings?: string[];
  }> {
    const response = await apiClient.post<{
      appointment: Record<string, unknown>;
      meet_link: string | null;
      message_sent: boolean;
      message_error: string | null;
      warnings?: string[];
    }>(`/api/chat/conversations/${conversationId}/create-meet-now`, body ?? {});
    if (response.error) {
      throw new Error(response.error);
    }
    if (!response.data) {
      throw new Error('Resposta vazia');
    }
    return response.data;
  },

  /** Agenda: agendamento futuro com confirmação opcional no chat. */
  async scheduleAppointmentFromChat(
    conversationId: string,
    body: {
      title: string;
      starts_at: string;
      ends_at: string;
      type?: string;
      description?: string | null;
      create_google_event?: boolean;
      create_meet?: boolean;
      send_chat_confirmation?: boolean;
    },
  ): Promise<{
    appointment: Record<string, unknown>;
    meet_link: string | null;
    message_sent: boolean;
    message_error: string | null;
    warnings?: string[];
  }> {
    const response = await apiClient.post<{
      appointment: Record<string, unknown>;
      meet_link: string | null;
      message_sent: boolean;
      message_error: string | null;
      warnings?: string[];
    }>(`/api/chat/conversations/${conversationId}/schedule-appointment`, body);
    if (response.error) {
      throw new Error(response.error);
    }
    if (!response.data) {
      throw new Error('Resposta vazia');
    }
    return response.data;
  },

  /** Imagem via UazAPI `/send/media` (base64 ou URL). Legenda opcional. */
  async sendImageMessage(
    conversationId: string,
    opts: { fileBase64: string; mimeType: string; caption?: string }
  ) {
    const response = await apiClient.post(`/api/chat/messages`, {
      conversationId,
      type: 'image',
      fileBase64: opts.fileBase64,
      mimeType: opts.mimeType,
      ...(opts.caption?.trim() ? { caption: opts.caption.trim() } : {}),
    });
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data;
  },

  /** Documento/PDF via `/send/media` (base64 ou URL). Texto opcional como legenda. */
  async sendDocumentMessage(
    conversationId: string,
    opts: { fileBase64: string; mimeType: string; caption?: string; fileName?: string },
  ) {
    const response = await apiClient.post(`/api/chat/messages`, {
      conversationId,
      type: 'document',
      fileBase64: opts.fileBase64,
      mimeType: opts.mimeType,
      ...(opts.fileName?.trim() ? { fileName: opts.fileName.trim() } : {}),
      ...(opts.caption?.trim() ? { caption: opts.caption.trim() } : {}),
    });
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data;
  },

  async markConversationRead(conversationId: string, read = true) {
    const response = await apiClient.post(`/api/chat/conversations/${conversationId}/mark-read`, {
      read,
    });
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data;
  },

  async linkConversation(
    conversationId: string,
    payload: { type: 'client' | 'lead'; id: string }
  ): Promise<ChatConversation> {
    const response = await apiClient.post<ChatConversation>(
      `/api/chat/conversations/${conversationId}/link`,
      payload
    );
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Falha ao vincular conversa');
    return normalizeConversation(response.data);
  },

  async unlinkConversation(conversationId: string): Promise<ChatConversation> {
    const response = await apiClient.delete<ChatConversation>(`/api/chat/conversations/${conversationId}/link`);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Falha ao remover vínculo');
    return normalizeConversation(response.data);
  },

  async deleteInstance(id: string) {
    const response = await apiClient.delete(`/api/chat/instances/${id}`);
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data;
  },

  async getConversationProfile(conversationId: string): Promise<ConversationProfile> {
    const response = await apiClient.get<ConversationProfile>(`/api/chat/conversations/${conversationId}/profile`);
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data || { type: null, profile: null };
  },

  async getClientMessages(clientId: string): Promise<{ messages: ChatMessage[]; conversationId: string | null; conversationIds: string[] }> {
    const response = await apiClient.get<{ messages: ChatMessage[]; conversationId: string | null; conversationIds: string[] }>(`/api/chat/clients/${clientId}/messages`);
    if (response.error) {
      throw new Error(response.error);
    }
    const data = response.data || { messages: [], conversationId: null, conversationIds: [] };
    return {
      messages: (data.messages || []).map(normalizeChatMessage),
      conversationId: data.conversationId || null,
      conversationIds: data.conversationIds || [],
    };
  },

  /** Foto WhatsApp da conversa vinculada (metadata); não persiste no CRM. */
  async getCrmWhatsappIdentity(params: { clientId?: string; leadId?: string }): Promise<{ avatarUrl: string | null }> {
    const q = new URLSearchParams();
    if (params.clientId) q.set('clientId', params.clientId);
    if (params.leadId) q.set('leadId', params.leadId);
    const response = await apiClient.get<{ avatarUrl: string | null }>(`/api/chat/crm-whatsapp-identity?${q.toString()}`);
    if (response.error) {
      throw new Error(response.error);
    }
    const data = response.data || { avatarUrl: null };
    return { avatarUrl: chatAvatarUrlForImgSrc(data.avatarUrl) };
  },

  /** Fase 6 — métricas operacionais */
  async getMetrics(): Promise<ChatOperationalMetrics> {
    const response = await apiClient.get<ChatOperationalMetrics>('/api/chat/metrics');
    if (response.error) throw new Error(response.error);
    return (
      response.data ?? {
        open_total: 0,
        pending_attendance: 0,
        in_progress: 0,
        closed_today: 0,
        avg_first_response_sec: null,
        avg_next_reply_sec: null,
        by_queue: [],
        by_queue_active: [],
        by_assignee: [],
        by_assignee_active: [],
      }
    );
  },

  /** Fase 7 — painel operacional (mesmo payload que o cartão «Atendimento» no Chat). */
  async getOperationsDashboard(): Promise<ChatOperationsDashboardDto> {
    const response = await apiClient.get<ChatOperationsDashboardDto>('/api/chat/operations-dashboard');
    if (response.error) throw new Error(response.error);
    return (
      response.data ?? {
        summary: {
          open: 0,
          pending: 0,
          in_progress: 0,
          waiting_customer: 0,
          closed_today: 0,
          sla_at_risk: 0,
          sla_breached: 0,
          avg_first_response_sec: null,
          avg_next_reply_sec: null,
        },
        sla_context: { risk_percent: 80, tenant_first_minutes: null, tenant_next_minutes: null },
        by_queue: [],
        by_assignee: [],
        attendees: [],
        automation_logs: [],
      }
    );
  },

  async listQueues(): Promise<{ items: ChatQueueRowDto[] }> {
    const response = await apiClient.get<{ items: ChatQueueRowDto[] }>('/api/chat/queues');
    if (response.error) throw new Error(response.error);
    return response.data ?? { items: [] };
  },

  async createQueue(payload: {
    name: string;
    description?: string | null;
    color?: string | null;
  }): Promise<ChatQueueRowDto> {
    const response = await apiClient.post<ChatQueueRowDto>('/api/chat/queues', payload);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Falha ao criar fila');
    return response.data;
  },

  async patchQueue(
    id: string,
    patch: Partial<{
      name: string;
      description: string | null;
      color: string | null;
      is_active: boolean;
      sla_first_response_minutes: number | null;
      sla_next_response_minutes: number | null;
    }>,
  ): Promise<ChatQueueRowDto> {
    const response = await apiClient.patch<ChatQueueRowDto>(`/api/chat/queues/${id}`, patch);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Falha ao atualizar fila');
    return response.data;
  },

  async getAutomationSettings(): Promise<ChatAutomationSettingsDto> {
    const response = await apiClient.get<ChatAutomationSettingsDto>('/api/chat/automation/settings');
    if (response.error) throw new Error(response.error);
    return response.data as ChatAutomationSettingsDto;
  },

  async patchAutomationSettings(patch: Partial<ChatAutomationSettingsDto>): Promise<ChatAutomationSettingsDto> {
    const response = await apiClient.patch<ChatAutomationSettingsDto>('/api/chat/automation/settings', patch);
    if (response.error) throw new Error(response.error);
    return response.data as ChatAutomationSettingsDto;
  },

  async listAutomationRules(): Promise<{ items: ChatAutomationRuleDto[] }> {
    const response = await apiClient.get<{ items: ChatAutomationRuleDto[] }>('/api/chat/automation/rules');
    if (response.error) throw new Error(response.error);
    return response.data ?? { items: [] };
  },

  async createAutomationRule(body: ChatAutomationRuleInput): Promise<ChatAutomationRuleDto> {
    const response = await apiClient.post<ChatAutomationRuleDto>('/api/chat/automation/rules', body);
    if (response.error) throw new Error(response.error);
    return response.data as ChatAutomationRuleDto;
  },

  async patchAutomationRule(id: string, patch: Partial<ChatAutomationRuleInput>): Promise<ChatAutomationRuleDto> {
    const response = await apiClient.patch<ChatAutomationRuleDto>(`/api/chat/automation/rules/${id}`, patch);
    if (response.error) throw new Error(response.error);
    return response.data as ChatAutomationRuleDto;
  },

  async listAutomationLogs(limit = 40): Promise<{ items: ChatAutomationLogDto[] }> {
    const response = await apiClient.get<{ items: ChatAutomationLogDto[] }>(
      `/api/chat/automation/logs?limit=${encodeURIComponent(String(limit))}`,
    );
    if (response.error) throw new Error(response.error);
    return response.data ?? { items: [] };
  },

  async deleteAutomationRule(id: string): Promise<void> {
    const response = await apiClient.delete(`/api/chat/automation/rules/${id}`);
    if (response.error) throw new Error(response.error);
  },

  async listQueueDistribution(): Promise<{ items: ChatQueueDistributionRowDto[] }> {
    const response = await apiClient.get<{ items: ChatQueueDistributionRowDto[] }>(
      '/api/chat/automation/queue-distribution'
    );
    if (response.error) throw new Error(response.error);
    return response.data ?? { items: [] };
  },

  async putQueueDistribution(
    queueId: string,
    body: { team_id: string | null; strategy: 'none' | 'round_robin' | 'least_open'; auto_assign: boolean }
  ): Promise<unknown> {
    const response = await apiClient.put(`/api/chat/automation/queues/${queueId}/distribution`, body);
    if (response.error) throw new Error(response.error);
    return response.data;
  },

  async listBotRules(): Promise<{ items: ChatBotRuleDto[] }> {
    const response = await apiClient.get<{ items: ChatBotRuleDto[] }>('/api/chat/bot-rules');
    if (response.error) throw new Error(response.error);
    return response.data ?? { items: [] };
  },

  async createBotRule(body: ChatBotRuleInput): Promise<ChatBotRuleDto> {
    const response = await apiClient.post<ChatBotRuleDto>('/api/chat/bot-rules', body);
    if (response.error) throw new Error(response.error);
    return response.data as ChatBotRuleDto;
  },

  async patchBotRule(id: string, patch: Partial<ChatBotRuleInput>): Promise<ChatBotRuleDto> {
    const response = await apiClient.patch<ChatBotRuleDto>(`/api/chat/bot-rules/${id}`, patch);
    if (response.error) throw new Error(response.error);
    return response.data as ChatBotRuleDto;
  },

  async deleteBotRule(id: string): Promise<void> {
    const response = await apiClient.delete(`/api/chat/bot-rules/${id}`);
    if (response.error) throw new Error(response.error);
  },
};



