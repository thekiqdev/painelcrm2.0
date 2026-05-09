import { apiClient, getApiUrl } from '@/integrations/api/client';
import type { CommunicationProvider } from '@/types/communication';
import { DEFAULT_COMMUNICATION_PROVIDER } from '@/types/communication';
import {
  chatAvatarUrlForImgSrc,
  pickConversationAvatarRawForDisplay,
} from '@/lib/chatAvatarUrl';
import { chatAvatarDebugLog } from '@/lib/chatAvatarDebug';
import { DEFAULT_CHAT_TAG_COLOR, normalizeHexColor } from '@/lib/chatKanbanTagStyle';

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
  webhook_secret_last_seen_at?: string | null;
  webhook_needs_reconfiguration?: boolean;
}

export type ChatInstanceWebhookStatusResponse = {
  instanceId: string;
  webhookStatus?: {
    has_secret: boolean;
    needs_reconfiguration: boolean;
    last_seen_at: string | null;
  };
  database?: Record<string, unknown> | null;
  uazapi?: unknown;
  synced?: boolean;
};

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

/** Tipo de conversa multicanal (Fase 2 grupos WhatsApp). */
export type ChatConversationType = 'direct' | 'group' | 'community';

/** Tag Kanban na conversa (cor vinda da API / listagem). */
export type ChatKanbanTagUi = {
  id: string;
  label: string;
  name?: string;
  color: string;
};

export function normalizeConversationTagsFromApi(raw: unknown): ChatKanbanTagUi[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return undefined;
  const out: ChatKanbanTagUi[] = [];
  for (const t of raw) {
    if (!t || typeof t !== 'object') continue;
    const o = t as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id : '';
    const label =
      typeof o.label === 'string' ? o.label : typeof o.name === 'string' ? o.name : '';
    if (!id || !label) continue;
    out.push({
      id,
      label,
      name: typeof o.name === 'string' ? o.name : label,
      color:
        typeof o.color === 'string' && o.color.trim() ? normalizeHexColor(o.color) : DEFAULT_CHAT_TAG_COLOR,
    });
  }
  return out;
}

/** Fase 3 — participante normalizado (UazAPI /group/info). */
export type ChatGroupParticipantRow = {
  jid: string;
  lid: string | null;
  phone: string | null;
  phoneDisplay: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  displayName: string | null;
  profilePicUrl: string | null;
};

/** Fase 3 — detalhes do grupo WhatsApp (painel administrativo). */
export type ChatGroupDetails = {
  jid: string;
  name: string;
  topic: string | null;
  ownerJid: string | null;
  profilePicUrl: string | null;
  isLocked: boolean;
  isAnnounce: boolean;
  isJoinApprovalRequired: boolean;
  memberAddMode: string | null;
  isEphemeral: boolean | null;
  disappearingTimer: number | null;
  ownerIsAdmin: boolean;
  ownerCanSendMessage: boolean | null;
  inviteLink: string | null;
  participantCount: number;
  participants: ChatGroupParticipantRow[];
};

export type ChatGroupParticipantProfileSyncStatus = 'synced' | 'not_found' | 'failed';

export type ChatGroupParticipantProfileSyncResult = {
  participantJid: string;
  phone: string | null;
  displayName: string | null;
  participantAvatarUrl: string | null;
  profilePicUrl: string | null;
  directConversationId: string | null;
  status: ChatGroupParticipantProfileSyncStatus;
  reason?: string | null;
  participant?: ChatGroupParticipantRow | null;
};

export interface ChatConversation {
  id: string;
  user_id: string;
  /** Ausente nas conversas WhatsApp Cloud API (Meta). */
  instance_id?: string | null;
  whatsapp_official_account_id?: string | null;
  /** Canal lógico (Chat Engine multicanal). */
  provider?: CommunicationProvider | string | null;
  instance_name?: string;
  client_id?: string | null;
  leadId?: string | null;
  lead_status?: string | null;
  external_chat_id: string;
  /** Backend `conversation_type` (grupo vs 1:1). */
  conversation_type?: ChatConversationType | null;
  contactName?: string | null;
  profileName?: string | null;
  phoneNumber?: string | null;
  /**
   * URL efetiva para UI (prioridade: coluna `avatar_url` da API → metadata Uaz).
   */
  avatarUrl?: string | null;
  /** Espelho opcional da coluna/API `avatar_url` (valor bruto do payload; pode ser CDN). */
  avatar_url?: string | null;
  /** Foto do registo `communication_contacts` (quando a API expõe separado da coluna da conversa). */
  communication_avatar_url?: string | null;
  /** Resolução explícita da API (`conversationRowForClientApi`). */
  final_avatar_url?: string | null;
  avatar_cached_url?: string | null;
  client_whatsapp_avatar_cached_url?: string | null;
  lead_whatsapp_avatar_cached_url?: string | null;
  communication_avatar_cached_url?: string | null;
  client_whatsapp_avatar_url?: string | null;
  lead_whatsapp_avatar_url?: string | null;
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
  /** Foto do operador (profiles.avatar_url ou users.avatar_url), quando exposta pela API. */
  assignee_avatar_url?: string | null;
  /** Fase 5 SLA — quando exposto pela API */
  first_response_at?: string | null;
  last_customer_message_at?: string | null;
  last_agent_message_at?: string | null;
  /** Tags Kanban resolvidas (listagem / realtime). */
  tags?: ChatKanbanTagUi[];
}

/** Preferir `conversation.tags`; senão metadata.kanban_tags (legacy). */
export function resolveChatKanbanTagsForUi(conversation: ChatConversation | null | undefined): ChatKanbanTagUi[] {
  if (!conversation) return [];
  const fromApi = normalizeConversationTagsFromApi(conversation.tags as unknown);
  if (fromApi !== undefined) return fromApi;
  const m = conversation.metadata;
  if (!m || typeof m !== 'object') return [];
  const arr = (m as Record<string, unknown>).kanban_tags;
  if (!Array.isArray(arr)) return [];
  const out: ChatKanbanTagUi[] = [];
  for (const t of arr) {
    if (typeof t === 'string') {
      const label = t.trim();
      if (!label) continue;
      out.push({ id: `legacy:${label}`, label, color: DEFAULT_CHAT_TAG_COLOR });
    } else if (t && typeof t === 'object') {
      const o = t as Record<string, unknown>;
      const id = typeof o.id === 'string' ? o.id : '';
      const label =
        typeof o.label === 'string' ? o.label : typeof o.name === 'string' ? o.name : '';
      if (!label && !id) continue;
      out.push({
        id: id || `legacy:${label}`,
        label: label || id,
        color:
          typeof o.color === 'string' && o.color.trim() ? normalizeHexColor(o.color) : DEFAULT_CHAT_TAG_COLOR,
      });
    }
  }
  return out;
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

/** Comentário interno na mensagem (equipa; não vai ao WhatsApp). */
export type ChatInternalComment = {
  id: string;
  author_user_id: string;
  comment_text: string;
  created_at: string;
  author_email?: string | null;
  author_display?: string | null;
};

export interface ChatMessage {
  id: string;
  conversation_id: string;
  direction: 'incoming' | 'outgoing';
  /** Idempotência / fila no cliente (espelha coluna `client_message_id` quando existir). */
  client_message_id?: string | null;
  external_message_id?: string | null;
  body?: string | null;
  status?: string | null;
  sentAt?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  /** JSONB no Postgres — lista de mídia normalizada */
  media?: ChatMediaItem[] | null;
  message_contract?: ChatMessageContract | null;
  /** Citação / resposta (WhatsApp reply) */
  reply_to_message_id?: string | null;
  reply_to_external_message_id?: string | null;
  reply_preview?: string | null;
  reply_sender_name?: string | null;
  reply_message_type?: string | null;
  /** Comentários internos (não enviados ao WhatsApp) */
  internal_comment_count?: number;
  internal_comments?: ChatInternalComment[];
}

export function normalizeInternalComment(raw: unknown): ChatInternalComment | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string') return null;
  const createdRaw = o.created_at;
  const created =
    typeof createdRaw === 'string'
      ? createdRaw
      : createdRaw instanceof Date
        ? createdRaw.toISOString()
        : String(createdRaw ?? '');
  return {
    id: o.id,
    author_user_id: String(o.author_user_id ?? ''),
    comment_text: String(o.comment_text ?? ''),
    created_at: created,
    author_email: o.author_email != null ? String(o.author_email) : null,
    author_display: o.author_display != null ? String(o.author_display) : null,
  };
}

function parseInternalCommentsFromApi(raw: unknown): ChatInternalComment[] {
  if (raw == null) return [];
  let v: unknown = raw;
  if (typeof raw === 'string') {
    try {
      v = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) return [];
  return v.map(normalizeInternalComment).filter((x): x is ChatInternalComment => x != null);
}

/** Normaliza linha de conversa (REST ou WebSocket) sem descartar campos canônicos de identidade. */
export function normalizeConversation(raw: any): ChatConversation {
  const metadata = raw?.metadata || {};

  const trimStr = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  const avatarColumn = trimStr(raw?.avatar_url);
  const communicationAvatarColumn = trimStr(raw?.communication_avatar_url);
  const rowForPick: Record<string, unknown> = {
    final_avatar_url: raw?.final_avatar_url,
    avatar_cached_url: raw?.avatar_cached_url,
    client_whatsapp_avatar_cached_url: raw?.client_whatsapp_avatar_cached_url,
    lead_whatsapp_avatar_cached_url: raw?.lead_whatsapp_avatar_cached_url,
    communication_avatar_cached_url: raw?.communication_avatar_cached_url,
    communication_avatar_url: raw?.communication_avatar_url,
    avatar_url: raw?.avatar_url,
    client_whatsapp_avatar_url: raw?.client_whatsapp_avatar_url,
    lead_whatsapp_avatar_url: raw?.lead_whatsapp_avatar_url,
    image: raw?.image,
    image_preview: raw?.image_preview,
    imagePreview: raw?.imagePreview,
  };
  const metaObj = (metadata && typeof metadata === 'object' ? metadata : {}) as Record<string, unknown>;

  const avatarMerged =
    pickConversationAvatarRawForDisplay(rowForPick, metaObj) ||
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

  const asIso = (v: unknown): string | null => {
    if (v == null) return null;
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
    return null;
  };
  /** Lista: última mensagem real (API); não usar updated_at. */
  const listLastActivityAt =
    asIso(raw?.effective_last_message_at) ??
    asIso(raw?.effective_last_activity_at) ??
    asIso(raw?.last_message_at);

  const normalizedTags = normalizeConversationTagsFromApi(raw?.tags);

  return {
    id: raw.id,
    user_id: raw.user_id,
    instance_id: raw.instance_id ?? null,
    whatsapp_official_account_id: raw.whatsapp_official_account_id ?? null,
    provider:
      typeof raw.provider === 'string' && raw.provider.trim()
        ? (raw.provider as CommunicationProvider)
        : DEFAULT_COMMUNICATION_PROVIDER,
    instance_name: raw.instance_name,
    client_id: raw.client_id ?? null,
    leadId: raw.lead_id ?? null,
    lead_status: raw.lead_status ?? null,
    external_chat_id: raw.external_chat_id,
    conversation_type: (raw.conversation_type as ChatConversationType | undefined) ?? null,
    contactName: raw.contact_name ?? null,
    profileName: raw.profile_name ?? null,
    phoneNumber: raw.phone_number ?? null,
    avatarUrl,
    avatar_url: avatarColumn,
    final_avatar_url: trimStr(raw?.final_avatar_url),
    avatar_cached_url: trimStr(raw?.avatar_cached_url),
    client_whatsapp_avatar_cached_url: trimStr(raw?.client_whatsapp_avatar_cached_url),
    lead_whatsapp_avatar_cached_url: trimStr(raw?.lead_whatsapp_avatar_cached_url),
    communication_avatar_cached_url: trimStr(raw?.communication_avatar_cached_url),
    client_whatsapp_avatar_url: trimStr(raw?.client_whatsapp_avatar_url),
    lead_whatsapp_avatar_url: trimStr(raw?.lead_whatsapp_avatar_url),
    communication_avatar_url: communicationAvatarColumn,
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
    lastMessageAt: listLastActivityAt,
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
    assignee_avatar_url: trimStr(raw?.assignee_avatar_url),
    first_response_at: raw.first_response_at ?? null,
    last_customer_message_at: raw.last_customer_message_at ?? null,
    last_agent_message_at: raw.last_agent_message_at ?? null,
    ...(normalizedTags !== undefined ? { tags: normalizedTags } : {}),
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

/** Prefixo "Nome: " para bolhas de grupo (metadata persistida no backend). */
export function groupMessageSenderPrefix(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  const name = m.sender_name;
  if (typeof name === 'string' && name.trim()) return name.trim();
  const jid = m.sender_jid ?? m.participant;
  if (typeof jid === 'string' && jid.includes('@')) {
    const local = jid.split('@')[0] || '';
    if (/^\d{10,15}$/.test(local)) return local;
    return local.length > 0 ? local.slice(0, 14) : null;
  }
  return null;
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
      const base = getApiUrl().replace(/\/$/, '');
      return base ? `${base}${raw}` : raw;
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
  const icc = raw.internal_comment_count;
  const internal_comments = parseInternalCommentsFromApi(raw.internal_comments);
  const countFromScalar =
    typeof icc === 'number' ? icc : icc != null ? Math.max(0, Math.floor(Number(icc)) || 0) : undefined;
  const internal_comment_count =
    internal_comments.length > 0 ? internal_comments.length : countFromScalar ?? 0;
  const meta = raw.metadata && typeof raw.metadata === 'object' ? (raw.metadata as Record<string, unknown>) : null;
  const clientFromMeta =
    meta && typeof meta.client_message_id === 'string' ? meta.client_message_id : null;
  return {
    id: raw.id,
    conversation_id: raw.conversation_id,
    direction: raw.direction === 'outgoing' ? 'outgoing' : 'incoming',
    client_message_id: raw.client_message_id ?? clientFromMeta ?? null,
    external_message_id: raw.external_message_id ?? null,
    body: coerceChatPlainText(raw.body) || null,
    status: raw.status ?? null,
    sentAt: raw.sent_at ?? raw.created_at ?? null,
    metadata: raw.metadata ?? null,
    created_at: raw.created_at,
    media: sanitizeMediaItems(parseMediaField(raw.media)),
    message_contract: sanitizeMessageContract(contract),
    reply_to_message_id: raw.reply_to_message_id ?? null,
    reply_to_external_message_id: raw.reply_to_external_message_id ?? null,
    reply_preview: raw.reply_preview ?? null,
    reply_sender_name: raw.reply_sender_name ?? null,
    reply_message_type: raw.reply_message_type ?? null,
    internal_comment_count,
    ...(internal_comments.length > 0 ? { internal_comments } : {}),
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

  async retryInitialInstanceSync(id: string) {
    const response = await apiClient.post<{ ok?: boolean; skipped?: boolean; reason?: string }>(
      `/api/chat/instances/${id}/initial-sync/retry`,
      {}
    );
    if (response.error) throw new Error(response.error);
    return response.data ?? {};
  },

  async configureWebhook(id: string, data?: Record<string, unknown>) {
    const response = await apiClient.post(`/api/chat/instances/${id}/webhook`, data || {});
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data;
  },

  async getInstanceWebhook(id: string): Promise<ChatInstanceWebhookStatusResponse> {
    const response = await apiClient.get<ChatInstanceWebhookStatusResponse>(`/api/chat/instances/${id}/webhook`);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Resposta inválida');
    return response.data;
  },

  async reconfigureInstanceWebhook(id: string): Promise<Record<string, unknown>> {
    const response = await apiClient.post<Record<string, unknown>>(`/api/chat/instances/${id}/webhook/reconfigure`, {});
    if (response.error) throw new Error(response.error);
    return response.data ?? {};
  },

  async repairInstanceWebhook(id: string): Promise<Record<string, unknown>> {
    const response = await apiClient.post<Record<string, unknown>>(`/api/chat/instances/${id}/repair-webhook`, {});
    if (response.error) throw new Error(response.error);
    return response.data ?? {};
  },

  async rotateInstanceWebhookSecret(id: string): Promise<Record<string, unknown>> {
    const response = await apiClient.post<Record<string, unknown>>(`/api/chat/instances/${id}/webhook/rotate-secret`, {});
    if (response.error) throw new Error(response.error);
    return response.data ?? {};
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

  async getChatRuntimeConfig(): Promise<{ whatsappGroupsEnabled: boolean }> {
    const response = await apiClient.get<{ whatsappGroupsEnabled: boolean }>('/api/chat/runtime-config');
    if (response.error) throw new Error(response.error);
    return {
      whatsappGroupsEnabled: response.data?.whatsappGroupsEnabled !== false,
    };
  },

  async getConversationGroupDetails(
    conversationId: string,
    opts?: { refresh?: boolean },
  ): Promise<ChatGroupDetails> {
    const params = new URLSearchParams();
    if (opts?.refresh) params.set('refresh', '1');
    const q = params.toString();
    const response = await apiClient.get<{ group: ChatGroupDetails }>(
      `/api/chat/conversations/${conversationId}/group${q ? `?${q}` : ''}`,
    );
    if (response.error) throw new Error(response.error);
    if (!response.data?.group) throw new Error('Resposta inválida do servidor');
    return response.data.group;
  },

  async getConversationGroupParticipants(
    conversationId: string,
    opts?: { q?: string; refresh?: boolean },
  ): Promise<{ participants: ChatGroupParticipantRow[]; participantCount: number; ownerIsAdmin: boolean }> {
    const params = new URLSearchParams();
    if (opts?.q?.trim()) params.set('q', opts.q.trim());
    if (opts?.refresh) params.set('refresh', '1');
    const q = params.toString();
    const response = await apiClient.get<{
      participants: ChatGroupParticipantRow[];
      participantCount: number;
      ownerIsAdmin: boolean;
    }>(`/api/chat/conversations/${conversationId}/group/participants${q ? `?${q}` : ''}`);
    if (response.error) throw new Error(response.error);
    return {
      participants: response.data?.participants ?? [],
      participantCount: response.data?.participantCount ?? 0,
      ownerIsAdmin: response.data?.ownerIsAdmin === true,
    };
  },

  async postConversationGroupName(conversationId: string, name: string): Promise<ChatGroupDetails> {
    const response = await apiClient.post<{ ok: boolean; group: ChatGroupDetails }>(
      `/api/chat/conversations/${conversationId}/group/name`,
      { name },
    );
    if (response.error) throw new Error(response.error);
    if (!response.data?.group) throw new Error('Resposta inválida');
    return response.data.group;
  },

  async postConversationGroupDescription(conversationId: string, description: string): Promise<ChatGroupDetails> {
    const response = await apiClient.post<{ ok: boolean; group: ChatGroupDetails }>(
      `/api/chat/conversations/${conversationId}/group/description`,
      { description },
    );
    if (response.error) throw new Error(response.error);
    if (!response.data?.group) throw new Error('Resposta inválida');
    return response.data.group;
  },

  async postConversationGroupImage(conversationId: string, image: string): Promise<ChatGroupDetails> {
    const response = await apiClient.post<{ ok: boolean; group: ChatGroupDetails }>(
      `/api/chat/conversations/${conversationId}/group/image`,
      { image },
    );
    if (response.error) throw new Error(response.error);
    if (!response.data?.group) throw new Error('Resposta inválida');
    return response.data.group;
  },

  async postConversationGroupInviteReset(conversationId: string): Promise<ChatGroupDetails> {
    const response = await apiClient.post<{ ok: boolean; group: ChatGroupDetails }>(
      `/api/chat/conversations/${conversationId}/group/invite-reset`,
      {},
    );
    if (response.error) throw new Error(response.error);
    if (!response.data?.group) throw new Error('Resposta inválida');
    return response.data.group;
  },

  async postConversationGroupLeave(conversationId: string): Promise<void> {
    const response = await apiClient.post<{ ok: boolean }>(
      `/api/chat/conversations/${conversationId}/group/leave`,
      {},
    );
    if (response.error) throw new Error(response.error);
  },

  async postConversationGroupParticipants(
    conversationId: string,
    body: { action: 'add' | 'remove' | 'promote' | 'demote' | 'approve' | 'reject'; participants: string[] },
  ): Promise<ChatGroupDetails> {
    const response = await apiClient.post<{ ok: boolean; group: ChatGroupDetails }>(
      `/api/chat/conversations/${conversationId}/group/participants`,
      body,
    );
    if (response.error) throw new Error(response.error);
    if (!response.data?.group) throw new Error('Resposta inválida');
    return response.data.group;
  },

  async postConversationGroupSettings(
    conversationId: string,
    body: ChatGroupSettingsPayload,
  ): Promise<{ group: ChatGroupDetails; warnings: string[] }> {
    const response = await apiClient.post<{ ok: boolean; group: ChatGroupDetails; warnings?: string[] }>(
      `/api/chat/conversations/${conversationId}/group/settings`,
      body,
    );
    if (response.error) throw new Error(response.error);
    if (!response.data?.group) throw new Error('Resposta inválida');
    return {
      group: response.data.group,
      warnings: Array.isArray(response.data.warnings) ? response.data.warnings : [],
    };
  },

  async postConversationGroupParticipantSyncProfile(
    conversationId: string,
    participantJid: string,
  ): Promise<ChatGroupParticipantProfileSyncResult> {
    const enc = encodeURIComponent(participantJid);
    const response = await apiClient.post<ChatGroupParticipantProfileSyncResult>(
      `/api/chat/conversations/${conversationId}/group/participants/${enc}/sync-profile`,
      {},
    );
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Resposta inválida');
    return response.data;
  },

  async postConversationGroupParticipantsSyncMissing(
    conversationId: string,
    body?: { limit?: number },
  ): Promise<{ ok: boolean; processed: number; results: ChatGroupParticipantProfileSyncResult[] }> {
    const response = await apiClient.post<{
      ok: boolean;
      processed: number;
      results: ChatGroupParticipantProfileSyncResult[];
    }>(`/api/chat/conversations/${conversationId}/group/participants/sync-missing-profiles`, body ?? {});
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Resposta inválida');
    return response.data;
  },

  async getChatTenantUsersForGroup(): Promise<
    { id: string; email: string; display_name: string; whatsapp_digits: string | null }[]
  > {
    const response = await apiClient.get<{
      items: { id: string; email: string; display_name: string; whatsapp_digits: string | null }[];
    }>('/api/chat/tenant-users-for-group');
    if (response.error) throw new Error(response.error);
    return response.data?.items ?? [];
  },

  async postCreateGroupFromConversation(
    conversationId: string,
    body: {
      name: string;
      description?: string | null;
      participants: { phone: string; source: 'team' | 'client' | 'lead' | 'manual' }[];
      confirmDuplicate?: boolean;
    },
  ): Promise<ChatConversation> {
    const response = await apiClient.post<{ conversation: ChatConversation }>(
      `/api/chat/conversations/${conversationId}/group/create-from-conversation`,
      body,
    );
    if (response.error) {
      const err = new Error(response.error) as Error & {
        code?: string;
        status?: number;
        details?: unknown;
      };
      err.code = response.code;
      err.status = (response.details as { status?: number })?.status;
      err.details = response.details;
      throw err;
    }
    if (!response.data?.conversation) throw new Error('Resposta inválida');
    return normalizeConversation(response.data.conversation as ChatConversation);
  },

  async getConversations(filters?: {
    instanceId?: string;
    /** Apenas linhas `whatsapp_official` (Super Admin / tenant com flag). */
    includeWhatsAppOfficial?: boolean;
    /** Filtro de origem: todas | só UazAPI | só Meta Cloud API. */
    channelOrigin?: 'all' | 'uazapi' | 'official';
    search?: string;
    startDate?: string;
    endDate?: string;
    /** Etapa 5: `tenant` = inbox do tenant; padrão `owner` */
    inboxScope?: 'owner' | 'tenant';
    /** `queue` = fila operacional (Etapa 5); `queued` aceite por compatibilidade */
    attendanceFilter?: 'mine' | 'unassigned' | 'queue' | 'queued' | 'closed' | 'team' | 'waiting';
    /** Fase 2: `groups` = conversas de grupo (flag global `whatsapp_groups_enabled`, default on). */
    conversationFilter?: 'all' | 'groups';
  }) {
    const params = new URLSearchParams();
    if (filters?.instanceId) params.append('instanceId', filters.instanceId);
    if (filters?.includeWhatsAppOfficial) params.append('includeWhatsAppOfficial', '1');
    if (filters?.channelOrigin && filters.channelOrigin !== 'all') {
      params.append('channelOrigin', filters.channelOrigin);
    }
    if (filters?.search) params.append('search', filters.search);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.inboxScope) params.append('inboxScope', filters.inboxScope);
    if (filters?.attendanceFilter) {
      const af =
        filters.attendanceFilter === 'queued' ? 'queue' : filters.attendanceFilter;
      params.append('attendanceFilter', af);
    }
    if (filters?.conversationFilter === 'groups') {
      params.append('conversationFilter', 'groups');
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

  async sendMessage(
    conversationId: string,
    text: string,
    options?: { replyToMessageId?: string; clientMessageId?: string }
  ): Promise<{ message?: ChatMessage; response?: unknown; duplicate?: boolean }> {
    const response = await apiClient.post<{
      message?: Record<string, unknown>;
      response?: unknown;
      duplicate?: boolean;
    }>(`/api/chat/messages`, {
      conversationId,
      text,
      ...(options?.replyToMessageId ? { replyToMessageId: options.replyToMessageId } : {}),
      ...(options?.clientMessageId ? { clientMessageId: options.clientMessageId } : {}),
    });
    if (response.error) {
      throw new Error(response.error);
    }
    const data = response.data;
    const rawMsg = data?.message;
    const message =
      rawMsg != null && typeof rawMsg === 'object' ? normalizeChatMessage(rawMsg) : undefined;
    return {
      message,
      response: data?.response,
      duplicate: data?.duplicate === true,
    };
  },

  async postMessageComment(
    messageId: string,
    body: { commentText: string; alsoCreateCrmNote?: boolean }
  ) {
    const response = await apiClient.post<{ comment: Record<string, unknown> }>(
      `/api/chat/messages/${messageId}/comments`,
      body
    );
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data;
  },

  async getMessageComments(messageId: string) {
    const response = await apiClient.get<{ comments: Record<string, unknown>[] }>(
      `/api/chat/messages/${messageId}/comments`
    );
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data?.comments ?? [];
  },

  async listCrmNotesForClient(clientId: string, limit?: number) {
    const q = new URLSearchParams({ clientId });
    if (limit != null) q.set('limit', String(limit));
    const response = await apiClient.get<{ notes: Record<string, unknown>[] }>(
      `/api/chat/crm-notes?${q.toString()}`
    );
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data?.notes ?? [];
  },

  async listCrmNotesForLead(leadId: string, limit?: number) {
    const q = new URLSearchParams({ leadId });
    if (limit != null) q.set('limit', String(limit));
    const response = await apiClient.get<{ notes: Record<string, unknown>[] }>(
      `/api/chat/crm-notes?${q.toString()}`
    );
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data?.notes ?? [];
  },

  async postCrmNote(body: {
    clientId?: string | null;
    leadId?: string | null;
    conversationId?: string | null;
    messageId?: string | null;
    sourceCommentId?: string | null;
    noteType: 'general' | 'chat_message' | 'follow_up' | 'internal';
    noteText: string;
    pinned?: boolean;
  }) {
    const response = await apiClient.post<{ note: Record<string, unknown> }>(`/api/chat/crm-notes`, body);
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

  async getConversationKanbanTags(conversationId: string): Promise<{
    tags: ChatKanbanTagUi[];
    legacy_labels: string[];
  }> {
    const response = await apiClient.get<{
      tags: ChatKanbanTagUi[];
      legacy_labels: string[];
    }>(`/api/chat/conversations/${conversationId}/kanban-tags`);
    if (response.error) throw new Error(response.error);
    const data = response.data;
    const rawTags = Array.isArray(data?.tags) ? data!.tags : [];
    return {
      tags: rawTags.map((t) => ({
        id: String((t as ChatKanbanTagUi).id ?? ''),
        label: String((t as ChatKanbanTagUi).label ?? ''),
        name: (t as ChatKanbanTagUi).name,
        color:
          typeof (t as ChatKanbanTagUi).color === 'string' && (t as ChatKanbanTagUi).color!.trim()
            ? normalizeHexColor((t as ChatKanbanTagUi).color)
            : DEFAULT_CHAT_TAG_COLOR,
      })).filter((t) => t.id && t.label),
      legacy_labels: Array.isArray(data?.legacy_labels) ? data!.legacy_labels : [],
    };
  },

  async addConversationKanbanTag(
    conversationId: string,
    body: { tag_id?: string; label?: string; color?: string },
  ): Promise<{ ok: boolean; tag: ChatKanbanTagUi }> {
    const response = await apiClient.post<{ ok: boolean; tag: ChatKanbanTagUi }>(
      `/api/chat/conversations/${conversationId}/kanban-tags`,
      body,
    );
    if (response.error) throw new Error(response.error);
    if (!response.data?.tag?.id) throw new Error('Falha ao adicionar tag');
    const tg = response.data.tag;
    return {
      ok: response.data.ok,
      tag: {
        id: tg.id,
        label: tg.label,
        name: tg.name,
        color:
          typeof tg.color === 'string' && tg.color.trim()
            ? normalizeHexColor(tg.color)
            : DEFAULT_CHAT_TAG_COLOR,
      },
    };
  },

  async removeConversationKanbanTag(conversationId: string, tagId: string): Promise<void> {
    const response = await apiClient.delete(`/api/chat/conversations/${conversationId}/kanban-tags/${tagId}`);
    if (response.error) throw new Error(response.error);
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

  /**
   * Restauro do Floating Chat após F5: só tratar como removível quando a API devolve 404.
   * Rede / 401 transitório / 5xx → `uncertain` (mantém painel e não apaga localStorage).
   */
  async probeFloatingChatConversationPersist(
    conversationId: string,
  ): Promise<'valid' | 'missing' | 'uncertain'> {
    const response = await apiClient.get<ConversationProfile>(`/api/chat/conversations/${conversationId}/profile`);
    if (!response.error) return 'valid';
    const status = typeof response.details?.status === 'number' ? response.details.status : undefined;
    if (status === 404) return 'missing';
    return 'uncertain';
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



