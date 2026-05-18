import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../utils/db.js';
import {
  hasAssignedTeamColumn,
  hasAttendanceColumns,
  hasChatPhase5SlaColumns,
} from '../utils/chatAttendanceSchema.js';
import {
  applyChatPhase6MessageStatus,
  runInboundChatRoutingAsync,
} from '../services/chatInboundAutomationHooks.js';
import { runChatbotPhase8Inbound } from '../services/chatbotPhase8Runner.js';
import { AuthRequest } from '../middleware/auth.js';
import { uazapiService } from '../services/uazapi.js';
import { resolveOutgoingMediaPayload } from '../services/outgoingMediaPayloadResolver.js';
import { buildWhatsappTemplateMediaPublicUrlFromStoragePath } from '../services/whatsappTemplateMediaStorageService.js';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import * as notificationService from '../services/notifications.js';
import {
  emitConversationDeletedToTenant,
  emitConversationUpdate,
  emitMessageUpdated,
  emitNewMessage,
  emitToUser,
} from '../services/websocketService.js';
import {
  resolveConversationMatch,
  normalizeConversationPhone,
  type ConversationMatchResult,
} from '../services/conversationMatchingService.js';
import { createClientTimelineEvent } from '../services/clientTimelineEventsService.js';
import { applyKanbanAutomationForConversation } from '../services/chatKanbanAutomationService.js';
import { readKanbanTagIdsFromConversationMetadata } from '../services/chatKanbanConversationKanbanTagsService.js';
import { DEFAULT_KANBAN_TAG_COLOR_UI } from '../services/chatKanbanTagStore.js';
import { resolveTenantIdForUser } from '../utils/resolveTenantIdForUser.js';
import { deleteChatInstanceComplete } from '../services/whatsappInstanceDeletionService.js';
import { isWhatsappPhoneKeyInheritEnabled } from '../config/whatsappInheritEnv.js';
import { useLegacyQueryWebhookUrlRegistration } from '../config/uazapiWebhookRouting.js';
import {
  extractUazapiChatDisplayName,
  extractUazapiChatImageUrl,
} from '../utils/uazapiChatIdentity.js';
import {
  mergeChatMetadataForIdentity,
  mergeContactNameForUpsert,
  mergeLastMessageAtForUpsert,
  mergeLastMessagePreviewForUpsert,
  mergePhoneForUpsert,
  mergeProfileNameForUpsert,
} from '../utils/chatIdentityQuality.js';
import {
  logUazChat,
  type UazChatLogFields,
  isUazIntegrationVerboseLogs,
  isChatSaveVerboseLogs,
  isUazWebhookPayloadDebugEnabled,
} from '../utils/chatObservability.js';
import {
  buildWaLastMsgTimestampFilter,
  extractWaLastMsgTimestampMs,
  normalizeSyncConfigFromInput,
  normalizeSyncMode,
  shouldBootstrapHistory,
  syncModeToMinTimestampMs,
} from '../utils/instanceSyncConfig.js';
import {
  conversationRowForClientApi,
  enrichNormalizedChatFromContactCatalog,
  indexContactsByMsisdn,
  resolveMessageFindChatId,
  shouldLoadContactCatalogForIdentityEnrichment,
  type UazContactCatalogEntry,
} from '../utils/uazapiIdentityResolve.js';
import { chatAvatarDebugLog, isChatAvatarDebugEnabled } from '../utils/chatAvatarDebug.js';
import { logChatAvatarSyncResult } from '../utils/chatAvatarSyncResultLog.js';
import {
  resolveConversationAvatarWithCache,
  ensureConversationAvatarCachedAndReplicateToCrm,
  attemptConversationAvatarAutoRecache,
  scheduleConversationAvatarAutoRecache,
} from '../services/whatsappAvatarCacheService.js';
import { persistConversationAvatarToCrm as persistConversationAvatarOnCrm } from '../services/conversationAvatarPersistence.js';
import {
  computeCanonicalIdentityFromChatPayload,
  incomingChatPayloadHasEmptyProfileImages,
  mergeCanonicalIdentityForUpsert,
  type CanonicalRowSnapshot,
} from '../utils/canonicalConversationIdentity.js';
import {
  attachContractToMetadata,
  buildPersistentMediaStubForKind,
  buildMessageContract,
  contractFromDbRow,
  ensurePlainString,
  extractMediaInfo,
  extractMessageBody,
  extractUazDownloadMessageId,
  inferMessageTypeFromPayload,
  mediaItemsFromDownloadPayload,
  mergeMessageEnvelope,
  normalizeIdForUazDownload,
  sanitizeMediaItemsForDb,
  type ChatMediaItem,
  type ChatMessageKind,
} from '../utils/chatMessageContract.js';
import { SQL_CHAT_ACCESS_PREDICATE, sqlChatAccessPredicate } from '../utils/chatConversationAccess.js';
import { assertPermissionKey, ModulePermissionError } from '../permissions/index.js';
import { isWhatsappGroupsEnabled } from '../config/whatsappGroupsEnv.js';
import {
  deriveConversationTypeFromNormalized,
  extractGroupMessageMetadataForDb,
  type ChatConversationType,
} from '../utils/whatsappGroupChat.js';
import { normalizeAttendanceStatusForDb } from '../utils/chatAttendanceStatus.js';
import {
  decorateInstanceForApi,
  fetchInstanceForOperate,
  fetchInstanceForManage,
  listInstancesForActor,
} from '../utils/chatInstanceAccess.js';
import {
  resolveCommunicationDisplayIdentity,
  upsertCommunicationContactFromProvider,
} from '../services/communicationContactService.js';
import {
  processProviderWebhook,
  registerCommunicationEngineDelegates,
} from '../services/communication/communicationEngineService.js';
import { DEFAULT_COMMUNICATION_PROVIDER } from '../services/communication/communicationTypes.js';
import {
  buildChannelStatusPayload,
  buildConversationUpdatedPayload,
  buildMessageCreatedPayload,
} from '../services/communication/realtimePayloads.js';
import { emitToTenant } from '../services/realtimeService.js';
import { canChatAction } from '../services/chatAccess.js';
import { buildManualOutgoingTextWithSenderPrefix } from '../utils/chatOutgoingSenderName.js';
import {
  isWhatsappOfficialSuperadminEnabled,
  isWhatsappOfficialTenantEnabled,
} from '../config/whatsappOfficialEnv.js';
import { canAccessWhatsappOfficialOperationalChat } from '../utils/whatsappOfficialOperationalAccess.js';
import { getAccountCredentials } from '../services/whatsappOfficial/whatsappOfficialConfigService.js';
import { sendTextMessage as graphOfficialSendText } from '../services/whatsappOfficial/whatsappOfficialClient.js';
import { insertChatGroupAdminAudit } from '../services/chatGroupAdminAuditService.js';
import { normalizeUazGroupInfo } from './chatGroupController.js';
import {
  digitsOnlyMsisdn,
  mergeUniqueParticipantPhones,
  resolveConversationPrimaryMsisdn,
} from '../utils/groupInvitePhoneNormalize.js';

const instanceSchema = z.object({
  name: z.string().min(3),
  metadata: z.record(z.any()).optional(),
});

const syncModeSchema = z.enum(['none', 'days_7', 'days_30', 'days_90', 'full']);

const connectSchema = z.object({
  phone: z.string().regex(/^\d{10,15}$/).optional().nullable(),
  sync_on_connect: z.boolean().optional(),
  sync_mode: syncModeSchema.optional(),
  /** Apaga conversas e mensagens locais desta instância antes de conectar (histórico “novo”). */
  reset_chat_history: z.boolean().optional(),
});

const syncSchema = z.object({
  instanceId: z.string().uuid(),
  limit: z.number().min(1).max(500).optional(),
  filters: z.record(z.any()).optional(),
  /** Sobrescreve o período da instância para este sync manual (opcional). */
  syncMode: syncModeSchema.optional(),
});

const createGroupFromConversationSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(512).optional().nullable(),
  participants: z.array(
    z.object({
      phone: z.string().min(1),
      source: z.enum(['team', 'client', 'lead', 'manual']),
    })
  ),
  confirmDuplicate: z.boolean().optional(),
});

const webhookConfigSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.string()).optional(),
  addUrlEvents: z.boolean().optional(),
  addUrlTypesMessages: z.boolean().optional(),
  excludeMessages: z.array(z.string()).optional(), // Array de strings, não boolean
  enabled: z.boolean().optional(),
  secret: z.string().optional(),
});

const syncMessagesSchema = z.object({
  limit: z.number().min(1).max(100).optional(),
  before: z.string().optional(),
  after: z.string().optional(),
  syncMode: syncModeSchema.optional(),
  /**
   * Quando true, respeita `sync_mode` da instância se `syncMode` não vier no body (histórico amplo).
   * Omitido/false no POST manual: sync leve (`days_30` + teto de mensagens menor).
   */
  fullHistory: z.boolean().optional(),
  /**
   * Quando true, ignora apenas gates HTTP (recent / debounce / lock) para rodar `message/find` de novo.
   * Não reimporta mensagens cujo `external_message_id` já existe (evita 50× save + log em conversas maduras).
   */
  force: z.boolean().optional(),
});

const markReadSchema = z.object({
  read: z.boolean().default(true),
});

const MAX_MEDIA_BASE64_CHARS = 14 * 1024 * 1024; // ~10MB binário em base64

const sendMessageSchema = z
  .object({
  conversationId: z.string().uuid(),
    /** Idempotência / correlação no cliente (UUID v4). */
    clientMessageId: z.string().uuid().optional(),
    /** Responder mensagem existente (citado no WhatsApp via UazAPI `replyid`). */
    replyToMessageId: z.string().uuid().optional(),
    /** Padrão: texto. Use `image` ou `document` para mídia via `/send/media`. */
    type: z.enum(['text', 'image', 'document']).optional(),
    text: z.string().optional(),
    caption: z.string().optional(),
    /** Base64 cru (sem prefixo data:) ou URL pública para UazAPI */
    fileBase64: z.string().optional(),
    fileUrl: z.string().url().optional(),
    mimeType: z.string().optional(),
    fileName: z.string().max(255).optional(),
  readChat: z.boolean().optional(),
  readMessages: z.boolean().optional(),
  delay: z.number().optional(),
  })
  .superRefine((data, ctx) => {
    const t = data.type ?? 'text';
    if (t === 'text') {
      const txt = data.text?.trim() ?? '';
      if (!txt) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'text é obrigatório para type=text' });
      }
    }
    if (t === 'image' || t === 'document') {
      if (!data.fileBase64?.trim() && !data.fileUrl?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Para type=image/document informe fileBase64 ou fileUrl',
        });
      }
      if (data.fileBase64 && data.fileBase64.length > MAX_MEDIA_BASE64_CHARS) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Arquivo muito grande' });
      }
    }
});

const prepareLeadConversationSchema = z.object({
  lead_id: z.string().uuid(),
  instance_id: z.string().uuid(),
});

const resolveConversationForClientSchema = z.object({
  client_id: z.string().uuid(),
  instance_id: z.string().uuid(),
  /** Sobrescreve o telefone do CRM (opcional). */
  phone: z.string().optional(),
});

const patchPreparedConversationInstanceSchema = z.object({
  instance_id: z.string().uuid(),
});

const linkConversationSchema = z.object({
  type: z.enum(['client', 'lead']),
  id: z.string().uuid(),
});

const patchInstanceSchema = z.object({
  enabledInChat: z.boolean(),
});

type ChatInstanceRow = {
  id: string;
  user_id: string;
  name: string;
  external_instance_name: string | null;
  instance_token: string;
  status: string;
  metadata: any;
  connected_phone?: string | null;
  phone_key?: string | null;
};

type AnyObject = Record<string, any>;

type OutgoingMessageStatus = 'queued' | 'provider_sent' | 'delivered' | 'read' | 'failed';

function normalizeOutgoingStatus(raw: unknown): OutgoingMessageStatus | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (s === 'queued' || s === 'pending') return 'queued';
  if (s === 'provider_sent' || s === 'sent' || s === 'server_ack') return 'provider_sent';
  if (s === 'delivered' || s === 'delivery' || s === 'received') return 'delivered';
  if (s === 'read' || s === 'seen') return 'read';
  if (s === 'failed' || s === 'error' || s === 'undelivered') return 'failed';
  return null;
}

function pickBestOutgoingStatus(
  currentRaw: unknown,
  incomingRaw: unknown
): OutgoingMessageStatus | null {
  const current = normalizeOutgoingStatus(currentRaw);
  const incoming = normalizeOutgoingStatus(incomingRaw);
  if (!incoming) return current ?? null;
  if (!current) return incoming;
  const rank: Record<OutgoingMessageStatus, number> = {
    queued: 1,
    provider_sent: 2,
    delivered: 3,
    read: 4,
    failed: 5,
  };
  // "failed" deve prevalecer sobre todos os demais.
  return rank[incoming] >= rank[current] ? incoming : current;
}

/**
 * Verifica se o token administrativo da UazAPI está configurado no servidor.
 * Esse valor vem de UAZAPI_ADMIN_TOKEN (env) — não tem relação com JWT do usuário do painel.
 */
function isUazapiAdminConfigured(): boolean {
  return Boolean(process.env.UAZAPI_ADMIN_TOKEN?.trim());
}

/**
 * Normaliza um número de telefone removendo caracteres especiais
 * e deixando apenas dígitos para comparação consistente
 * @param phone - Número de telefone em qualquer formato
 * @returns Número normalizado (apenas dígitos) ou null se inválido
 */
function normalizePhoneNumber(phone: string | null | undefined): string | null {
  return normalizeConversationPhone(phone);
}

function pickFirstNonEmpty(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function extractConnectedProfileName(payload: any): string | null {
  const root = payload ?? {};
  const inst = root?.instance && typeof root.instance === 'object' ? root.instance : {};
  const data = root?.data && typeof root.data === 'object' ? root.data : {};
  const dataInst = data?.instance && typeof data.instance === 'object' ? data.instance : {};

  return pickFirstNonEmpty(
    root?.profile_name,
    root?.profileName,
    root?.push_name,
    root?.pushName,
    root?.contact_name,
    root?.contactName,
    root?.display_name,
    root?.displayName,
    root?.name,
    inst?.profile_name,
    inst?.profileName,
    inst?.push_name,
    inst?.pushName,
    inst?.contact_name,
    inst?.contactName,
    inst?.display_name,
    inst?.displayName,
    inst?.name,
    data?.profile_name,
    data?.profileName,
    data?.push_name,
    data?.pushName,
    data?.contact_name,
    data?.contactName,
    data?.display_name,
    data?.displayName,
    data?.name,
    dataInst?.profile_name,
    dataInst?.profileName,
    dataInst?.push_name,
    dataInst?.pushName,
    dataInst?.contact_name,
    dataInst?.contactName,
    dataInst?.display_name,
    dataInst?.displayName,
    dataInst?.name
  );
}

function extractConnectedPhone(payload: any): string | null {
  const root = payload ?? {};
  const inst = root?.instance && typeof root.instance === 'object' ? root.instance : {};
  const data = root?.data && typeof root.data === 'object' ? root.data : {};
  const dataInst = data?.instance && typeof data.instance === 'object' ? data.instance : {};

  return pickFirstNonEmpty(
    root?.owner,
    root?.phone,
    root?.phone_number,
    root?.phoneNumber,
    root?.number,
    inst?.owner,
    inst?.phone,
    inst?.phone_number,
    inst?.phoneNumber,
    inst?.number,
    data?.owner,
    data?.phone,
    data?.phone_number,
    data?.phoneNumber,
    data?.number,
    dataInst?.owner,
    dataInst?.phone,
    dataInst?.phone_number,
    dataInst?.phoneNumber,
    dataInst?.number
  );
}

let hasLeadIdColumnPromise: Promise<boolean> | null = null;
async function hasLeadIdColumn(): Promise<boolean> {
  if (!hasLeadIdColumnPromise) {
    hasLeadIdColumnPromise = (async () => {
      const r = await pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'chat_conversations'
           AND column_name = 'lead_id'`
      );
      return (r.rows[0]?.c ?? '0') === '1';
    })();
  }
  return hasLeadIdColumnPromise;
}

type LinkSource = 'auto' | 'manual' | 'system';
type LinkConfidence = 'high' | 'review' | 'manual';

function buildMatchMetadata(match: ConversationMatchResult): Record<string, unknown> {
  return {
    phone_normalized: match.normalizedPhone,
    match_sugerido: {
      type: match.suggestedType,
      id: match.suggestedId,
      confidence: match.confidence,
      candidates: match.candidates,
    },
  };
}

/**
 * Herda conversas de outras instâncias com o mesmo phone_key (modo legacy, só se ENV explícita).
 * Por defeito o sistema **não** chama herança efetiva; reconexão com o mesmo número começa limpa.
 */
async function inheritConversationsFromPhoneKey(
  userId: string,
  newInstanceId: string,
  phoneKey: string
) {
  if (!phoneKey) {
    console.log('[InheritConversations] phone_key is empty, skipping inheritance');
    return 0;
  }

  if (!isWhatsappPhoneKeyInheritEnabled()) {
    logUazChat('info', {
      event_type: 'inherit_skipped_by_default_policy',
      user_id: userId,
      instance_id: newInstanceId,
      phase: 'phone_key_inherit',
      detail:
        'Política padrão: sem herança por phone_key (reconexão limpa). Ative apenas com WHATSAPP_INHERIT_CONVERSATIONS_ON_CONNECT=true (legacy).',
    });
    return 0;
  }

  try {
    logUazChat('info', {
      event_type: 'inherit_enabled_by_env',
      user_id: userId,
      instance_id: newInstanceId,
      phase: 'phone_key_inherit',
      detail: 'WHATSAPP_INHERIT_CONVERSATIONS_ON_CONNECT=true — herança legacy ativa',
    });
    console.log(`[InheritConversations] Herdando conversas para instância ${newInstanceId} com phone_key ${phoneKey}`);

    // Só reassocia conversas cujo instance_id ainda existe (instância eliminada já CASCADE-apagou linhas).
    const result = await pool.query(
      `UPDATE chat_conversations c
       SET instance_id = $1, updated_at = now()
       FROM chat_instances i
       WHERE c.instance_id = i.id
         AND c.user_id = $2::uuid
         AND c.phone_key = $3
         AND c.instance_id <> $1::uuid
       RETURNING c.id, c.phone_number, c.external_chat_id`,
      [newInstanceId, userId, phoneKey]
    );

    if (result.rows.length > 0) {
      console.log(`[InheritConversations] ${result.rows.length} conversas herdadas para instância ${newInstanceId}`, {
        conversations: result.rows.map(r => ({ id: r.id, phone: r.phone_number, externalChatId: r.external_chat_id })),
      });
    } else {
      console.log(`[InheritConversations] Nenhuma conversa encontrada para herdar com phone_key ${phoneKey}`);
      logUazChat('info', {
        event_type: 'inherit_skipped_deleted_instance',
        user_id: userId,
        instance_id: newInstanceId,
        phase: 'phone_key_inherit',
        detail:
          'Herança legacy ligada mas nenhuma conversa elegível (ex.: instância anterior removida em CASCADE ou sem outra instância com o mesmo phone_key).',
      });
    }

    return result.rows.length;
  } catch (error: any) {
    console.error('[InheritConversations] Erro ao herdar conversas:', {
      error: error.message,
      code: error.code,
      userId,
      newInstanceId,
      phoneKey,
    });
    // Não lançar erro - herança é opcional e não deve quebrar o fluxo
    return 0;
  }
}

/**
 * Remove conversas e mensagens locais da instância (`chat_messages` em CASCADE).
 * Limpa `bootstrap_sync` no metadata para permitir novo bootstrap.
 */
async function purgeChatHistoryForInstance(instanceId: string, userId: string): Promise<number> {
  const del = await pool.query(
    `DELETE FROM chat_conversations WHERE instance_id = $1 AND user_id = $2 RETURNING id`,
    [instanceId, userId]
  );
  const n = del.rowCount ?? 0;
  await pool.query(
    `UPDATE chat_instances
     SET metadata = COALESCE(metadata, '{}'::jsonb) - 'bootstrap_sync',
         updated_at = now()
     WHERE id = $1 AND user_id = $2`,
    [instanceId, userId]
  );
  return n;
}

const INTERNAL_UAZ_CHAT_ID_RE = /^r[a-f0-9]{12,}$/i;

function isLikelyInternalUazChatId(s: string): boolean {
  return INTERNAL_UAZ_CHAT_ID_RE.test(s.trim());
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

/**
 * JID canônico para `external_chat_id` (OpenAPI Uaz: `wa_chatid` é o identificador do chat;
 * `id` tipo r1a2b3c4... é interno e não serve para `/message/find` nem para casar webhook).
 */
function pickExternalChatJidForUaz(raw: any): string | null {
  if (!raw || typeof raw !== 'object') return null;

  const ps = (v: unknown): string | null =>
    typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;

  const wa = ps(raw.wa_chatid);
  if (wa) return wa;

  for (const cand of [raw.chatid, raw.chatId, raw.jid, raw.remoteJid, raw.key?.remoteJid]) {
    const s = ps(cand);
    if (s && s.includes('@')) return s;
  }

  const fast = ps(raw.wa_fastid) || ps(raw.fastId) || ps(raw.fast_id);
  if (fast && fast.includes(':')) {
    const after = fast.split(':').slice(1).join(':');
    if (after.includes('@')) return after.trim();
  }

  if (raw.wa_isGroup !== true) {
    const numRaw = ps(raw.number);
    if (numRaw) {
      const d = digitsOnly(numRaw);
      if (d.length >= 10 && d.length <= 15) return `${d}@s.whatsapp.net`;
    }
  }

  const idStr = ps(raw.id);
  if (idStr && idStr.includes('@')) return idStr;
  if (idStr && !isLikelyInternalUazChatId(idStr)) return idStr;

    return null;
  }

/** Chave estável para deduplicar linhas do /chat/find ao mesclar buscas (privado + grupo). */
function chatFindRowDedupeKey(raw: any): string {
  const jid = pickExternalChatJidForUaz(raw);
  if (jid) return jid;
  if (!raw || typeof raw !== 'object') return randomUUID();
  const k =
    raw.wa_fastid ||
    raw.chatid ||
    raw.chatId ||
    raw.jid ||
    raw.remoteJid ||
    raw.key?.remoteJid ||
    raw.id;
  return typeof k === 'string' && k.length > 0 ? k : String(raw.id ?? randomUUID());
}

/** Classificação heurística para logs (API deve enviar wa_isGroup). */
function classifyChatRowForLog(raw: any): 'group' | 'private' | 'unknown' {
  if (raw?.wa_isGroup === true || raw?.isGroup === true) return 'group';
  if (raw?.wa_isGroup === false && raw?.isGroup !== true) return 'private';
  const jid = String(raw?.wa_chatid || raw?.chatid || raw?.jid || raw?.remoteJid || '');
  if (jid.endsWith('@g.us')) return 'group';
  if (jid.includes('@s.whatsapp.net') || jid.includes('@c.us') || jid.includes('@lid')) return 'private';
  return 'unknown';
}

function extractChatsArrayFromFindResponse(remoteChats: AnyObject): any[] {
  return (
    (Array.isArray(remoteChats?.chats) && remoteChats?.chats) ||
    (Array.isArray(remoteChats?.data?.chats) && remoteChats?.data?.chats) ||
    (Array.isArray(remoteChats?.results) && remoteChats?.results) ||
    (Array.isArray(remoteChats?.data) && remoteChats?.data) ||
    (Array.isArray(remoteChats) ? remoteChats : [])
  );
}

/** Auditoria de runtime: classificação direta das linhas como a UazAPI as enviou (antes do parser CRM). */
function summarizeRemoteChatRowsFromApi(rows: any[]) {
  let api_wa_isGroup_true = 0;
  let api_wa_isGroup_false = 0;
  let api_wa_isGroup_missing = 0;
  let jid_ends_g_us = 0;
  let jid_s_whatsapp_net = 0;
  let jid_c_us = 0;
  let jid_lid = 0;
  let jid_other = 0;
  let jid_empty = 0;
  for (const r of rows) {
    if (r?.wa_isGroup === true) api_wa_isGroup_true += 1;
    else if (r?.wa_isGroup === false) api_wa_isGroup_false += 1;
    else api_wa_isGroup_missing += 1;
    const jid = String(r?.wa_chatid || r?.chatid || r?.jid || r?.remoteJid || '').trim();
    if (!jid) jid_empty += 1;
    else if (jid.endsWith('@g.us')) jid_ends_g_us += 1;
    else if (jid.includes('@s.whatsapp.net')) jid_s_whatsapp_net += 1;
    else if (jid.includes('@c.us')) jid_c_us += 1;
    else if (jid.includes('@lid')) jid_lid += 1;
    else jid_other += 1;
  }
  return {
    api_wa_isGroup_true,
    api_wa_isGroup_false,
    api_wa_isGroup_missing,
    jid_ends_g_us,
    jid_s_whatsapp_net,
    jid_c_us,
    jid_lid,
    jid_other,
    jid_empty,
  };
}

function compactChatRowForAudit(raw: any) {
  return {
    id: raw?.id ?? null,
    wa_chatid: raw?.wa_chatid ?? null,
    wa_isGroup: raw?.wa_isGroup ?? null,
    wa_name:
      typeof raw?.wa_name === 'string' ? raw.wa_name.slice(0, 80) : raw?.wa_name ?? null,
    wa_lastMsgTimestamp: raw?.wa_lastMsgTimestamp ?? null,
  };
}

function tokenSuffixForAudit(token: string | null | undefined): string | null {
  if (!token || typeof token !== 'string') return null;
  const t = token.trim();
  if (t.length <= 4) return '****';
  return `…${t.slice(-4)}`;
}

/**
 * Prova de runtime: endpoint, body, resposta bruta (truncada), totais por campo da API e amostra de itens.
 * `UAZ_CHAT_SYNC_DEBUG=1` aumenta truncamento da resposta e amostra por perna (até 500 itens).
 */
function logSyncChatFindLegAudit(params: {
  event_type: string;
  correlation_id: string;
  sync_run_id: string | null;
  tenant_id: string | null;
  user_id: string;
  instance_id: string;
  external_instance_name: string | null;
  instance_token_suffix: string | null;
  trigger: string | null;
  leg: string;
  endpoint: string;
  request_body: Record<string, unknown>;
  raw_response: AnyObject;
  extracted: any[];
}) {
  const rows = params.extracted;
  const sum = summarizeRemoteChatRowsFromApi(rows);
  const maxSample = process.env.UAZ_CHAT_SYNC_DEBUG === '1' ? 500 : 40;
  const fullSample = rows.map(compactChatRowForAudit);
  const items_sample = fullSample.length > maxSample ? fullSample.slice(0, maxSample) : fullSample;
  const rawTruncLimit = process.env.UAZ_CHAT_SYNC_DEBUG === '1' ? 100_000 : 16_000;
  const responseStr =
    params.raw_response && typeof params.raw_response === 'object'
      ? JSON.stringify(params.raw_response)
      : String(params.raw_response);
  const response_raw_truncated =
    responseStr.length > rawTruncLimit ? `${responseStr.slice(0, rawTruncLimit)}…[truncated]` : responseStr;

  logUazChat('info', {
    event_type: params.event_type,
    phase: 'sync_chat_find_leg_audit',
    correlation_id: params.correlation_id,
    sync_run_id: params.sync_run_id,
    tenant_id: params.tenant_id,
    user_id: params.user_id,
    instance_id: params.instance_id,
    external_instance_name: params.external_instance_name,
    instance_token_suffix: params.instance_token_suffix,
    trigger: params.trigger,
    leg: params.leg,
    uazapi_method: 'POST',
    uazapi_endpoint: params.endpoint,
    uazapi_request_body_json: JSON.stringify(params.request_body),
    uazapi_response_top_level_keys:
      params.raw_response && typeof params.raw_response === 'object'
        ? Object.keys(params.raw_response as object)
        : [],
    response_totalChatsStats: (params.raw_response as AnyObject)?.totalChatsStats ?? null,
    response_pagination: (params.raw_response as AnyObject)?.pagination ?? null,
    extracted_chats_length: rows.length,
    ...sum,
    items_sample_count: items_sample.length,
    items_sample_truncated: fullSample.length > maxSample,
    items_sample,
    response_raw_truncated,
  });
}

/** Dígitos do usuário em JIDs privados (@s.whatsapp.net, @c.us). Ignora @lid. */
function derivePhoneDigitsFromPrivateJid(jid: string): string | null {
  const s = jid.trim();
  const lower = s.toLowerCase();
  if (!lower.includes('@')) return null;
  if (lower.endsWith('@g.us')) return null;
  if (lower.endsWith('@lid')) return null;
  if (!lower.endsWith('@s.whatsapp.net') && !lower.endsWith('@c.us')) return null;
  const local = s.split('@')[0] || '';
  const d = digitsOnly(local);
  if (d.length >= 10 && d.length <= 15) return d;
  return null;
}

/**
 * Evita usar `number`/`phone_number` da UazAPI quando vier ID interno ou formato inválido;
 * prioriza JID canônico para conversas 1:1.
 */
function pickPhoneNumberFromChatRow(raw: any, externalChatId: string): string | null {
  const fromJid = derivePhoneDigitsFromPrivateJid(externalChatId);

  const looksLikeRealMsisdn = (v: unknown): v is string => {
    if (typeof v !== 'string' || !v.trim()) return false;
    const t = v.trim();
    if (isLikelyInternalUazChatId(t)) return false;
    const d = digitsOnly(t);
    return d.length >= 10 && d.length <= 15;
  };

  const pickTrim = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  const pn = pickTrim(raw?.phone_number);
  if (pn && looksLikeRealMsisdn(pn)) return digitsOnly(pn);

  const num = pickTrim(raw?.number);
  if (num && looksLikeRealMsisdn(num)) return digitsOnly(num);

  if (fromJid) return fromJid;

  if (pn) return digitsOnly(pn) || pn;
  if (num) return digitsOnly(num) || num;

  return null;
}

function normalizeChatPayloadWithReason(raw: any):
  | { ok: true; data: NonNullable<ReturnType<typeof normalizeChatPayload>> }
  | { ok: false; reason: 'not_object' | 'no_canonical_jid' } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: 'not_object' };
  }
  if (!pickExternalChatJidForUaz(raw)) {
    return { ok: false, reason: 'no_canonical_jid' };
  }
  const data = normalizeChatPayload(raw);
  if (data) {
    return { ok: true, data };
  }
  return { ok: false, reason: 'no_canonical_jid' };
}

function normalizeChatPayload(raw: any) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const externalChatId = pickExternalChatJidForUaz(raw);

  if (!externalChatId) {
    return null;
  }

  const fastId = raw.wa_fastid || raw.fastId || raw.fast_id || null;
  let contactName = extractUazapiChatDisplayName(raw as Record<string, unknown>);
  const profileName =
    (typeof raw.wa_name === 'string' && raw.wa_name.trim()
      ? raw.wa_name.trim()
      : null) ||
    (typeof raw.profileName === 'string' && raw.profileName.trim() ? raw.profileName.trim() : null);
  const phoneNumber = pickPhoneNumberFromChatRow(raw, externalChatId);
  /** Não copiar MSISDN para contact_name — evita persistir “nome” fraco como se fosse identidade real. */
  const status = raw.lead_status || raw.status || null;
  const unreadCount =
    raw.wa_unreadCount ||
    raw.unreadCount ||
    raw.unreadMessages ||
    (typeof raw.wa_unread === 'number' ? raw.wa_unread : null);

  let lastMessageAt: Date | null = null;
  const timestamp =
    raw.wa_lastMsgTimestamp ||
    raw.last_message_at ||
    raw.lastMessageAt ||
    raw.lastMessageTimestamp;
  if (timestamp) {
    const numeric = Number(timestamp);
    if (!Number.isNaN(numeric)) {
      lastMessageAt = new Date(numeric > 1e12 ? numeric : numeric * 1000);
    } else if (typeof timestamp === 'string') {
      const parsed = Date.parse(timestamp);
      if (!Number.isNaN(parsed)) {
        lastMessageAt = new Date(parsed);
      }
    }
  }

  const lastMessagePreview =
    raw.wa_lastMsgText ||
    raw.last_message_preview ||
    raw.preview ||
    raw.lastMessage ||
    null;

  const metadata =
    raw && typeof raw === 'object'
      ? ({
          ...(raw as Record<string, unknown>),
          ...(raw.isGroup === true && raw.wa_isGroup == null ? { wa_isGroup: true } : {}),
        } as Record<string, unknown>)
      : raw;

  return {
    externalChatId,
    externalFastId: fastId,
    contactName,
    profileName,
    phoneNumber,
    status,
    unreadCount,
    lastMessageAt,
    lastMessagePreview,
    metadata,
  };
}

/** Instância acessível para operar (atendimento, sync, estado) — dono ou mesmo tenant. */
async function loadInstanceForOperate(userId: string, instanceId: string, res: Response) {
  const row = await fetchInstanceForOperate(userId, instanceId);
  if (!row) {
    res.status(404).json({ error: 'Instância não encontrada' });
    return null;
  }
  return row as ChatInstanceRow;
}

/** Apenas o dono da instância — QR, apagar, webhook, patch. */
async function loadInstanceForManage(userId: string, instanceId: string, res: Response) {
  const row = await fetchInstanceForManage(userId, instanceId);
  if (row) return row as ChatInstanceRow;
  const canOperate = await fetchInstanceForOperate(userId, instanceId);
  if (canOperate) {
    res.status(403).json({
      error: 'Sem permissão para gerir esta instância',
      code: 'INSTANCE_MANAGE_FORBIDDEN',
    });
    return null;
  }
  res.status(404).json({ error: 'Instância não encontrada' });
  return null;
}

async function assertWhatsappOfficialConversationSendAllowed(
  req: AuthRequest,
  accountId: string
): Promise<boolean> {
  const superadminOfficialEnabled =
    Boolean(req.user?.is_super_admin) && isWhatsappOfficialSuperadminEnabled();
  const tenantOfficialEnabled = isWhatsappOfficialTenantEnabled();
  if (!canAccessWhatsappOfficialOperationalChat(req)) return false;
  const r = await pool.query(
    `
    SELECT 1 FROM whatsapp_official_accounts wa
    WHERE wa.id = $1::uuid
      AND (
        ($2::boolean AND wa.owner_scope = 'superadmin'
          AND (wa.inbox_user_id IS NULL OR wa.inbox_user_id = $3::uuid))
        OR
        ($4::boolean AND wa.tenant_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM users u WHERE u.id = $3::uuid
            AND u.tenant_id IS NOT NULL AND wa.tenant_id = u.tenant_id
        ))
      )
    LIMIT 1
    `,
    [accountId, superadminOfficialEnabled, req.userId!, tenantOfficialEnabled]
  );
  return (r.rowCount ?? 0) > 0;
}

function deriveProviderContactIdFromConversation(row: Record<string, unknown>): string | null {
  const canonical = typeof row.canonical_chat_id === 'string' ? row.canonical_chat_id.trim() : '';
  if (canonical) return canonical;
  const external = typeof row.external_chat_id === 'string' ? row.external_chat_id.trim() : '';
  return external || null;
}

async function syncCommunicationContactFromNormalized(
  tenantId: string | null,
  normalized: ReturnType<typeof normalizeChatPayload>,
  linked?: { clientId?: string | null; leadId?: string | null }
): Promise<string | null> {
  if (!tenantId || !normalized) return null;
  if (deriveConversationTypeFromNormalized(normalized) === 'group') {
    return null;
  }
  const row = await upsertCommunicationContactFromProvider({
    tenantId,
    provider: DEFAULT_COMMUNICATION_PROVIDER,
    providerContactId: normalized.externalChatId ?? null,
    phone: normalized.phoneNumber ?? null,
    displayName: normalized.contactName ?? normalized.profileName ?? null,
    profileAvatarUrl: extractUazapiChatImageUrl((normalized.metadata as Record<string, unknown>) || {}),
    linkedClientId: linked?.clientId ?? null,
    linkedLeadId: linked?.leadId ?? null,
    rawProfile: (normalized.metadata as Record<string, unknown>) ?? null,
  });
  return row?.id ?? null;
}

async function upsertConversation(
  instance: ChatInstanceRow,
  chatData: ReturnType<typeof normalizeChatPayload>,
  opts?: { communicationContactId?: string | null; skipCrmAutoLink?: boolean }
) {
  if (!chatData) {
    console.warn('[UpsertConversation] chatData is null or undefined');
    return null;
  }

  const upsertId = randomUUID().substring(0, 8);
  const conversationType: ChatConversationType = deriveConversationTypeFromNormalized(chatData);
  const isGroupConversation = conversationType === 'group';
  if (isGroupConversation) {
    console.log('[chat-group-upsert]', {
      instanceId: instance.id,
      externalChatId: chatData.externalChatId,
    });
  }
  console.log(`[UpsertConversation ${upsertId}] Starting upsert`, {
    instanceId: instance.id,
    externalChatId: chatData.externalChatId,
    contactName: chatData.contactName,
    phoneNumber: chatData.phoneNumber,
    lastMessagePreview: chatData.lastMessagePreview?.substring(0, 50),
  });

  let match: ConversationMatchResult = {
    normalizedPhone: normalizePhoneNumber(chatData.phoneNumber),
    suggestedType: 'none',
    suggestedId: null,
    confidence: 'none',
    candidates: [],
  };
  let autoLinkedClientIdForTimeline: string | null = null;
  const tenantId = await resolveTenantIdForUser(instance.user_id);
  if (tenantId && !isGroupConversation && !opts?.skipCrmAutoLink) {
    try {
      match = await resolveConversationMatch({
        tenantId,
        rawPhone: chatData.phoneNumber,
      });
    } catch (matchError: any) {
      console.error(`[UpsertConversation ${upsertId}] Error resolving match:`, {
        error: matchError.message,
        phone: chatData.phoneNumber,
      });
    }
  }

  // Buscar phone_key da instância para vincular conversa ao número conectado
  let phoneKey: string | null = null;
  try {
    const instanceResult = await pool.query(
      'SELECT phone_key FROM chat_instances WHERE id = $1',
      [instance.id]
    );
    if (instanceResult.rows.length > 0) {
      phoneKey = instanceResult.rows[0].phone_key;
      console.log(`[UpsertConversation ${upsertId}] Found phone_key from instance:`, phoneKey);
    }
  } catch (keyError: any) {
    console.error(`[UpsertConversation ${upsertId}] Error fetching phone_key:`, {
      error: keyError.message,
    });
    // Não falha o upsert se houver erro ao buscar phone_key
  }

  try {
  const leadColumnAvailable = await hasLeadIdColumn();
  const existingResult = await pool.query<{
    id: string;
    client_id: string | null;
    lead_id?: string | null;
    metadata: Record<string, unknown> | null;
    contact_name: string | null;
    profile_name: string | null;
    phone_number: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
    canonical_chat_id?: string | null;
    canonical_phone?: string | null;
    identity_source?: string | null;
    identity_strength?: string | null;
    identity_state?: string | null;
    history_sync_status?: string | null;
    last_history_sync_reason?: string | null;
    last_message_preview: string | null;
    last_message_at: Date | null;
  }>(
    `
    SELECT id, client_id,
           ${leadColumnAvailable ? 'lead_id,' : ''}
           metadata,
           contact_name, profile_name, phone_number,
           display_name, avatar_url,
           avatar_cached_url, avatar_source_url,
           canonical_chat_id, canonical_phone,
           identity_source, identity_strength, identity_state,
           history_sync_status, last_history_sync_reason,
           last_message_preview, last_message_at
    FROM chat_conversations
    WHERE instance_id = $1 AND external_chat_id = $2
    LIMIT 1
    `,
    [instance.id, chatData.externalChatId]
  );

  let result;
  let insertedNewConversation = false;
  if ((existingResult.rowCount ?? 0) > 0) {
    const current = existingResult.rows[0];
    const currentMeta = (current.metadata as Record<string, unknown> | null) ?? {};
    const currentLeadId = leadColumnAvailable ? (current.lead_id ?? null) : null;
    const currentSource = (currentMeta.link_source as LinkSource | undefined) ?? 'system';
    const manualLink = currentSource === 'manual' && !isGroupConversation;

    let nextClientId = current.client_id ?? null;
    let nextLeadId = currentLeadId;
    let linkSource: LinkSource = manualLink ? 'manual' : 'system';
    let linkConfidence: LinkConfidence = manualLink ? 'manual' : 'review';

    if (!manualLink && match.confidence === 'high_confidence' && match.suggestedId) {
      if (match.suggestedType === 'client') {
        nextClientId = match.suggestedId;
        nextLeadId = null;
        linkSource = 'auto';
        linkConfidence = 'high';
      } else if (match.suggestedType === 'lead' && leadColumnAvailable) {
        nextClientId = null;
        nextLeadId = match.suggestedId;
        linkSource = 'auto';
        linkConfidence = 'high';
      }
    } else if (!manualLink && nextClientId == null && nextLeadId == null) {
      linkSource = 'system';
      linkConfidence = match.confidence === 'ambiguous' ? 'review' : 'high';
    }

    if (isGroupConversation) {
      nextClientId = null;
      nextLeadId = null;
      linkSource = 'system';
      linkConfidence = 'review';
    }

    const linkState = isGroupConversation
      ? 'unlinked'
      : nextClientId != null
        ? 'client_linked'
        : nextLeadId != null
          ? 'lead_linked'
          : match.confidence === 'ambiguous'
            ? 'review_required'
            : 'unlinked';

    const phoneDigitsForMerge =
      chatData.phoneNumber?.trim() || current.phone_number?.trim() || null;

    const mergedContactName = mergeContactNameForUpsert(
      current.contact_name,
      chatData.contactName,
      phoneDigitsForMerge,
      chatData.externalChatId
    );
    const mergedProfileName = mergeProfileNameForUpsert(
      current.profile_name,
      chatData.profileName,
      mergedContactName,
      phoneDigitsForMerge,
      chatData.externalChatId
    );
    const mergedPhone = mergePhoneForUpsert(current.phone_number, chatData.phoneNumber);

    const existingLastAt = current.last_message_at ? new Date(current.last_message_at) : null;
    const mergedLastAt = mergeLastMessageAtForUpsert(existingLastAt, chatData.lastMessageAt);
    const mergedPreview = mergeLastMessagePreviewForUpsert(
      current.last_message_preview,
      existingLastAt,
      chatData.lastMessagePreview,
      chatData.lastMessageAt
    );

    const mergedMetaBase = mergeChatMetadataForIdentity(
      currentMeta,
      chatData.metadata as Record<string, unknown> | null
    );
    const mergedMeta = {
      ...mergedMetaBase,
      ...(isGroupConversation ? {} : buildMatchMetadata(match)),
      link_source: linkSource,
      link_confidence: linkConfidence,
      link_state: linkState,
      updated_by_sync_at: new Date().toISOString(),
    };

    const incomingCanon = computeCanonicalIdentityFromChatPayload({
      external_chat_id: chatData.externalChatId,
      phone_number: mergedPhone,
      contact_name: mergedContactName,
      profile_name: mergedProfileName,
      metadata: mergedMeta,
    });
    const cur = current as Record<string, unknown>;
    const snap: CanonicalRowSnapshot = {
      display_name: (cur.display_name as string) ?? null,
      contact_name: current.contact_name,
      profile_name: current.profile_name,
      phone_number: current.phone_number,
      avatar_url: (cur.avatar_url as string) ?? null,
      canonical_chat_id: (cur.canonical_chat_id as string) ?? null,
      canonical_phone: (cur.canonical_phone as string) ?? null,
      identity_source: (cur.identity_source as string) ?? null,
      identity_strength: (cur.identity_strength as string) ?? null,
      identity_state: (cur.identity_state as string) ?? null,
      history_sync_status: (cur.history_sync_status as string) ?? null,
      metadata: currentMeta,
    };
    const { merged: fc, degraded_write_blocked, merge_decision } = mergeCanonicalIdentityForUpsert(
      chatData.externalChatId,
      snap,
      incomingCanon,
      {
        incomingMetadataHasEmptyImages: incomingChatPayloadHasEmptyProfileImages(
          chatData.metadata as Record<string, unknown>
        ),
      }
    );
    const avatarPatch = await resolveConversationAvatarWithCache({
      tenantId,
      userId: instance.user_id,
      mergedAvatarUrl: fc.avatar_url,
      existingAvatarUrl: snap.avatar_url,
      existingCachedUrl: (current as { avatar_cached_url?: string | null }).avatar_cached_url ?? null,
      existingSourceUrl: (current as { avatar_source_url?: string | null }).avatar_source_url ?? null,
    });
    logUazChat('info', {
      event_type: 'conversation_upsert',
      phase: 'canonical_identity_merge',
      tenant_id: tenantId,
      user_id: instance.user_id,
      instance_id: instance.id,
      provider_chat_id_raw: chatData.externalChatId,
      canonical_chat_id: fc.canonical_chat_id,
      identity_source: fc.identity_source,
      identity_strength: fc.identity_strength,
      identity_state: fc.identity_state,
      history_sync_status: fc.history_sync_status,
      last_history_sync_reason: fc.last_history_sync_reason,
      merge_decision,
      degraded_write_blocked,
    });

    const conversationId = current.id;
    if (leadColumnAvailable) {
      result = await pool.query(
        `
        UPDATE chat_conversations SET
          external_fast_id = COALESCE($1, external_fast_id),
          contact_name = $2,
          profile_name = $3,
          phone_number = $4,
          status = COALESCE($5, status),
          last_message_preview = $6,
          last_message_at = $7::timestamptz,
          unread_count = COALESCE($8, unread_count),
          metadata = CASE
            WHEN COALESCE(metadata->>'link_source', 'system') = 'manual'
              THEN COALESCE(metadata, '{}'::jsonb) || ($9::jsonb - 'link_source' - 'link_confidence' - 'link_state')
            ELSE $9::jsonb
          END,
          client_id = CASE
            WHEN $27::text = 'group' THEN NULL
            WHEN COALESCE(metadata->>'link_source', 'system') = 'manual' THEN client_id
            ELSE $10
          END,
          lead_id = CASE
            WHEN $27::text = 'group' THEN NULL
            WHEN COALESCE(metadata->>'link_source', 'system') = 'manual' THEN lead_id
            ELSE $11
          END,
          phone_key = COALESCE($12, phone_key),
          canonical_chat_id = $13,
          canonical_phone = $14,
          display_name = $15,
          avatar_url = $16,
          avatar_cached_url = COALESCE($17::text, avatar_cached_url),
          avatar_source_url = COALESCE($18::text, avatar_source_url),
          avatar_cached_at = COALESCE($19::timestamptz, avatar_cached_at),
          avatar_cache_status = COALESCE($20::text, avatar_cache_status),
          identity_source = $21,
          identity_strength = $22,
          identity_state = $23,
          history_sync_status = $24,
          last_history_sync_reason = $25,
          provider = 'whatsapp_uazapi',
          provider_conversation_id = COALESCE(provider_conversation_id, $26),
          conversation_type = $27::text,
          communication_contact_id = CASE
            WHEN $27::text = 'group' THEN NULL
            ELSE COALESCE($28::uuid, communication_contact_id)
          END,
          updated_at = now()
        WHERE id = $29
        RETURNING *
        `,
        [
          chatData.externalFastId,
          mergedContactName,
          mergedProfileName,
          mergedPhone,
          chatData.status || 'open',
          mergedPreview,
          mergedLastAt,
          chatData.unreadCount || 0,
          JSON.stringify(mergedMeta),
          nextClientId,
          nextLeadId,
          phoneKey,
          fc.canonical_chat_id,
          fc.canonical_phone,
          fc.display_name,
          avatarPatch.avatar_url,
          avatarPatch.avatar_cached_url,
          avatarPatch.avatar_source_url,
          avatarPatch.avatar_cached_at,
          avatarPatch.avatar_cache_status,
          fc.identity_source,
          fc.identity_strength,
          fc.identity_state,
          fc.history_sync_status,
          fc.last_history_sync_reason,
          chatData.externalChatId,
          conversationType,
          opts?.communicationContactId ?? null,
          conversationId,
        ]
      );
    } else {
      result = await pool.query(
        `
        UPDATE chat_conversations SET
          external_fast_id = COALESCE($1, external_fast_id),
          contact_name = $2,
          profile_name = $3,
          phone_number = $4,
          status = COALESCE($5, status),
          last_message_preview = $6,
          last_message_at = $7::timestamptz,
          unread_count = COALESCE($8, unread_count),
          metadata = CASE
            WHEN COALESCE(metadata->>'link_source', 'system') = 'manual'
              THEN COALESCE(metadata, '{}'::jsonb) || ($9::jsonb - 'link_source' - 'link_confidence' - 'link_state')
            ELSE $9::jsonb
          END,
          client_id = CASE
            WHEN $26::text = 'group' THEN NULL
            WHEN COALESCE(metadata->>'link_source', 'system') = 'manual' THEN client_id
            ELSE $10
          END,
          phone_key = COALESCE($11, phone_key),
          canonical_chat_id = $12,
          canonical_phone = $13,
          display_name = $14,
          avatar_url = $15,
          avatar_cached_url = COALESCE($16::text, avatar_cached_url),
          avatar_source_url = COALESCE($17::text, avatar_source_url),
          avatar_cached_at = COALESCE($18::timestamptz, avatar_cached_at),
          avatar_cache_status = COALESCE($19::text, avatar_cache_status),
          identity_source = $20,
          identity_strength = $21,
          identity_state = $22,
          history_sync_status = $23,
          last_history_sync_reason = $24,
          provider = 'whatsapp_uazapi',
          provider_conversation_id = COALESCE(provider_conversation_id, $25),
          conversation_type = $26::text,
          communication_contact_id = CASE
            WHEN $26::text = 'group' THEN NULL
            ELSE COALESCE($27::uuid, communication_contact_id)
          END,
          updated_at = now()
        WHERE id = $28
        RETURNING *
        `,
        [
          chatData.externalFastId,
          mergedContactName,
          mergedProfileName,
          mergedPhone,
          chatData.status || 'open',
          mergedPreview,
          mergedLastAt,
          chatData.unreadCount || 0,
          JSON.stringify(mergedMeta),
          nextClientId,
          phoneKey,
          fc.canonical_chat_id,
          fc.canonical_phone,
          fc.display_name,
          avatarPatch.avatar_url,
          avatarPatch.avatar_cached_url,
          avatarPatch.avatar_source_url,
          avatarPatch.avatar_cached_at,
          avatarPatch.avatar_cache_status,
          fc.identity_source,
          fc.identity_strength,
          fc.identity_state,
          fc.history_sync_status,
          fc.last_history_sync_reason,
          chatData.externalChatId,
          conversationType,
          opts?.communicationContactId ?? null,
          conversationId,
        ]
      );
    }
    if (!manualLink && linkSource === 'auto' && nextClientId && nextClientId !== (current.client_id ?? null)) {
      autoLinkedClientIdForTimeline = nextClientId;
    }

    const updRow = result.rows[0];
    if (tenantId && !isGroupConversation && updRow) {
      const actor = instance.user_id;
      const cid = String(updRow.id);
      const hadLead = Boolean(currentLeadId);
      const hasLead = leadColumnAvailable ? Boolean((updRow as { lead_id?: string | null }).lead_id) : false;
      const hadClient = Boolean(current.client_id);
      const hasClient = Boolean(updRow.client_id);
      if (!hadLead && hasLead) {
        void applyKanbanAutomationForConversation({
          tenantId,
          actorUserId: actor,
          conversationId: cid,
          reason: 'lead_linked',
        }).catch((err) => console.error('[kanban-entry-automation] lead_linked (sync upsert)', err));
      }
      if (!hadClient && hasClient) {
        void applyKanbanAutomationForConversation({
          tenantId,
          actorUserId: actor,
          conversationId: cid,
          reason: 'client_linked',
        }).catch((err) => console.error('[kanban-entry-automation] client_linked (sync upsert)', err));
      }
    }
  } else {
    insertedNewConversation = true;
    let clientId: string | null = null;
    let leadId: string | null = null;
    let linkSource: LinkSource = 'system';
    let linkConfidence: LinkConfidence = 'review';
    if (match.confidence === 'high_confidence' && match.suggestedId) {
      if (match.suggestedType === 'client') {
        clientId = match.suggestedId;
        linkSource = 'auto';
        linkConfidence = 'high';
      } else if (match.suggestedType === 'lead' && leadColumnAvailable) {
        leadId = match.suggestedId;
        linkSource = 'auto';
        linkConfidence = 'high';
      }
    }
    if (isGroupConversation) {
      clientId = null;
      leadId = null;
      linkSource = 'system';
      linkConfidence = 'review';
    }
    const linkState =
      clientId != null
        ? 'client_linked'
        : leadId != null
          ? 'lead_linked'
          : match.confidence === 'ambiguous'
            ? 'review_required'
            : 'unlinked';

    const insertPhoneDigits = chatData.phoneNumber?.trim() || null;
    const insertContactName = mergeContactNameForUpsert(
      null,
      chatData.contactName,
      insertPhoneDigits,
      chatData.externalChatId
    );
    const insertProfileName = mergeProfileNameForUpsert(
      null,
      chatData.profileName,
      insertContactName,
      insertPhoneDigits,
      chatData.externalChatId
    );
    const insertPhone = mergePhoneForUpsert(null, chatData.phoneNumber);

    const insertMetaBase = mergeChatMetadataForIdentity(
      {},
      chatData.metadata as Record<string, unknown> | null
    );
    const metadata = {
      ...insertMetaBase,
      ...(isGroupConversation ? {} : buildMatchMetadata(match)),
      link_source: linkSource,
      link_confidence: linkConfidence,
      link_state: linkState,
      created_by_sync_at: new Date().toISOString(),
    };

    const insertCanon = computeCanonicalIdentityFromChatPayload({
      external_chat_id: chatData.externalChatId,
      phone_number: insertPhone,
      contact_name: insertContactName,
      profile_name: insertProfileName,
      metadata: metadata as Record<string, unknown>,
    });
    const { merged: fcInsert } = mergeCanonicalIdentityForUpsert(
      chatData.externalChatId,
      null,
      insertCanon,
      {
        incomingMetadataHasEmptyImages: incomingChatPayloadHasEmptyProfileImages(
          chatData.metadata as Record<string, unknown>
        ),
      }
    );
    logUazChat('info', {
      event_type: 'conversation_upsert',
      phase: 'canonical_identity_insert',
      tenant_id: tenantId,
      user_id: instance.user_id,
      instance_id: instance.id,
      provider_chat_id_raw: chatData.externalChatId,
      canonical_chat_id: fcInsert.canonical_chat_id,
      identity_state: fcInsert.identity_state,
      history_sync_status: fcInsert.history_sync_status,
      last_history_sync_reason: fcInsert.last_history_sync_reason,
      merge_decision: 'insert_incoming_only',
    });

    const avatarInsertPatch = await resolveConversationAvatarWithCache({
      tenantId,
      userId: instance.user_id,
      mergedAvatarUrl: fcInsert.avatar_url,
      existingAvatarUrl: null,
      existingCachedUrl: null,
      existingSourceUrl: null,
    });

    /** Novas conversas por sync/webhook: equivalente ao legado "sem atendente" → pending (Fase 5). */
    const attendanceStatusForInsert = normalizeAttendanceStatusForDb(undefined);

    if (leadColumnAvailable) {
      result = await pool.query(
        `
        INSERT INTO chat_conversations (
          user_id, instance_id, external_chat_id, external_fast_id,
          contact_name, profile_name, phone_number, status,
          last_message_preview, last_message_at, unread_count, metadata,
          client_id, lead_id, phone_key,
          canonical_chat_id, canonical_phone, display_name, avatar_url,
          avatar_cached_url, avatar_source_url, avatar_cached_at, avatar_cache_status,
          identity_source, identity_strength, identity_state, history_sync_status, last_history_sync_reason,
          provider, provider_conversation_id, communication_contact_id, conversation_type, attendance_status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'open'), $9, $10, COALESCE($11, 0), $12::jsonb, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, 'whatsapp_uazapi', $29, $30, $31, $32)
        RETURNING *
        `,
        [
          instance.user_id,
          instance.id,
          chatData.externalChatId,
          chatData.externalFastId,
          insertContactName,
          insertProfileName,
          insertPhone,
          chatData.status,
          chatData.lastMessagePreview,
          chatData.lastMessageAt,
          chatData.unreadCount,
          JSON.stringify(metadata),
          clientId,
          leadId,
          phoneKey,
          fcInsert.canonical_chat_id,
          fcInsert.canonical_phone,
          fcInsert.display_name,
          avatarInsertPatch.avatar_url,
          avatarInsertPatch.avatar_cached_url,
          avatarInsertPatch.avatar_source_url,
          avatarInsertPatch.avatar_cached_at,
          avatarInsertPatch.avatar_cache_status,
          fcInsert.identity_source,
          fcInsert.identity_strength,
          fcInsert.identity_state,
          fcInsert.history_sync_status,
          fcInsert.last_history_sync_reason,
          chatData.externalChatId,
          opts?.communicationContactId ?? null,
          conversationType,
          attendanceStatusForInsert,
        ]
      );
    } else {
      result = await pool.query(
        `
        INSERT INTO chat_conversations (
          user_id, instance_id, external_chat_id, external_fast_id,
          contact_name, profile_name, phone_number, status,
          last_message_preview, last_message_at, unread_count, metadata,
          client_id, phone_key,
          canonical_chat_id, canonical_phone, display_name, avatar_url,
          avatar_cached_url, avatar_source_url, avatar_cached_at, avatar_cache_status,
          identity_source, identity_strength, identity_state, history_sync_status, last_history_sync_reason,
          provider, provider_conversation_id, communication_contact_id, conversation_type, attendance_status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'open'), $9, $10, COALESCE($11, 0), $12::jsonb, $13, $14,
          $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, 'whatsapp_uazapi', $28, $29, $30, $31)
        RETURNING *
        `,
        [
          instance.user_id,
          instance.id,
          chatData.externalChatId,
          chatData.externalFastId,
          insertContactName,
          insertProfileName,
          insertPhone,
          chatData.status,
          chatData.lastMessagePreview,
          chatData.lastMessageAt,
          chatData.unreadCount,
          JSON.stringify(metadata),
          clientId,
          phoneKey,
          fcInsert.canonical_chat_id,
          fcInsert.canonical_phone,
          fcInsert.display_name,
          avatarInsertPatch.avatar_url,
          avatarInsertPatch.avatar_cached_url,
          avatarInsertPatch.avatar_source_url,
          avatarInsertPatch.avatar_cached_at,
          avatarInsertPatch.avatar_cache_status,
          fcInsert.identity_source,
          fcInsert.identity_strength,
          fcInsert.identity_state,
          fcInsert.history_sync_status,
          fcInsert.last_history_sync_reason,
          chatData.externalChatId,
          opts?.communicationContactId ?? null,
          conversationType,
          attendanceStatusForInsert,
        ]
      );
    }
    if (linkSource === 'auto' && clientId) {
      autoLinkedClientIdForTimeline = clientId;
    }
  }

    if (result.rowCount === 0 || !result.rows[0]) {
      console.error(`[UpsertConversation ${upsertId}] No row returned from database`);
      return null;
    }

    console.log(`[UpsertConversation ${upsertId}] Successfully upserted conversation`, {
      conversationId: result.rows[0].id,
      externalChatId: result.rows[0].external_chat_id,
      clientId: result.rows[0].client_id,
      wasInsert: !result.rows[0].updated_at || new Date(result.rows[0].updated_at).getTime() === new Date(result.rows[0].created_at).getTime(),
    });

    const upserted = result.rows[0];
    if (tenantId && autoLinkedClientIdForTimeline) {
      const referenceId = String(upserted.id);
      await createClientTimelineEvent({
        tenantId,
        clientId: autoLinkedClientIdForTimeline,
        eventName: 'chat_match_client_success',
        source: 'chat',
        actorType: 'system',
        actorId: null,
        referenceType: 'chat_conversation',
        referenceId,
        eventKey: `chat_match_client_success:${referenceId}:${autoLinkedClientIdForTimeline}`,
        metadata: {
          link_source: 'auto',
          link_confidence: 'high',
        },
      });
      await createClientTimelineEvent({
        tenantId,
        clientId: autoLinkedClientIdForTimeline,
        eventName: 'chat_link_auto_effective',
        source: 'chat',
        actorType: 'system',
        actorId: null,
        referenceType: 'chat_conversation',
        referenceId,
        eventKey: `chat_link_auto_effective:${referenceId}:${autoLinkedClientIdForTimeline}`,
        metadata: {
          link_source: 'auto',
          link_state: 'client_linked',
        },
      });
    }
    if (tenantId && !isGroupConversation) {
      try {
        await upsertCommunicationContactFromProvider({
          tenantId,
          provider: DEFAULT_COMMUNICATION_PROVIDER,
          providerContactId: deriveProviderContactIdFromConversation(upserted as Record<string, unknown>),
          phone: (upserted.phone_number as string | null) ?? null,
          displayName:
            ((upserted.display_name as string | null) ??
              (upserted.contact_name as string | null) ??
              (upserted.profile_name as string | null) ??
              null),
          profileAvatarUrl: ((upserted as Record<string, unknown>).avatar_url as string | null) ?? null,
          avatarCachedUrl: ((upserted as Record<string, unknown>).avatar_cached_url as string | null) ?? null,
          avatarSourceUrl: ((upserted as Record<string, unknown>).avatar_source_url as string | null) ?? null,
          avatarCachedAt: (() => {
            const v = (upserted as Record<string, unknown>).avatar_cached_at;
            if (v == null) return null;
            if (v instanceof Date) return v;
            if (typeof v === 'string') return v;
            return null;
          })(),
          avatarCacheStatus: ((upserted as Record<string, unknown>).avatar_cache_status as string | null) ?? null,
          linkedClientId: (upserted.client_id as string | null) ?? null,
          linkedLeadId: ((upserted as Record<string, unknown>).lead_id as string | null) ?? null,
          rawProfile:
            (upserted.metadata as Record<string, unknown> | null) ??
            (chatData.metadata as Record<string, unknown> | null) ??
            null,
        });
      } catch (contactError: any) {
        console.error('[CommunicationContact] Falha ao sincronizar identidade técnica:', {
          conversationId: upserted.id,
          error: contactError?.message ?? String(contactError),
        });
      }
    }
    if (!isGroupConversation) {
      await persistConversationAvatarOnCrm(
        instance.user_id,
        (upserted.client_id as string | null) ?? null,
        ((upserted as Record<string, unknown>).lead_id as string | null) ?? null,
        ((upserted as Record<string, unknown>).avatar_url as string | null) ?? null,
        {
          cachedUrl: ((upserted as Record<string, unknown>).avatar_cached_url as string | null) ?? null,
          sourceUrl: ((upserted as Record<string, unknown>).avatar_source_url as string | null) ?? null,
          cachedAt: (upserted as Record<string, unknown>).avatar_cached_at as Date | null ?? null,
          status: ((upserted as Record<string, unknown>).avatar_cache_status as string | null) ?? null,
        },
      );
    }

    if (tenantId && !isGroupConversation && insertedNewConversation) {
      const actor = instance.user_id;
      const cid = String(upserted.id);
      void applyKanbanAutomationForConversation({
        tenantId,
        actorUserId: actor,
        conversationId: cid,
        reason: 'new_conversation',
      }).catch((err) => console.error('[kanban-entry-automation] new_conversation', err));
      if (leadColumnAvailable && (upserted as { lead_id?: string | null }).lead_id) {
        void applyKanbanAutomationForConversation({
          tenantId,
          actorUserId: actor,
          conversationId: cid,
          reason: 'lead_linked',
        }).catch((err) => console.error('[kanban-entry-automation] lead_linked (insert)', err));
      }
      if ((upserted as { client_id?: string | null }).client_id) {
        void applyKanbanAutomationForConversation({
          tenantId,
          actorUserId: actor,
          conversationId: cid,
          reason: 'client_linked',
        }).catch((err) => console.error('[kanban-entry-automation] client_linked (insert)', err));
      }
    }

  return upserted;
  } catch (error: any) {
    const code = error?.code as string | undefined;
    const constraint = error?.constraint as string | undefined;
    const externalChatId = chatData.externalChatId;
    const instanceId = instance.id;
    /** Caminho insert define explicitamente; update não altera attendance_status. */
    const attendanceStatusIfInsert = normalizeAttendanceStatusForDb(undefined);
    if (code === '23514') {
      console.error(`[UpsertConversation ${upsertId}] check_violation`, {
        code,
        constraint: constraint ?? 'unknown',
        externalChatId,
        instanceId,
        attendance_status_on_insert: attendanceStatusIfInsert,
      });
    } else {
      console.error(`[UpsertConversation ${upsertId}] Database error`, {
        code,
        constraint,
        externalChatId,
        instanceId,
        message: error?.message,
      });
    }
    throw error;
  }
}

async function saveMessage(
  conversationId: string,
  direction: 'incoming' | 'outgoing',
  payload: {
    externalMessageId?: string | null;
    body?: string | null;
    media?: any;
    status?: string | null;
    sentAt?: Date | null;
    metadata?: any;
    skipUnreadUpdate?: boolean;
    resetUnread?: boolean;
    /** Força kind no contrato (ex.: image no envio pelo painel). */
    messageKind?: ChatMessageKind | null;
    replyToMessageId?: string | null;
    replyToExternalMessageId?: string | null;
    replyPreview?: string | null;
    replySenderName?: string | null;
    replyMessageType?: string | null;
    /** Idempotência / fila no cliente (coluna dedicada + metadata). */
    clientMessageId?: string | null;
    /** Provider para `chat_messages.provider` (padrão UazAPI). */
    messageProvider?: 'whatsapp_uazapi' | 'whatsapp_official';
  }
): Promise<{ rowId: string | null; inserted: boolean }> {
  const saveId = randomUUID().substring(0, 8);
  const rawMeta =
    payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {};
  let mediaArr: ChatMediaItem[] = Array.isArray(payload.media)
    ? (payload.media as ChatMediaItem[])
    : payload.media
      ? [payload.media as ChatMediaItem]
      : [];
  mediaArr = sanitizeMediaItemsForDb(mediaArr);
  const bodyCoerced = ensurePlainString(payload.body ?? '');
  const bodyForInsert = bodyCoerced.length > 0 ? bodyCoerced : null;
  const messageContract = buildMessageContract({
    direction,
    body: bodyForInsert,
    media: mediaArr,
    kindHint: payload.messageKind ?? null,
    externalMessageId: payload.externalMessageId ?? null,
    status: payload.status ?? null,
  });
  const metadataMerged = attachContractToMetadata(rawMeta as Record<string, unknown>, messageContract);

  const saveVerbose = isChatSaveVerboseLogs();
  if (saveVerbose) {
  console.log(`[SaveMessage ${saveId}] Starting save`, {
    conversationId,
    direction,
    externalMessageId: payload.externalMessageId,
      bodyPreview: (bodyForInsert ?? '').substring(0, 50),
      hasMedia: mediaArr.length > 0,
      kind: messageContract.kind,
    });
  }

  const replyToMessageId = payload.replyToMessageId ?? null;
  const replyToExternalMessageId = payload.replyToExternalMessageId ?? null;
  const replyPreview = payload.replyPreview ?? null;
  const replySenderName = payload.replySenderName ?? null;
  const replyMessageType = payload.replyMessageType ?? null;
  const clientMessageIdForRow =
    typeof payload.clientMessageId === 'string' && payload.clientMessageId.length > 0
      ? payload.clientMessageId
      : null;
  const messageProviderRow = payload.messageProvider ?? 'whatsapp_uazapi';

  try {
    let messageResult: {
      rows: Array<{ id: string; created_at: string; inserted: boolean }>;
      rowCount?: number | null;
    };
    try {
      messageResult = await pool.query<{ id: string; created_at: string; inserted: boolean }>(
    `
    INSERT INTO chat_messages (
      conversation_id, direction, external_message_id, body,
      media, status, sent_at, metadata, provider,
      reply_to_message_id, reply_to_external_message_id, reply_preview, reply_sender_name, reply_message_type,
      client_message_id
    )
    VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb, $15,
      $9, $10, $11, $12, $13, $14)
    ON CONFLICT (conversation_id, external_message_id)
    DO UPDATE SET
      status = COALESCE(EXCLUDED.status, chat_messages.status),
      metadata = EXCLUDED.metadata,
      sent_at = COALESCE(EXCLUDED.sent_at, chat_messages.sent_at),
      body = COALESCE(EXCLUDED.body, chat_messages.body),
      media = CASE
        WHEN EXCLUDED.media IS NOT NULL
          AND jsonb_typeof(EXCLUDED.media) = 'array'
          AND jsonb_array_length(EXCLUDED.media) > 0
        THEN EXCLUDED.media
        ELSE COALESCE(chat_messages.media, EXCLUDED.media)
      END,
      reply_to_message_id = COALESCE(EXCLUDED.reply_to_message_id, chat_messages.reply_to_message_id),
      reply_to_external_message_id = COALESCE(EXCLUDED.reply_to_external_message_id, chat_messages.reply_to_external_message_id),
      reply_preview = COALESCE(EXCLUDED.reply_preview, chat_messages.reply_preview),
      reply_sender_name = COALESCE(EXCLUDED.reply_sender_name, chat_messages.reply_sender_name),
      reply_message_type = COALESCE(EXCLUDED.reply_message_type, chat_messages.reply_message_type),
      client_message_id = COALESCE(EXCLUDED.client_message_id, chat_messages.client_message_id)
      RETURNING id, created_at, (xmax = 0) AS inserted
  `,
    [
      conversationId,
      direction,
      payload.externalMessageId,
          bodyForInsert,
          JSON.stringify(mediaArr.length > 0 ? mediaArr : []),
      payload.status,
      payload.sentAt,
          JSON.stringify(metadataMerged),
          replyToMessageId,
          replyToExternalMessageId,
          replyPreview,
          replySenderName,
          replyMessageType,
          clientMessageIdForRow,
          messageProviderRow,
        ]
      );
    } catch (insErr: any) {
      if (insErr?.code === '23505' && clientMessageIdForRow) {
        const dup = await pool.query<{ id: string; created_at: string }>(
          `SELECT id, created_at FROM chat_messages WHERE conversation_id = $1 AND client_message_id = $2::uuid LIMIT 1`,
          [conversationId, clientMessageIdForRow]
        );
        if (dup.rows[0]) {
          messageResult = {
            rows: [{ id: dup.rows[0].id, created_at: dup.rows[0].created_at, inserted: false }],
            rowCount: 1,
          };
        } else {
          throw insErr;
        }
      } else {
        throw insErr;
      }
    }

    if (messageResult.rowCount === 0) {
      console.warn(`[SaveMessage ${saveId}] No row returned from message insert`);
    } else if (saveVerbose) {
      const messageCreatedAt = new Date(messageResult.rows[0]?.created_at).getTime();
      const now = Date.now();
      const wasInsert = messageResult.rows[0]?.inserted === true || (now - messageCreatedAt) < 2000;
      console.log(`[SaveMessage ${saveId}] Message saved successfully`, {
        messageId: messageResult.rows[0]?.id,
        wasInsert,
        createdAt: messageResult.rows[0]?.created_at,
      });
    }

    const inserted = messageResult.rows[0]?.inserted === true;
    if (!inserted && payload.externalMessageId) {
      console.log('[realtime_duplicate_message_skipped]', {
        conversationId,
        externalMessageId: payload.externalMessageId,
      });
      return { rowId: messageResult.rows[0]?.id ?? null, inserted: false };
    }

    const unreadShouldReset = payload.resetUnread === true;
    const skipUnread = payload.skipUnreadUpdate === true;
    const effectiveSentAt = payload.sentAt || new Date();
    const hasMedia = mediaArr.length > 0;
    const messagePreview =
      bodyCoerced.length > 0 ? bodyCoerced : hasMedia ? '[Mídia]' : null;

    const conversationResult = await pool.query(
      `
      UPDATE chat_conversations
      SET
        last_message_preview = CASE
          WHEN last_message_at IS NULL OR $3::timestamptz >= last_message_at THEN COALESCE($2, last_message_preview)
          ELSE last_message_preview
        END,
        last_message_at = CASE
          WHEN last_message_at IS NULL OR $3::timestamptz >= last_message_at THEN $3::timestamptz
          ELSE last_message_at
        END,
        unread_count = CASE
          WHEN $4 THEN unread_count
          WHEN $5 = 'incoming' THEN unread_count + 1
          WHEN $6 THEN 0
          ELSE unread_count
        END,
        updated_at = now()
      WHERE id = $1
      RETURNING id, unread_count, last_message_at, last_message_preview, updated_at
    `,
      [
        conversationId,
        messagePreview,
        effectiveSentAt,
        skipUnread,
        direction,
        unreadShouldReset,
      ]
    );

    if (conversationResult.rowCount === 0) {
      console.warn(`[SaveMessage ${saveId}] Conversation not found for update`, { conversationId });
    } else {
      if (await hasChatPhase5SlaColumns()) {
        try {
          if (direction === 'incoming') {
            await pool.query(
              `UPDATE chat_conversations SET
                 last_customer_message_at = now(),
                 attendance_status = CASE
                   WHEN attendance_status = 'archived' THEN attendance_status
                   WHEN assigned_to_user_id IS NOT NULL THEN 'in_progress'
                   WHEN attendance_status = 'closed' THEN 'pending'
                   ELSE attendance_status
                 END,
                 closed_at = CASE
                   WHEN attendance_status = 'closed' THEN NULL
                   ELSE closed_at
                 END,
                 closed_by = CASE
                   WHEN attendance_status = 'closed' THEN NULL
                   ELSE closed_by
                 END,
                 updated_at = now()
               WHERE id = $1`,
              [conversationId]
            );
          } else if (direction === 'outgoing') {
            await pool.query(
              `UPDATE chat_conversations SET
                 last_agent_message_at = now(),
                 first_response_at = COALESCE(first_response_at, now()),
                 updated_at = now()
               WHERE id = $1`,
              [conversationId]
            );
          }
        } catch (slaErr: unknown) {
          console.warn('[SaveMessage] SLA columns update skipped', slaErr);
        }
      }
      try {
        await applyChatPhase6MessageStatus(conversationId, direction);
      } catch (p6Err: unknown) {
        console.warn('[SaveMessage] Phase 6 status automation skipped', p6Err);
      }
      if (saveVerbose) {
      const updated = conversationResult.rows[0];
      console.log(`[SaveMessage ${saveId}] Conversation updated successfully`, {
        conversationId: updated?.id,
        unreadCount: updated?.unread_count,
        lastMessageAt: updated?.last_message_at,
        lastMessagePreview: updated?.last_message_preview,
        updatedAt: updated?.updated_at,
        newMessageSentAt: effectiveSentAt,
        newMessagePreview: messagePreview?.substring(0, 50),
      });
    }
    }

    if (inserted && direction === 'incoming') {
      void runInboundChatRoutingAsync({
        conversationId,
        messageBody: bodyForInsert,
        inserted: true,
      }).catch((e) => console.warn('[SaveMessage] inbound routing async failed', e));
      void runChatbotPhase8Inbound({
        conversationId,
        messageBody: bodyForInsert,
        inserted: true,
      }).catch((e) => console.warn('[SaveMessage] chatbot phase8 async failed', e));
    }

    return { rowId: messageResult.rows[0]?.id ?? null, inserted: true };
  } catch (error: any) {
    console.error(`[SaveMessage ${saveId}] Database error:`, {
      error: error.message,
      code: error.code,
      detail: error.detail,
      stack: error.stack,
      conversationId,
      direction,
    });
    throw error;
  }
}

/**
 * Alinha last_message_at / last_message_preview ao último registro real em chat_messages
 * (útil após sync em lote quando a ordem de processamento não reflete o último evento).
 */
async function reconcileConversationLastMessage(conversationId: string): Promise<void> {
  const r = await pool.query<{ body: string | null; sent_at: Date | null; media: unknown }>(
    `SELECT body, sent_at, media FROM chat_messages
     WHERE conversation_id = $1
     ORDER BY sent_at DESC NULLS LAST, created_at DESC
     LIMIT 1`,
    [conversationId]
  );
  if (r.rowCount === 0) return;
  const row = r.rows[0];
  const bodyTrim = row.body?.trim() || '';
  const hasMedia = Array.isArray(row.media) && (row.media as unknown[]).length > 0;
  if (!bodyTrim && !hasMedia) return;
  const preview = bodyTrim || '[Mídia]';
  const effectiveAt = row.sent_at || new Date();
  await pool.query(
    `UPDATE chat_conversations SET
       last_message_preview = $2,
       last_message_at = $3,
       updated_at = now()
     WHERE id = $1`,
    [conversationId, preview, effectiveAt]
  );
}

export async function listInstances(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const rows = await listInstancesForActor(userId);
  const out = rows.map((row) => decorateInstanceForApi(row, userId));
  res.json(out);
}

export async function createInstance(req: AuthRequest, res: Response) {
  const verboseCreate = isUazIntegrationVerboseLogs();
  try {
    if (verboseCreate) {
    console.log('[CreateInstance] Starting instance creation...');
    }
    
    if (!isUazapiAdminConfigured()) {
      console.error('[CreateInstance] UAZAPI_ADMIN_TOKEN ausente ou em branco no servidor');
      res.status(503).json({
        error:
          'Integração WhatsApp (UazAPI) não está configurada no servidor. Defina UAZAPI_ADMIN_TOKEN no ambiente.',
        code: 'UAZAPI_NOT_CONFIGURED',
        details:
          'Token administrativo do provedor UazAPI ausente (variável de ambiente no backend, não é o login do usuário).',
      });
      return;
    }

    const userId = req.userId!;
    
    // Validar dados
    let data;
    try {
      data = instanceSchema.parse(req.body);
      if (verboseCreate) {
      console.log('[CreateInstance] Validated data:', { name: data.name });
      }
    } catch (validationError: any) {
      console.error('[CreateInstance] Validation error:', validationError.errors);
      res.status(400).json({ 
        error: 'Invalid instance data',
        details: validationError.errors 
      });
      return;
    }

    const dupEarly = await pool.query(`SELECT id FROM chat_instances WHERE user_id = $1 AND name = $2`, [
      userId,
      data.name,
    ]);
    if (dupEarly.rowCount && dupEarly.rowCount > 0) {
      res.status(409).json({
        error: 'Já existe uma instância com este nome para sua conta.',
        code: 'DUPLICATE_INSTANCE_NAME',
      });
      return;
    }

    // Criar instância na UazAPI
    let remoteInstance: AnyObject;
    try {
      if (verboseCreate) {
      console.log('[CreateInstance] Calling UazAPI createInstance...');
      }
      remoteInstance = (await uazapiService.createInstance(
      data.name,
      data.metadata
    )) as AnyObject;
      
      if (verboseCreate) {
      console.log('[CreateInstance] UazAPI response received:', {
        hasInstance: !!remoteInstance?.instance,
        hasToken: !!(remoteInstance?.instance?.token || remoteInstance?.token),
        keys: Object.keys(remoteInstance || {}),
      });
      }
    } catch (uazapiError: any) {
      console.error('[CreateInstance] UazAPI error:', {
        message: uazapiError.message,
        status: uazapiError.status,
        payload: uazapiError.payload,
        stack: uazapiError.stack,
      });
      res.status(uazapiError.status || 500).json({ 
        error: 'Failed to create instance in UazAPI',
        details: uazapiError.message,
        uazapiError: uazapiError.payload || uazapiError.message,
      });
      return;
    }
    
    // Extrair informações da resposta
    const instanceInfo = remoteInstance?.instance || remoteInstance;
    const instanceToken = instanceInfo?.token || remoteInstance?.token;
    const instanceName = instanceInfo?.name || instanceInfo?.instanceName || data.name;
    const instanceStatus = instanceInfo?.status || 'disconnected';
    
    if (verboseCreate) {
    console.log('[CreateInstance] Extracted info:', {
      instanceToken: instanceToken ? '***' + instanceToken.slice(-4) : 'MISSING',
      instanceName,
      instanceStatus,
    });
    }
    
    if (!instanceToken) {
      logUazChat('error', {
        event_type: 'create_instance_no_token',
        user_id: userId,
        phase: 'uazapi_response',
        detail: 'resposta sem token; keys=' + Object.keys(remoteInstance || {}).join(','),
      });
      res.status(500).json({ 
        error: 'Token da instância não foi retornado pela UazAPI',
        response: remoteInstance,
      });
      return;
    }

    const userMeta = (data.metadata || {}) as Record<string, unknown>;
    const remoteObj =
      remoteInstance && typeof remoteInstance === 'object' && !Array.isArray(remoteInstance)
        ? { ...(remoteInstance as Record<string, unknown>) }
        : {};
    const syncCfg = normalizeSyncConfigFromInput(userMeta);
    const mergedMetadata: Record<string, unknown> = {
      ...remoteObj,
      phoneNumber: userMeta.phoneNumber ?? remoteObj.phoneNumber,
      connectionName: userMeta.connectionName ?? remoteObj.connectionName,
      sync_on_connect: syncCfg.sync_on_connect,
      sync_mode: syncCfg.sync_mode,
      /** Chat: instância visível/ativa no painel (padrão true; Etapa 4 correção). */
      enabled_in_chat: true,
    };

    logUazChat('info', {
      event_type: 'instance_sync_config_persisted',
      user_id: userId,
      phase: 'create_instance',
      sync_on_connect: syncCfg.sync_on_connect,
      sync_mode: syncCfg.sync_mode,
      detail: 'metadata mesclado com resposta UazAPI + Etapa 4',
    });

    // Salvar no banco
    try {
    const inserted = await pool.query(
      `
      INSERT INTO chat_instances (
        user_id, name, external_instance_name, instance_token, status, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
      [
        userId,
        data.name,
          instanceName,
          instanceToken,
          instanceStatus,
        JSON.stringify(mergedMetadata),
      ]
    );

      if (verboseCreate) {
      console.log('[CreateInstance] Instance saved to database:', {
        id: inserted.rows[0]?.id,
        name: inserted.rows[0]?.name,
        });
      }

      const tenantId = await resolveTenantIdForUser(userId);
      logUazChat('info', {
        event_type: 'create_instance_success',
        tenant_id: tenantId,
        user_id: userId,
        instance_id: inserted.rows[0]?.id,
        external_instance_name: inserted.rows[0]?.external_instance_name ?? null,
        phase: 'persisted',
      });

    res.status(201).json(inserted.rows[0]);
    } catch (dbError: any) {
      console.error('[CreateInstance] Database error:', {
        message: dbError.message,
        code: dbError.code,
      });
      try {
        await uazapiService.disconnectInstance(instanceToken);
        logUazChat('warn', {
          event_type: 'create_instance_remote_disconnect_after_db_fail',
          user_id: userId,
          external_instance_name: instanceName,
          phase: 'compensation',
          detail:
            'INSERT local falhou; best-effort disconnect na UazAPI para reduzir instância órfã ativa',
        });
      } catch (cleanupErr: any) {
        logUazChat('warn', {
          event_type: 'create_instance_remote_cleanup_failed',
          user_id: userId,
          external_instance_name: instanceName,
          phase: 'compensation',
          detail: cleanupErr?.message || 'disconnect após falha no banco',
        });
      }
      if (dbError.code === '23505') {
        res.status(409).json({
          error: 'Já existe uma instância com este nome para sua conta.',
          code: 'DUPLICATE_INSTANCE_NAME',
        });
        return;
      }
      res.status(500).json({ 
        error: 'Failed to save instance to database',
        details: dbError.message,
      });
    }
  } catch (error: any) {
    console.error('[CreateInstance] Unexpected error:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    res.status(500).json({ 
      error: error.message || 'Failed to create instance',
      type: error.name || 'UnknownError',
    });
  }
}

const BOOTSTRAP_CONV_LIMIT = 100;
/** Máximo de conversas não-grupo para tentar `/message/find` no bootstrap (evita N chamadas em grupos). */
const BOOTSTRAP_MAX_CHATS_FOR_MESSAGES = 10;
/** Últimas N mensagens por chat no bootstrap e default do sync manual de mensagens. */
const BOOTSTRAP_MSG_LIMIT = 50;
/** Teto do body enviado ao POST /message/find (a UazAPI costuma ecoar o limit na resposta). */
const UAZ_MESSAGE_FIND_MAX_LIMIT = 100;
/** Após sync manual de conversas: no máximo N chats recebem /message/find em lote (só candidatos). */
const MANUAL_POST_SYNC_MESSAGE_BATCH_MAX = 10;
/** Fase 2 grupos: teto de grupos por ciclo de /chat/find e de lote de mensagens. */
const GROUP_SYNC_MAX_CHATS_PER_CYCLE = 50;
const GROUP_MESSAGE_SYNC_LIMIT = 30;
/** Debounce do POST /conversations/:id/messages/sync (evita duplo disparo do frontend). */
const MESSAGE_SYNC_HTTP_DEBOUNCE_MS = 30_000;
/** Conversa já `synced` + identidade resolvida: não repetir full logo em seguida sem `force`. */
const MESSAGE_SYNC_RECENT_FULL_SKIP_MS = 30_000;
/** Evita duas execuções HTTP sobrepostas da mesma conversa (lock por processo). */
const MESSAGE_SYNC_IN_FLIGHT_LOCK_MS = 12_000;
/** Entre refreshes remotos de identidade (Uaz `chat/find` + contacts opcional), exceto `forceRefresh`. */
const IDENTITY_REMOTE_FETCH_COOLDOWN_MS = 3 * 60 * 1000;
/** Teto de mensagens no POST manual quando `fullHistory` não é true (sync leve). */
const MANUAL_LIGHT_SYNC_MSG_CAP = 30;

type RemoteIdentityTelemetry = {
  contacts_called: number;
  chat_find_called: number;
  skipped_cooldown?: boolean;
};

/** conversation_id → timestamp ms do início do último sync em andamento (ou muito recente). */
const conversationMessageSyncInFlight = new Map<string, number>();

function shouldSkipTerminalIdentityRefreshAfterMessageSync(crow: {
  identity_state: string | null;
  canonical_chat_id: string | null;
  display_name: string | null;
  contact_name: string | null;
  avatar_url: string | null;
  metadata: Record<string, unknown> | null;
}): boolean {
  if (crow.identity_state !== 'resolved') return false;
  if (!crow.canonical_chat_id || !String(crow.canonical_chat_id).trim()) return false;
  const name = String(crow.display_name || crow.contact_name || '').trim();
  if (name.length < 2) return false;
  const meta = crow.metadata || {};
  const portrait =
    (crow.avatar_url && String(crow.avatar_url).trim()) ||
    (typeof meta.whatsapp_profile_photo === 'string' && meta.whatsapp_profile_photo.trim()) ||
    (typeof meta.image === 'string' && meta.image.trim());
  return !!portrait;
}

function mediaItemsHaveRenderableUrl(items: ChatMediaItem[]): boolean {
  return items.some((it) => typeof it.url === 'string' && it.url.trim().length > 0);
}

const IDENTITY_BATCH_CONCURRENCY = 5;

function classifyWebhookError(error: any): UazChatLogFields['webhook_result'] {
  const st = error?.status as number | undefined;
  if (st === 401 || st === 403) return 'auth_error';
  if (st === 400) return 'invalid_payload';
  return 'failed';
}

/**
 * Função auxiliar para configurar webhook automaticamente
 * Não falha se houver erro, apenas loga
 */
async function autoConfigureWebhook(instance: ChatInstanceRow) {
  const tenantId = await resolveTenantIdForUser(instance.user_id);
  const baseLog: UazChatLogFields = {
    event_type: 'webhook_auto_configure',
    tenant_id: tenantId,
    user_id: instance.user_id,
    instance_id: instance.id,
    external_instance_name: instance.external_instance_name,
    phase: 'start',
  };

  try {
    const instanceSecret = await ensureInstanceWebhookSecret(instance);
    const resolvedUrl = buildInstanceWebhookUrl(instance.id, instanceSecret);

    if (!resolvedUrl) {
      logUazChat('warn', {
        ...baseLog,
        webhook_result: 'no_url',
        detail: 'UAZAPI_WEBHOOK_URL/PUBLIC_API_URL ausente',
      });
      console.warn('[Auto-Webhook] Skipped: URL not configured', {
        instance: instance.external_instance_name,
        hasUAZAPI_WEBHOOK_URL: !!process.env.UAZAPI_WEBHOOK_URL,
        hasPUBLIC_API_URL: !!process.env.PUBLIC_API_URL,
      });
      return;
    }

    const secretTrim = instanceSecret.trim();
    const webhookUrl = resolvedUrl;

    const existingWebhook = instance.metadata?.webhook;
    const tokenChanged = instance.metadata?.tokenChanged || false;
    
    if (tokenChanged) {
      logUazChat('info', {
        ...baseLog,
        phase: 'token_changed',
        detail: 'forçando reconfiguração após troca de token',
      });
      console.log('[Auto-Webhook] Token changed, forcing webhook reconfiguration', {
        instance: instance.external_instance_name,
        instanceId: instance.id,
        oldWebhookUrl: existingWebhook?.url,
        newWebhookUrl: webhookUrl.split('?')[0],
      });
    } else if (existingWebhook?.url === resolvedUrl && !existingWebhook?.needsReconfigure) {
      logUazChat('info', {
        ...baseLog,
        webhook_result: 'skipped',
        phase: 'already_configured',
        detail: resolvedUrl,
      });
      console.log('[Auto-Webhook] Already configured — verificando snapshot no provedor', {
        instance: instance.external_instance_name,
        url: resolvedUrl,
        tokenChanged,
      });
      await mergeWebhookSecretsFromProviderSkipPath(instance, tenantId);
      return;
    }

    logUazChat('info', {
      ...baseLog,
      phase: 'calling_uazapi',
      detail: secretTrim ? `${webhookUrl.split('?')[0]}?secret=(redacted)` : webhookUrl,
    });
    console.log('[Auto-Webhook] Configuring webhook...', {
      instance: instance.external_instance_name,
      instanceId: instance.id,
      instanceToken: '***' + instance.instance_token.slice(-4),
      url: webhookUrl.split('?')[0],
      secretInQuery: !!secretTrim,
    });

    const defaultEvents = ['messages', 'messages_update', 'chats', 'connection', 'leads'];
    const defaultExcludeMessages = ['wasSentByApi'];

    const webhookBody: Record<string, any> = {
      enabled: true,
      url: webhookUrl,
      events: defaultEvents,
      excludeMessages: defaultExcludeMessages,
      addUrlEvents: true,
      AddUrlTypesMessages: true,
    };

    if (secretTrim) {
      webhookBody.secret = secretTrim;
    }

    const webhookResponse = await uazapiService.configureWebhook(instance.instance_token, webhookBody);

    logUazChat('info', {
      ...baseLog,
      phase: 'uazapi_response',
      webhook_result: 'success',
      detail: JSON.stringify(webhookResponse).substring(0, 400),
    });
    console.log('[Auto-Webhook] UazAPI webhook configuration response:', {
      instanceId: instance.id,
      response: JSON.stringify(webhookResponse).substring(0, 500),
    });

    /**
     * Contrato v2: `chat_instances.webhook_secret` + path …/v2/:id/:token são autoridade local.
     * GET /webhook na Uaz serve só para auditoria — não sobrescrever o token por valor devolvido pelo provedor.
     */
    const effectiveSecret = secretTrim;
    const finalResolvedUrl = resolvedUrl;
    let uazDeliverySecrets: string[] = [];

    try {
      const remote = await uazapiService.getWebhook(instance.instance_token);
      logSanitizedUazGetWebhookAudit(
        { ...baseLog, phase: 'post_configure_audit' },
        remote,
        instance.id,
        instance.external_instance_name,
        effectiveSecret,
      );

      const canonical = extractCanonicalWebhookUrlSecretForInstance(remote, instance.id);
      if (canonical && !webhookSecretsEqual(canonical, effectiveSecret)) {
        logUazChat('info', {
          ...baseLog,
          event_type: 'provider_returned_different_secret_ignored',
          phase: 'provider_snapshot',
          saved_fp: webhookSecretFingerprint(effectiveSecret),
          provider_url_secret_fp: webhookSecretFingerprint(canonical),
          detail:
            'Token interno no PainelCRM é autoridade; não sincronizar coluna a partir do GET /webhook',
        });
      }

      uazDeliverySecrets = dedupeNormalizedSecrets([
        effectiveSecret,
        ...extractWebhookDeliverySecretsFromUazRemote(remote),
        ...extractWebhookSecretParamsFromUrls(collectHttpUrlsFromRemote(remote)),
      ]);

      const legacyReg = useLegacyQueryWebhookUrlRegistration();
      let urlTokLen = 0;
      try {
        if (legacyReg) {
          urlTokLen = new URL(finalResolvedUrl).searchParams.get('secret')?.length ?? 0;
        } else {
          const parts = finalResolvedUrl.split('/').filter(Boolean);
          const last = parts[parts.length - 1];
          urlTokLen = last ? decodeURIComponent(last).length : 0;
        }
      } catch {
        urlTokLen = 0;
      }

      const routeVer = legacyReg ? 'v1' : 'v2';
      logUazChat('info', {
        ...baseLog,
        event_type: legacyReg ? 'webhook_configure_audit' : 'webhook_v2_configured',
        phase: 'webhook_configure_audit',
        webhook_route_version: routeVer,
        saved_secret_length: effectiveSecret.length,
        webhook_url_secret_length: urlTokLen,
        saved_secret_fp: webhookSecretFingerprint(effectiveSecret),
        lengths_match: urlTokLen > 0 && urlTokLen === effectiveSecret.length,
        provider_webhook_configured: true,
        uaz_delivery_secret_count: uazDeliverySecrets.length,
        token_fp: instanceTokenFingerprintForLogs(instance.instance_token),
        detail: `registo ${routeVer}; GET /webhook apenas auditoria`,
      });
    } catch (syncErr: any) {
      console.warn('[Auto-Webhook] getWebhook após configurar falhou (uazDeliverySecrets não sincronizados)', {
        instanceId: instance.id,
        message: syncErr?.message,
      });
      logUazChat('warn', {
        ...baseLog,
        phase: 'provider_webhook_config_error',
        webhook_result: 'failed',
        detail: syncErr?.message || String(syncErr),
      });
      uazDeliverySecrets = dedupeNormalizedSecrets([effectiveSecret]);
    }

    await pool.query(
      `
      UPDATE chat_instances
      SET metadata = (COALESCE(metadata, '{}'::jsonb) || $1::jsonb) - 'tokenChanged',
          updated_at = now()
      WHERE id = $2
    `,
      [
        JSON.stringify({
          webhook: {
            url: finalResolvedUrl,
            webhookSecretInQuery: useLegacyQueryWebhookUrlRegistration() && !!effectiveSecret,
            webhookSecretMask: maskSecretForLogs(effectiveSecret),
            webhook_route_version: useLegacyQueryWebhookUrlRegistration() ? 'v1' : 'v2',
            path_based_webhook: !useLegacyQueryWebhookUrlRegistration(),
            events: defaultEvents,
            excludeMessages: defaultExcludeMessages,
            configuredAt: new Date().toISOString(),
            autoConfigured: true,
            needsReconfigure: false,
            ...(uazDeliverySecrets.length
              ? {
                  uazDeliverySecrets,
                  uazDeliverySecretsSyncedAt: new Date().toISOString(),
                }
              : {}),
          },
        }),
        instance.id,
      ]
    );
    await pool.query(
      `UPDATE chat_instances
       SET webhook_secret_last_seen_at = now(),
           webhook_needs_reconfiguration = false,
           metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
           updated_at = now()
       WHERE id = $2`,
      [JSON.stringify({ webhook_url: finalResolvedUrl, webhook_secret: effectiveSecret }), instance.id]
    );

    logUazChat('info', {
      ...baseLog,
      phase: 'persisted',
      webhook_result: 'success',
      detail: 'webhook salvo em metadata',
    });
    console.log('Webhook auto-configured successfully', {
      instance: instance.external_instance_name,
      url: finalResolvedUrl.split('?')[0],
      secretInQuery: !!effectiveSecret,
    });
  } catch (error: any) {
    const wr = classifyWebhookError(error);
    logUazChat('warn', {
      ...baseLog,
      phase: 'error',
      webhook_result: wr,
      detail: error?.message || String(error),
    });
    console.warn('Failed to auto-configure webhook (non-critical):', {
      error: error.message,
      instance: instance.external_instance_name,
    });
  }
}

type BootstrapSyncTrigger = 'instance_connected' | 'status_poll_connected' | string;

async function mergeInstanceMetadata(instanceId: string, patch: Record<string, unknown>) {
  await pool.query(
    `UPDATE chat_instances SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb, updated_at = now() WHERE id = $2`,
    [JSON.stringify(patch), instanceId]
  );
}

/**
 * Agenda bootstrap sync assíncrona (Etapa 1). Idempotente: não duplica run recente queued/running.
 */
async function scheduleBootstrapSyncIfNeeded(
  userId: string,
  instanceId: string,
  trigger: BootstrapSyncTrigger
): Promise<void> {
  const tenantId = await resolveTenantIdForUser(userId);
  const instPeek = await fetchInstanceForOperate(userId, instanceId);
  if (!instPeek) {
    return;
  }
  const md = (instPeek.metadata as Record<string, unknown>) || {};
  const soc = md.sync_on_connect;
  const sm = normalizeSyncMode(md.sync_mode);
  if (!shouldBootstrapHistory(md)) {
    logUazChat('info', {
      event_type: 'bootstrap_sync_skipped_by_config',
      tenant_id: tenantId,
      user_id: userId,
      instance_id: instanceId,
      phase: 'pre_schedule',
      sync_on_connect: typeof soc === 'boolean' ? soc : null,
      sync_mode: sm,
      detail: 'sync_on_connect=false ou sync_mode=none — bootstrap de histórico não agendado',
    });
    return;
  }

  logUazChat('info', {
    event_type: 'bootstrap_sync_config_resolved',
    tenant_id: tenantId,
    user_id: userId,
    instance_id: instanceId,
    sync_on_connect: typeof soc === 'boolean' ? soc : true,
    sync_mode: sm,
    detail: 'agendando bootstrap conforme metadata da instância',
  });

  const syncRunId = randomUUID();
  const queuedAt = new Date().toISOString();
  const bootstrapPatch = {
    sync_run_id: syncRunId,
    status: 'queued' as const,
    queued_at: queuedAt,
    trigger,
  };

  const r = await pool.query<ChatInstanceRow>(
    `UPDATE chat_instances
     SET metadata = jsonb_set(
       COALESCE(metadata, '{}'::jsonb),
       '{bootstrap_sync}',
       $1::jsonb,
       true
     ),
     updated_at = now()
     WHERE id = $2
       AND status IN ('connected', 'open')
       AND (
         metadata->'bootstrap_sync' IS NULL
         OR (metadata->'bootstrap_sync'->>'status') = 'failed'
         OR (
           (metadata->'bootstrap_sync'->>'status') IN ('running', 'queued')
           AND (
             COALESCE(
               NULLIF(trim(metadata->'bootstrap_sync'->>'started_at'), ''),
               NULLIF(trim(metadata->'bootstrap_sync'->>'queued_at'), '')
             ) IS NULL
             OR COALESCE(
               (NULLIF(trim(metadata->'bootstrap_sync'->>'started_at'), ''))::timestamptz,
               (NULLIF(trim(metadata->'bootstrap_sync'->>'queued_at'), ''))::timestamptz
             ) < now() - interval '30 minutes'
           )
         )
       )
     RETURNING *`,
    [JSON.stringify(bootstrapPatch), instanceId]
  );

  if (r.rowCount === 0) {
    logUazChat('info', {
      event_type: 'bootstrap_sync_schedule_skip',
      tenant_id: tenantId,
      user_id: userId,
      instance_id: instanceId,
      sync_run_id: syncRunId,
      phase: 'claim_failed',
      detail: 'já em progresso ou instância não conectada',
    });
    return;
  }

  logUazChat('info', {
    event_type: 'bootstrap_sync_scheduled',
    tenant_id: tenantId,
    user_id: userId,
    instance_id: instanceId,
    sync_run_id: syncRunId,
    phase: 'queued',
    trigger,
  });

  setImmediate(() => {
    void runBootstrapSyncJob(userId, instanceId, syncRunId, trigger).catch(err => {
      logUazChat('error', {
        event_type: 'bootstrap_sync_unhandled',
        tenant_id: tenantId,
        user_id: userId,
        instance_id: instanceId,
        sync_run_id: syncRunId,
        detail: err?.message || String(err),
      });
    });
  });
}

/**
 * Carrega GET /contacts (ou POST /contacts/list paginado) e indexa por MSISDN.
 * Fonte oficial de agenda: nome + `jid` …@s.whatsapp.net para resolver histórico em conversas @lid.
 */
async function fetchUazContactCatalogMap(instanceToken: string): Promise<Map<string, UazContactCatalogEntry>> {
  const rows: Record<string, unknown>[] = [];
  try {
    const raw = await uazapiService.getContacts(instanceToken);
    if (Array.isArray(raw)) {
      for (const r of raw) {
        if (r && typeof r === 'object') rows.push(r as Record<string, unknown>);
      }
    }
  } catch (e: unknown) {
    logUazChat('warn', {
      event_type: 'contacts_catalog',
      phase: 'contacts_get_failed',
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  if (rows.length === 0) {
    let page = 1;
    for (let guard = 0; guard < 60; guard++) {
      try {
        const resp = await uazapiService.listContactsPage(instanceToken, { page, pageSize: 1000 });
        const contacts = (resp?.contacts as unknown[]) || [];
        for (const c of contacts) {
          if (c && typeof c === 'object') rows.push(c as Record<string, unknown>);
        }
        const pag = resp?.pagination as Record<string, unknown> | undefined;
        if (pag?.hasNextPage !== true) break;
        page += 1;
      } catch (e: unknown) {
        logUazChat('warn', {
          event_type: 'contacts_catalog',
          phase: 'contacts_list_page_failed',
          detail: e instanceof Error ? e.message : String(e),
        });
        break;
      }
    }
  }

  return indexContactsByMsisdn(rows);
}

/**
 * Segunda passagem: POST /chat/find com `wa_chatid` por JID — preenche nome/foto quando a lista
 * agregada veio incompleta (comum em chats antigos).
 */
async function batchHydrateIdentitiesAfterChatListSync(
  instance: ChatInstanceRow,
  externalChatJids: string[],
  ctx: {
    tenantId: string | null;
    syncRunId?: string | null;
    trigger?: string | null;
    eventType: string;
    contactCatalog?: Map<string, UazContactCatalogEntry>;
  }
): Promise<{ attempted: number; updated: number }> {
  const allowGroups = isWhatsappGroupsEnabled();
  const unique = [
    ...new Set(
      externalChatJids
        .map(j => String(j).trim())
        .filter(j => j.length > 0 && (allowGroups || !j.endsWith('@g.us')))
    ),
  ];
  const attempted = unique.length;
  let updated = 0;
  for (let i = 0; i < unique.length; i += IDENTITY_BATCH_CONCURRENCY) {
    const chunk = unique.slice(i, i + IDENTITY_BATCH_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async jid => {
        try {
          const row = await fetchAndUpsertRemoteChatIdentity(instance, jid, {
            contactCatalog: ctx.contactCatalog,
          });
          return row ? 1 : 0;
        } catch {
          return 0;
        }
      })
    );
    for (const hit of results) updated += hit;
    if (i + IDENTITY_BATCH_CONCURRENCY < unique.length) {
      await new Promise(r => setTimeout(r, 80));
    }
  }
  logUazChat('info', {
    event_type: ctx.eventType,
    phase: 'batch_identity_hydration_done',
    tenant_id: ctx.tenantId,
    user_id: instance.user_id,
    instance_id: instance.id,
    external_instance_name: instance.external_instance_name,
    sync_run_id: ctx.syncRunId ?? null,
    trigger: ctx.trigger ?? null,
    detail: `uniqueJids=${unique.length} upsertHits=${updated}`,
  });
  return { attempted, updated };
}

async function runBatchMessageSyncForRecentConversations(
  instance: ChatInstanceRow,
  userId: string,
  ctx: {
    tenantId: string | null;
    syncRunId?: string | null;
    trigger?: string;
    eventType: string;
    minTimestampMs?: number | null;
    maxChats?: number;
    /**
     * Só conversas sem mensagens locais (evita fan-out inútil quando message.find volta vazio).
     * Bootstrap e pós-sync manual: default true.
     */
    onlyWithoutLocalMessages?: boolean;
  }
): Promise<{ conversationsTried: number; messagesSaved: number }> {
  const limitChats = ctx.maxChats ?? BOOTSTRAP_MAX_CHATS_FOR_MESSAGES;
  const onlyEmpty = ctx.onlyWithoutLocalMessages !== false;
  const emptyFilter = onlyEmpty
    ? `AND NOT EXISTS (SELECT 1 FROM chat_messages m WHERE m.conversation_id = c.id)`
    : '';

  const convRows = await pool.query<{
    id: string;
    external_chat_id: string;
    instance_id: string;
    instance_token: string;
  }>(
    `
      SELECT c.id, c.external_chat_id, c.instance_id, i.instance_token
      FROM chat_conversations c
      INNER JOIN chat_instances i ON i.id = c.instance_id
      WHERE c.user_id = $1 AND c.instance_id = $2
        AND c.external_chat_id NOT LIKE '%@g.us'
        AND c.identity_state = 'resolved'
        AND c.canonical_chat_id IS NOT NULL
        ${emptyFilter}
      ORDER BY COALESCE(
        (SELECT MAX(COALESCE(m.sent_at, m.created_at)) FROM chat_messages m WHERE m.conversation_id = c.id),
        c.last_message_at,
        c.created_at
      ) DESC NULLS LAST
      LIMIT $3
    `,
    [userId, instance.id, limitChats]
  );

  let messagesSaved = 0;
  for (const row of convRows.rows) {
    const r = await performSyncConversationMessagesForConversation(row, userId, {
      limit: BOOTSTRAP_MSG_LIMIT,
      syncRunId: ctx.syncRunId ?? null,
      tenantId: ctx.tenantId,
      trigger: ctx.trigger,
      eventType: ctx.eventType,
      minTimestampMs: ctx.minTimestampMs ?? null,
      skipTerminalIdentityRefresh: true,
    });
    messagesSaved += r.synced;
  }

  let groupTried = 0;
  if (isWhatsappGroupsEnabled()) {
    const groupRows = await pool.query<{
      id: string;
      external_chat_id: string;
      instance_id: string;
      instance_token: string;
    }>(
      `
      SELECT c.id, c.external_chat_id, c.instance_id, i.instance_token
      FROM chat_conversations c
      INNER JOIN chat_instances i ON i.id = c.instance_id
      WHERE c.user_id = $1 AND c.instance_id = $2
        AND (c.conversation_type = 'group' OR c.external_chat_id LIKE '%@g.us')
        AND c.identity_state = 'resolved'
        AND c.canonical_chat_id IS NOT NULL
        ${emptyFilter}
      ORDER BY COALESCE(
        (SELECT MAX(COALESCE(m.sent_at, m.created_at)) FROM chat_messages m WHERE m.conversation_id = c.id),
        c.last_message_at,
        c.created_at
      ) DESC NULLS LAST
      LIMIT $3
    `,
      [userId, instance.id, GROUP_SYNC_MAX_CHATS_PER_CYCLE]
    );
    groupTried = groupRows.rows.length;
    for (const row of groupRows.rows) {
      const r = await performSyncConversationMessagesForConversation(row, userId, {
        limit: GROUP_MESSAGE_SYNC_LIMIT,
        syncRunId: ctx.syncRunId ?? null,
        tenantId: ctx.tenantId,
        trigger: ctx.trigger,
        eventType: ctx.eventType,
        minTimestampMs: ctx.minTimestampMs ?? null,
        skipTerminalIdentityRefresh: true,
      });
      messagesSaved += r.synced;
    }
  }

  const totalTried = convRows.rows.length + groupTried;
  logUazChat('info', {
    event_type: ctx.eventType,
    phase: 'batch_messages_after_chat_sync_done',
    tenant_id: ctx.tenantId,
    user_id: userId,
    instance_id: instance.id,
    external_instance_name: instance.external_instance_name,
    sync_run_id: ctx.syncRunId ?? null,
    trigger: ctx.trigger ?? null,
    detail: `privateTried=${convRows.rows.length} groupTried=${groupTried} totalTried=${totalTried} messagesSaved=${messagesSaved} limitPrivate=${BOOTSTRAP_MSG_LIMIT} limitGroup=${GROUP_MESSAGE_SYNC_LIMIT} onlyWithoutLocalMessages=${onlyEmpty} maxPrivate=${limitChats}`,
  });

  return { conversationsTried: totalTried, messagesSaved };
}

async function performSyncConversationsForInstance(
  instance: ChatInstanceRow,
  opts: {
    limit?: number;
    filters?: Record<string, unknown>;
    syncRunId?: string | null;
    tenantId?: string | null;
    trigger?: string;
    eventType?: string;
    /** Janela mínima (Etapa 4): filtra `wa_lastMsgTimestamp` na UazAPI e pós-filtro no app. */
    sinceTimestampMs?: number | null;
    /**
     * Após upsert da lista do /chat/find, reconsulta cada JID para nome/foto/metadata completos.
     * Default true.
     */
    hydrateIdentitiesAfterList?: boolean;
    /**
     * Após hidratação, executa /message/find nas conversas privadas mais recentes (teto BOOTSTRAP_MAX_CHATS_FOR_MESSAGES).
     * Bootstrap mantém false e usa seu próprio loop (evita duplicar).
     */
    batchSyncRecentMessagesAfterList?: boolean;
  }
): Promise<{
  total: number;
  upserted: number;
  identityHydrationAttempted?: number;
  identityHydrationUpdated?: number;
  batchMessagesSaved?: number;
  batchConversationsTried?: number;
}> {
  const tenantId = opts.tenantId ?? (await resolveTenantIdForUser(instance.user_id));
  const event_type = opts.eventType || 'sync_conversations';
  const filters = opts.filters || {};
  const limit = opts.limit ?? BOOTSTRAP_CONV_LIMIT;
  const sort =
    typeof filters.sort === 'string' && filters.sort.trim() ? filters.sort : '-wa_lastMsgTimestamp';
  const offset = typeof filters.offset === 'number' ? filters.offset : 0;
  const correlation_id = opts.syncRunId ?? randomUUID();
  const instance_token_suffix = tokenSuffixForAudit(instance.instance_token);

  let contactCatalog = new Map<string, UazContactCatalogEntry>();
  try {
    contactCatalog = await fetchUazContactCatalogMap(instance.instance_token);
    logUazChat('info', {
      event_type,
      phase: 'contacts_catalog_ready',
      tenant_id: tenantId,
      user_id: instance.user_id,
      instance_id: instance.id,
      sync_run_id: opts.syncRunId ?? null,
      correlation_id,
      contacts_index_size: contactCatalog.size,
      uazapi_endpoint_primary: 'GET /contacts',
      uazapi_endpoint_fallback: 'POST /contacts/list',
      detail: 'agenda indexada por MSISDN para enriquecimento e uaz_message_find_chatid em @lid',
    });
  } catch (e: unknown) {
    logUazChat('warn', {
      event_type,
      phase: 'contacts_catalog_unavailable',
      tenant_id: tenantId,
      user_id: instance.user_id,
      instance_id: instance.id,
      sync_run_id: opts.syncRunId ?? null,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  const extraFilters: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (['sort', 'offset', 'limit', 'wa_isGroup'].includes(k)) continue;
    extraFilters[k] = v;
  }

  if (opts.sinceTimestampMs != null && opts.sinceTimestampMs > 0) {
    extraFilters['wa_lastMsgTimestamp'] = buildWaLastMsgTimestampFilter(opts.sinceTimestampMs);
    logUazChat('info', {
      event_type,
      phase: 'sync_window_filter',
      tenant_id: tenantId,
      user_id: instance.user_id,
      instance_id: instance.id,
      sync_run_id: opts.syncRunId ?? null,
      detail: `UazAPI /chat/find: wa_lastMsgTimestamp ${extraFilters['wa_lastMsgTimestamp']}; fallback: pós-filtro por timestamp da linha`,
    });
  }

  const explicitWaIsGroup = Object.prototype.hasOwnProperty.call(filters, 'wa_isGroup');
  const groupsFeat = isWhatsappGroupsEnabled();

  logUazChat('info', {
    event_type,
    phase: 'fetch_remote_chats',
    tenant_id: tenantId,
    user_id: instance.user_id,
    instance_id: instance.id,
    external_instance_name: instance.external_instance_name,
    sync_run_id: opts.syncRunId ?? null,
    correlation_id,
    trigger: opts.trigger ?? null,
    detail: explicitWaIsGroup
      ? `single_request_wa_isGroup_client grupos=${groupsFeat ? 'mantidos_se_classificados' : 'filtrados'}`
      : groupsFeat
        ? 'privados_wa_isGroup_false_mais_grupos_wa_isGroup_true_limitado'
        : 'somente_nao_grupo (sem perna wa_isGroup:true; doc /chat/find)',
  });

  let chatsArray: any[] = [];
  let remotePrivateRows = 0;
  let remoteGroupRows = 0;
  let remoteSupplementRows = 0;
  let mergedAfterDedupe = 0;

  if (explicitWaIsGroup) {
    const payload: Record<string, unknown> = {
      ...extraFilters,
      limit,
      sort,
      offset,
      wa_isGroup: filters.wa_isGroup,
    };
    const remoteChats = (await uazapiService.findChats(instance.instance_token, payload)) as AnyObject;
    const rawExplicit = extractChatsArrayFromFindResponse(remoteChats);
    chatsArray = groupsFeat
      ? rawExplicit
      : rawExplicit.filter(row => classifyChatRowForLog(row) !== 'group');
    remotePrivateRows = chatsArray.filter(c => classifyChatRowForLog(c) === 'private').length;
    remoteGroupRows = chatsArray.filter(c => classifyChatRowForLog(c) === 'group').length;
    mergedAfterDedupe = chatsArray.length;
    logSyncChatFindLegAudit({
      event_type,
      correlation_id,
      sync_run_id: opts.syncRunId ?? null,
      tenant_id: tenantId,
      user_id: instance.user_id,
      instance_id: instance.id,
      external_instance_name: instance.external_instance_name,
      instance_token_suffix,
      trigger: opts.trigger ?? null,
      leg: 'explicit_wa_isGroup_client',
      endpoint: '/chat/find',
      request_body: payload,
      raw_response: remoteChats,
      extracted: chatsArray,
    });
  } else {
    /**
     * Sincronizamos apenas chats não-grupo: não chamamos `wa_isGroup: true` (evita poluir CRM com grupos).
     * Perna principal: `wa_isGroup: false`; suplemento `!~@g.us` se a primeira vier vazia.
     */
    const payloadPrivate: Record<string, unknown> = {
      ...extraFilters,
      limit,
      sort,
      offset,
      wa_isGroup: false,
    };

    const privResp = (await uazapiService.findChats(instance.instance_token, payloadPrivate)) as AnyObject;

    const arrPriv = extractChatsArrayFromFindResponse(privResp);
    remotePrivateRows = arrPriv.length;
    remoteGroupRows = 0;

    logSyncChatFindLegAudit({
      event_type,
      correlation_id,
      sync_run_id: opts.syncRunId ?? null,
      tenant_id: tenantId,
      user_id: instance.user_id,
      instance_id: instance.id,
      external_instance_name: instance.external_instance_name,
      instance_token_suffix,
      trigger: opts.trigger ?? null,
      leg: 'wa_isGroup_false',
      endpoint: '/chat/find',
      request_body: payloadPrivate,
      raw_response: privResp,
      extracted: arrPriv,
    });

    const merged = new Map<string, any>();
    for (const row of arrPriv) merged.set(chatFindRowDedupeKey(row), row);

    /**
     * Se `wa_isGroup: false` não retorna linhas (comportamento observado na API em algumas contas),
     * usamos filtro no `wa_chatid` com operador `!~` (NOT LIKE), conforme documentação de `/chat/find`,
     * para excluir JIDs de grupo (`@g.us`) e recuperar conversas 1:1 / não-grupo.
     */
    if (arrPriv.length === 0) {
      const payloadSupplement: Record<string, unknown> = {
        ...extraFilters,
        limit,
        sort,
        offset,
        wa_chatid: '!~@g.us',
      };
      try {
        const suppResp = (await uazapiService.findChats(
          instance.instance_token,
          payloadSupplement
        )) as AnyObject;
        const arrSupp = extractChatsArrayFromFindResponse(suppResp);
        remoteSupplementRows = arrSupp.length;
        for (const row of arrSupp) merged.set(chatFindRowDedupeKey(row), row);
        logSyncChatFindLegAudit({
          event_type,
          correlation_id,
          sync_run_id: opts.syncRunId ?? null,
          tenant_id: tenantId,
          user_id: instance.user_id,
          instance_id: instance.id,
          external_instance_name: instance.external_instance_name,
          instance_token_suffix,
          trigger: opts.trigger ?? null,
          leg: 'wa_chatid_not_like_g_us',
          endpoint: '/chat/find',
          request_body: payloadSupplement,
          raw_response: suppResp,
          extracted: arrSupp,
        });
        logUazChat('info', {
          event_type,
          phase: 'find_chats_supplement',
          tenant_id: tenantId,
          user_id: instance.user_id,
          instance_id: instance.id,
          external_instance_name: instance.external_instance_name,
          sync_run_id: opts.syncRunId ?? null,
          correlation_id,
          remote_supplement_rows: remoteSupplementRows,
          detail:
            'POST /chat/find com wa_chatid !~@g.us porque wa_isGroup:false retornou 0 linhas',
        });
      } catch (supErr: unknown) {
        logUazChat('warn', {
          event_type,
          phase: 'find_chats_supplement_error',
          tenant_id: tenantId,
          user_id: instance.user_id,
          instance_id: instance.id,
          external_instance_name: instance.external_instance_name,
          sync_run_id: opts.syncRunId ?? null,
          correlation_id,
          detail: supErr instanceof Error ? supErr.message : String(supErr),
        });
      }
    } else {
      logUazChat('info', {
        event_type,
        phase: 'find_chats_supplement_skipped',
        tenant_id: tenantId,
        user_id: instance.user_id,
        instance_id: instance.id,
        external_instance_name: instance.external_instance_name,
        sync_run_id: opts.syncRunId ?? null,
        correlation_id,
        remote_private_rows: arrPriv.length,
        detail:
          'perna suplementar wa_chatid !~@g.us não executada: wa_isGroup:false já retornou linhas',
      });
    }

    if (groupsFeat) {
      const groupLimit = Math.min(GROUP_SYNC_MAX_CHATS_PER_CYCLE, limit);
      const payloadGroups: Record<string, unknown> = {
        ...extraFilters,
        limit: groupLimit,
        sort,
        offset: 0,
        wa_isGroup: true,
      };
      try {
        const grpResp = (await uazapiService.findChats(instance.instance_token, payloadGroups)) as AnyObject;
        const arrGrp = extractChatsArrayFromFindResponse(grpResp);
        remoteGroupRows = arrGrp.length;
        for (const row of arrGrp) merged.set(chatFindRowDedupeKey(row), row);
        logSyncChatFindLegAudit({
          event_type,
          correlation_id,
          sync_run_id: opts.syncRunId ?? null,
          tenant_id: tenantId,
          user_id: instance.user_id,
          instance_id: instance.id,
          external_instance_name: instance.external_instance_name,
          instance_token_suffix,
          trigger: opts.trigger ?? null,
          leg: 'wa_isGroup_true_groups',
          endpoint: '/chat/find',
          request_body: payloadGroups,
          raw_response: grpResp,
          extracted: arrGrp,
        });
        console.log('[chat-groups-sync]', {
          instance_id: instance.id,
          trigger: opts.trigger ?? null,
          group_rows: arrGrp.length,
          limit: groupLimit,
        });
      } catch (gErr: unknown) {
        logUazChat('warn', {
          event_type,
          phase: 'find_chats_groups_leg_error',
          tenant_id: tenantId,
          user_id: instance.user_id,
          instance_id: instance.id,
          sync_run_id: opts.syncRunId ?? null,
          detail: gErr instanceof Error ? gErr.message : String(gErr),
        });
      }
    }

    chatsArray = Array.from(merged.values()).filter(
      row => groupsFeat || classifyChatRowForLog(row) !== 'group'
    );
    mergedAfterDedupe = chatsArray.length;
  }

  if (opts.sinceTimestampMs != null && opts.sinceTimestampMs > 0) {
    const beforeLen = chatsArray.length;
    chatsArray = chatsArray.filter(row => {
      const ts = extractWaLastMsgTimestampMs(row as Record<string, unknown>);
      if (ts == null) return true;
      return ts >= opts.sinceTimestampMs!;
    });
    logUazChat('info', {
      event_type,
      phase: 'sync_window_post_filter_chats',
      tenant_id: tenantId,
      user_id: instance.user_id,
      instance_id: instance.id,
      sync_run_id: opts.syncRunId ?? null,
      detail: `chats antes=${beforeLen} depois=${chatsArray.length} (minMs=${opts.sinceTimestampMs})`,
    });
  }

  const classifiedPrivate = chatsArray.filter(c => classifyChatRowForLog(c) === 'private').length;
  const classifiedGroup = chatsArray.filter(c => classifyChatRowForLog(c) === 'group').length;
  const classifiedUnknown = Math.max(0, chatsArray.length - classifiedPrivate - classifiedGroup);

  let skippedNormalizeNull = 0;
  let upsertedPrivate = 0;
  let upsertedGroup = 0;
  let upsertedUnknownKind = 0;

  logUazChat('info', {
    event_type,
    phase: 'find_chats_merged',
    tenant_id: tenantId,
    user_id: instance.user_id,
    instance_id: instance.id,
    external_instance_name: instance.external_instance_name,
    sync_run_id: opts.syncRunId ?? null,
    correlation_id,
    trigger: opts.trigger ?? null,
    remote_private_rows: remotePrivateRows,
    remote_group_rows: remoteGroupRows,
    remote_supplement_rows: remoteSupplementRows,
    merged_after_dedupe: mergedAfterDedupe,
    classified_private: classifiedPrivate,
    classified_group: classifiedGroup,
    classified_unknown: classifiedUnknown,
  });

  let upserted = 0;
  const batchSize = 10;
  const discardReasons: Record<string, number> = {};
  let upsertFailed = 0;
  const upsertErrorSamples: { external_chat_id: string | null; message: string }[] = [];

  for (let i = 0; i < chatsArray.length; i += batchSize) {
    const batch = chatsArray.slice(i, i + batchSize);
    const promises = batch.map(async (item: any) => {
      const norm = normalizeChatPayloadWithReason(item);
      if (!norm.ok) {
        skippedNormalizeNull += 1;
        discardReasons[norm.reason] = (discardReasons[norm.reason] ?? 0) + 1;
        return null;
      }
      const normalized = norm.data;
      enrichNormalizedChatFromContactCatalog(normalized, contactCatalog);
      const rowKind = classifyChatRowForLog(item);
      try {
        const ccId = await syncCommunicationContactFromNormalized(tenantId, normalized);
        await upsertConversation(instance, normalized, { communicationContactId: ccId });
        if (rowKind === 'group') upsertedGroup += 1;
        else if (rowKind === 'private') upsertedPrivate += 1;
        else upsertedUnknownKind += 1;
        return true;
      } catch (error) {
        upsertFailed += 1;
        if (upsertErrorSamples.length < 15) {
          upsertErrorSamples.push({
            external_chat_id: normalized.externalChatId,
            message: (error as Error)?.message || String(error),
          });
        }
        logUazChat('error', {
          event_type,
          phase: 'upsert_conversation_error',
          tenant_id: tenantId,
          user_id: instance.user_id,
          instance_id: instance.id,
          external_instance_name: instance.external_instance_name,
          external_chat_id: normalized.externalChatId,
          sync_run_id: opts.syncRunId ?? null,
          correlation_id,
          detail: (error as Error)?.message,
        });
        console.error(`Error upserting conversation:`, error);
        return false;
      }
    });

    const results = await Promise.all(promises);
    upserted += results.filter(r => r === true).length;

    if (i + batchSize < chatsArray.length) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  logUazChat('info', {
    event_type,
    phase: 'sync_conversations_pipeline_audit',
    tenant_id: tenantId,
    user_id: instance.user_id,
    instance_id: instance.id,
    external_instance_name: instance.external_instance_name,
    sync_run_id: opts.syncRunId ?? null,
    correlation_id,
    trigger: opts.trigger ?? null,
    merged_input_rows: chatsArray.length,
    backend_classified_private: classifiedPrivate,
    backend_classified_group: classifiedGroup,
    backend_classified_unknown: classifiedUnknown,
    discard_reasons: discardReasons,
    skipped_normalize_total: skippedNormalizeNull,
    upserted_total: upserted,
    upserted_private: upsertedPrivate,
    upserted_group: upsertedGroup,
    upserted_unknown_kind: upsertedUnknownKind,
    upsert_failed_count: upsertFailed,
    upsert_error_samples: upsertErrorSamples,
    detail:
      'API→merged→classify→normalize(discard)→upsert; comparar com sync_chat_find_leg_audit',
  });

  if (groupsFeat && upsertedGroup > 0) {
    console.log('[chat-groups-sync]', {
      instance_id: instance.id,
      trigger: opts.trigger ?? null,
      upserted_group: upsertedGroup,
    });
  }

  logUazChat('info', {
    event_type,
    phase: 'conversations_done',
    tenant_id: tenantId,
    user_id: instance.user_id,
    instance_id: instance.id,
    external_instance_name: instance.external_instance_name,
    sync_run_id: opts.syncRunId ?? null,
    correlation_id,
    skipped_normalize_null: skippedNormalizeNull,
    upserted_total: upserted,
    upserted_private: upsertedPrivate,
    upserted_group: upsertedGroup,
    upserted_unknown_kind: upsertedUnknownKind,
    detail: `merged=${chatsArray.length} upserted=${upserted} skippedNull=${skippedNormalizeNull}`,
  });

  const jidsForHydration = chatsArray
    .map((row: any) => pickExternalChatJidForUaz(row))
    .filter((j): j is string => typeof j === 'string' && j.length > 0);

  let identityHydrationAttempted = 0;
  let identityHydrationUpdated = 0;
  let batchMessagesSaved = 0;
  let batchConversationsTried = 0;

  if (opts.hydrateIdentitiesAfterList !== false) {
    const idRes = await batchHydrateIdentitiesAfterChatListSync(instance, jidsForHydration, {
      tenantId,
      syncRunId: opts.syncRunId ?? null,
      trigger: opts.trigger ?? null,
      eventType: `${event_type}_identity_batch`,
      contactCatalog,
    });
    identityHydrationAttempted = idRes.attempted;
    identityHydrationUpdated = idRes.updated;
  }

  if (opts.batchSyncRecentMessagesAfterList === true) {
    const msgRes = await runBatchMessageSyncForRecentConversations(instance, instance.user_id, {
      tenantId,
      syncRunId: opts.syncRunId ?? null,
      trigger: opts.trigger ?? 'post_chat_sync',
      eventType: `${event_type}_messages_batch`,
      minTimestampMs: opts.sinceTimestampMs ?? null,
      maxChats: MANUAL_POST_SYNC_MESSAGE_BATCH_MAX,
      onlyWithoutLocalMessages: true,
    });
    batchMessagesSaved = msgRes.messagesSaved;
    batchConversationsTried = msgRes.conversationsTried;
  }

  return {
    total: chatsArray.length,
    upserted,
    identityHydrationAttempted,
    identityHydrationUpdated,
    batchMessagesSaved,
    batchConversationsTried,
  };
}

async function performSyncConversationMessagesForConversation(
  conversation: {
    id: string;
    external_chat_id: string;
    instance_id: string;
    instance_token: string;
  },
  userId: string,
  opts: {
    limit?: number;
    before?: string;
    after?: string;
    syncRunId?: string | null;
    tenantId?: string | null;
    trigger?: string;
    eventType?: string;
    /** Etapa 4: não persiste mensagens anteriores a este instante (corte no app; /message/find pode não filtrar por data). */
    minTimestampMs?: number | null;
    /**
     * Quando true, não chama fetchAndUpsertRemoteChatIdentity ao final (ex.: lote de mensagens
     * já precedido de hidratação em lote).
     */
    skipTerminalIdentityRefresh?: boolean;
    /** Só para gates HTTP em `syncConversationMessages` (não reabilita re-save de todas as mensagens). */
    force?: boolean;
    /** Origem para logs (`sync_trigger_source`). */
    syncTriggerSource?: string;
  }
): Promise<{
  synced: number;
  totalReturned: number;
  messagesResponse: AnyObject;
  history_sync_blocked?: boolean;
  history_sync_reason?: string;
  /** True quando o sync não disparou `fetchAndUpsertRemoteChatIdentity` ao final (identidade já ok ou opt-out). */
  identity_refresh_skipped?: boolean;
  skipped_existing_remote?: number;
  chat_sync_summary?: {
    messages_requested: number;
    messages_returned: number;
    messages_saved: number;
    messages_skipped_existing: number;
    identity_refreshed: boolean;
    identity_skipped_cooldown: boolean;
    contacts_called: number;
    chat_find_called: number;
    refresh_identity_endpoint_called: boolean;
    duration_ms: number;
  };
}> {
  const syncT0 = Date.now();
  const tenantId = opts.tenantId ?? (await resolveTenantIdForUser(userId));
  const event_type = opts.eventType || 'sync_messages';
  const syncTriggerSource = opts.syncTriggerSource ?? opts.trigger ?? 'unspecified';

  const requestedLimit = opts.limit ?? BOOTSTRAP_MSG_LIMIT;
  /** Teto operacional 50: mesmo que o cliente ou a UazAPI sugira 100, não forçar carga maior. */
  const effectiveLimit = Math.min(
    BOOTSTRAP_MSG_LIMIT,
    Math.min(UAZ_MESSAGE_FIND_MAX_LIMIT, Math.max(1, requestedLimit))
  );

  const convRow = await pool.query<{
    phone_number: string | null;
    metadata: Record<string, unknown> | null;
    external_chat_id: string;
    canonical_chat_id: string | null;
    identity_state: string | null;
    history_sync_status: string | null;
    last_history_sync_reason: string | null;
    display_name: string | null;
    contact_name: string | null;
    avatar_url: string | null;
  }>(
    `SELECT phone_number, metadata, external_chat_id,
            canonical_chat_id, identity_state, history_sync_status, last_history_sync_reason,
            display_name, contact_name, avatar_url
     FROM chat_conversations WHERE id = $1 LIMIT 1`,
    [conversation.id]
  );
  const crow = convRow.rows[0];
  const extId = crow?.external_chat_id || conversation.external_chat_id;

  if (!crow?.canonical_chat_id || crow?.identity_state === 'unresolved') {
    const reason =
      crow?.last_history_sync_reason ||
      'history_sync_blocked_until_canonical_identity';
    logUazChat('warn', {
      event_type,
      phase: 'history_sync_skipped_unresolved_identity',
      tenant_id: tenantId,
      user_id: userId,
      instance_id: conversation.instance_id,
      conversation_id: conversation.id,
      provider_chat_id_raw: extId,
      canonical_chat_id: crow?.canonical_chat_id ?? null,
      identity_state: crow?.identity_state ?? null,
      history_sync_status: crow?.history_sync_status ?? null,
      history_sync_reason: reason,
      uazapi_endpoint: 'POST /message/find',
      sync_run_id: opts.syncRunId ?? null,
      trigger: opts.trigger ?? null,
      sync_trigger_source: syncTriggerSource,
      detail:
        'Fase C não executada: canonical_chat_id ausente ou identidade não resolvida — sem chamada a message/find',
    });
    const durationBlocked = Date.now() - syncT0;
    logUazChat('info', {
      event_type: 'chat_sync_summary',
      phase: 'blocked_unresolved_identity',
      tenant_id: tenantId,
      user_id: userId,
      instance_id: conversation.instance_id,
      conversation_id: conversation.id,
      sync_trigger_source: syncTriggerSource,
      messages_requested: requestedLimit,
      messages_returned: 0,
      messages_saved: 0,
      messages_skipped_existing: 0,
      identity_refreshed: false,
      identity_skipped_cooldown: false,
      contacts_called: 0,
      chat_find_called: 0,
      refresh_identity_endpoint_called: false,
      duration_ms: durationBlocked,
    });
    return {
      synced: 0,
      totalReturned: 0,
      messagesResponse: {},
      history_sync_blocked: true,
      history_sync_reason: reason,
      chat_sync_summary: {
        messages_requested: requestedLimit,
        messages_returned: 0,
        messages_saved: 0,
        messages_skipped_existing: 0,
        identity_refreshed: false,
        identity_skipped_cooldown: false,
        contacts_called: 0,
        chat_find_called: 0,
        refresh_identity_endpoint_called: false,
        duration_ms: durationBlocked,
      },
    };
  }

  const resolution = resolveMessageFindChatId({
    external_chat_id: extId,
    phone_number: crow?.phone_number,
    metadata: crow?.metadata || {},
    canonical_chat_id: crow?.canonical_chat_id,
  });

  const body: Record<string, unknown> = {
    chatid: resolution.chatid,
    limit: effectiveLimit,
  };
  if (opts.before) body.before = opts.before;
  if (opts.after) body.after = opts.after;

  logUazChat('info', {
    event_type,
    phase: 'fetch_remote_messages',
    tenant_id: tenantId,
    user_id: userId,
    instance_id: conversation.instance_id,
    conversation_id: conversation.id,
    provider_chat_id_raw: extId,
    canonical_chat_id: crow?.canonical_chat_id,
    message_find_chatid: resolution.chatid,
    message_find_strategy: resolution.strategy,
    message_find_jid_class: resolution.jid_class,
    identity_state: crow?.identity_state,
    history_sync_status: crow?.history_sync_status,
    uazapi_endpoint: 'POST /message/find',
    sync_run_id: opts.syncRunId ?? null,
    trigger: opts.trigger ?? null,
    sync_trigger_source: syncTriggerSource,
    detail: `message_find_limit_requested=${requestedLimit} effective=${effectiveLimit}`,
  });

  const messagesResponse = (await uazapiService.findMessages(
    conversation.instance_token,
    body
  )) as AnyObject;

  const extractMessages = (resp: AnyObject) =>
    (Array.isArray(resp?.messages) && resp.messages) ||
    (Array.isArray(resp?.data?.messages) && resp.data.messages) ||
    (Array.isArray(resp?.data) && resp.data) ||
    (Array.isArray(resp) ? resp : []);

  const remoteMessages = extractMessages(messagesResponse) as AnyObject[];

  const exRows = await pool.query<{ external_message_id: string }>(
    `SELECT external_message_id FROM chat_messages
     WHERE conversation_id = $1 AND external_message_id IS NOT NULL`,
    [conversation.id]
  );
  const existingExternalIds = new Set(
    exRows.rows
      .map((r) => r.external_message_id)
      .filter((id): id is string => Boolean(id && String(id).trim()))
  );

  if (
    (typeof messagesResponse?.returnedMessages === 'number'
      ? messagesResponse.returnedMessages
      : remoteMessages.length) === 0
  ) {
    logUazChat('warn', {
      event_type,
      phase: 'message_find_empty',
      tenant_id: tenantId,
      user_id: userId,
      instance_id: conversation.instance_id,
      conversation_id: conversation.id,
      provider_chat_id_raw: extId,
      canonical_chat_id: crow?.canonical_chat_id ?? null,
      message_find_chatid_used: resolution.chatid,
      message_find_strategy: resolution.strategy,
      message_find_jid_class: resolution.jid_class,
      returnedMessages: messagesResponse?.returnedMessages ?? 0,
      uazapi_endpoint: 'POST /message/find',
      sync_run_id: opts.syncRunId ?? null,
      trigger: opts.trigger ?? null,
      sync_trigger_source: syncTriggerSource,
      detail:
        'sem mensagens retornadas para o canonical_chat_id (janela vazia ou provedor sem índice para este JID)',
    });
  }

  /** Evita N chamadas à Uaz em sync grande; foco em mídia recebida sem URL no payload. */
  const MAX_INCOMING_MEDIA_DOWNLOAD_PER_SYNC = 60;
  let syncIncomingMediaDownloads = 0;

  let saved = 0;
  let skippedExistingRemote = 0;
  for (const entry of remoteMessages) {
    const message = mergeMessageEnvelope(entry);
    if (!message) continue;

    const direction = message.fromMe || message.wasSentByApi ? 'outgoing' : 'incoming';
    const timestamp = message.timestamp || message.messageTimestamp;
    let sentAt: Date | null = null;
    if (timestamp) {
      const numeric = Number(timestamp);
      if (!Number.isNaN(numeric)) {
        sentAt = new Date(numeric > 1e12 ? numeric : numeric * 1000);
      }
    }

    if (
      opts.minTimestampMs != null &&
      opts.minTimestampMs > 0 &&
      sentAt &&
      sentAt.getTime() < opts.minTimestampMs
    ) {
      continue;
    }

    const msgExternalId =
      message.id ||
      message.messageId ||
      message.messageid ||
      message.key?.id ||
      randomUUID();
    const extIdStr = String(msgExternalId);
    if (existingExternalIds.has(extIdStr)) {
      skippedExistingRemote += 1;
      continue;
    }

    const syncBody = extractMessageBody(message) || null;
    let syncMedia = extractMediaInfo(message);
    const syncKind = inferMessageTypeFromPayload(message);
    const syncBodyPlain = ensurePlainString(syncBody ?? '');
    if (syncMedia.length === 0 && syncKind !== 'text' && syncKind !== 'unknown') {
      syncMedia = buildPersistentMediaStubForKind(message, syncKind);
    }
    const hasRenderableUrl = mediaItemsHaveRenderableUrl(syncMedia);
    const tryMediaDownload =
      !hasRenderableUrl &&
      !syncBodyPlain &&
      syncIncomingMediaDownloads < MAX_INCOMING_MEDIA_DOWNLOAD_PER_SYNC &&
      ((direction === 'incoming' &&
        (syncKind === 'image' ||
          syncKind === 'video' ||
          syncKind === 'audio' ||
          syncKind === 'document' ||
          syncKind === 'sticker' ||
          syncKind === 'unknown')) ||
        (direction === 'outgoing' && syncKind === 'unknown'));
    if (tryMediaDownload) {
      const hint: ChatMessageKind = syncKind === 'unknown' ? 'image' : syncKind;
      const fromDl = await fetchIncomingMediaViaDownload(
        conversation.instance_token,
        message,
        hint
      );
      if (fromDl.length > 0) {
        syncMedia = fromDl;
        syncIncomingMediaDownloads += 1;
      } else {
        const stubLeft =
          syncMedia.length > 0 &&
          syncMedia.some(
            (it) =>
              (it as ChatMediaItem & { persistentStub?: boolean }).persistentStub === true ||
              (typeof it.url === 'string' && it.url.startsWith('data:'))
          );
        if (stubLeft) {
          logUazChat('warn', {
            event_type,
            phase: 'media_download_failed_preserved_stub',
            tenant_id: tenantId,
            user_id: userId,
            instance_id: conversation.instance_id,
            conversation_id: conversation.id,
            sync_run_id: opts.syncRunId ?? null,
            sync_trigger_source: syncTriggerSource,
            detail: `kind=${syncKind} external_message_id=${extIdStr}`,
          });
        } else if (syncKind !== 'unknown') {
          syncMedia = buildPersistentMediaStubForKind(message, syncKind);
          logUazChat('warn', {
            event_type,
            phase: 'media_download_failed_preserved_stub',
            tenant_id: tenantId,
            user_id: userId,
            instance_id: conversation.instance_id,
            conversation_id: conversation.id,
            sync_run_id: opts.syncRunId ?? null,
            sync_trigger_source: syncTriggerSource,
            detail: `kind=${syncKind} external_message_id=${extIdStr} rebuilt_minimal_stub`,
          });
        }
      }
    }
    const msgRec = message && typeof message === 'object' ? (message as Record<string, unknown>) : {};
    const groupMeta =
      extId.toLowerCase().endsWith('@g.us') && isWhatsappGroupsEnabled()
        ? extractGroupMessageMetadataForDb(msgRec)
        : {};
    await saveMessage(conversation.id, direction, {
      externalMessageId: msgExternalId,
      body: syncBody,
      media: syncMedia.length > 0 ? syncMedia : [],
      messageKind: inferMessageTypeFromPayload(message),
      status:
        direction === 'outgoing'
          ? (pickBestOutgoingStatus('provider_sent', message.status) ?? 'provider_sent')
          : (message.status || null),
      sentAt,
      metadata: { ...msgRec, ...groupMeta },
      skipUnreadUpdate: true,
    });
    saved += 1;
    existingExternalIds.add(extIdStr);
  }

  if (remoteMessages.length > 0) {
    logUazChat('info', {
      event_type,
      phase: 'sync_messages_batch_summary',
      tenant_id: tenantId,
      user_id: userId,
      instance_id: conversation.instance_id,
      conversation_id: conversation.id,
      sync_trigger_source: syncTriggerSource,
      detail: `saved=${saved} skipped_existing_remote=${skippedExistingRemote} remote_batch=${remoteMessages.length}`,
    });
  }

  if (saved > 0) {
    await reconcileConversationLastMessage(conversation.id);
  }

  await pool.query(
    `
    UPDATE chat_conversations SET
      history_sync_status = 'synced',
      last_history_sync_reason = $2,
      last_history_sync_at = now(),
      updated_at = now()
    WHERE id = $1
    `,
    [
      conversation.id,
      saved > 0 ? 'messages_imported' : 'messages_sync_no_new_rows',
    ]
  );

  /** Sync manual HTTP ou force=true: sempre reconsulta nome/foto no provider (não usar gate "já resolvido"). */
  const userInitiatedConversationSync =
    opts.eventType === 'sync_messages_http' && opts.skipTerminalIdentityRefresh !== true;
  const shouldAlwaysRefreshIdentity =
    userInitiatedConversationSync ||
    opts.force === true ||
    syncTriggerSource === 'sync_forced_manual';

  const identityTelemetry: RemoteIdentityTelemetry = { contacts_called: 0, chat_find_called: 0 };
  let identityUpserted: AnyObject | null = null;

  if (shouldAlwaysRefreshIdentity) {
    logUazChat('info', {
      event_type: 'identity_refresh_forced_manual',
      phase: 'before_remote_fetch',
      tenant_id: tenantId,
      user_id: userId,
      instance_id: conversation.instance_id,
      conversation_id: conversation.id,
      sync_trigger_source: syncTriggerSource,
      opts: {
        force: opts.force === true,
        eventType: opts.eventType ?? null,
      },
      skipTerminalIdentityRefresh: opts.skipTerminalIdentityRefresh === true,
    });
  }

  const skipTerminalIdentity =
    opts.skipTerminalIdentityRefresh === true ||
    (!shouldAlwaysRefreshIdentity &&
      shouldSkipTerminalIdentityRefreshAfterMessageSync({
        identity_state: crow?.identity_state ?? null,
        canonical_chat_id: crow?.canonical_chat_id ?? null,
        display_name: crow?.display_name ?? null,
        contact_name: crow?.contact_name ?? null,
        avatar_url: crow?.avatar_url ?? null,
        metadata: crow?.metadata ?? null,
      }));

  if (skipTerminalIdentity) {
    logUazChat('info', {
      event_type,
      phase: 'identity_refresh_skipped_resolved',
      tenant_id: tenantId,
      user_id: userId,
      instance_id: conversation.instance_id,
      conversation_id: conversation.id,
      sync_trigger_source: syncTriggerSource,
      detail: opts.skipTerminalIdentityRefresh
        ? 'skipTerminalIdentityRefresh_opt'
        : 'resolved_identity_name_and_portrait_present',
    });
  } else {
    try {
      const instRow = await fetchInstanceForOperate(userId, conversation.instance_id);
      if (instRow) {
        identityUpserted = await fetchAndUpsertRemoteChatIdentity(
          instRow as ChatInstanceRow,
          conversation.external_chat_id,
          {
            forceRefresh: shouldAlwaysRefreshIdentity,
            telemetry: identityTelemetry,
          }
        );
      }
    } catch (idErr: any) {
      logUazChat('warn', {
        event_type,
        phase: 'identity_refresh_failed',
        tenant_id: tenantId,
        conversation_id: conversation.id,
        detail: idErr?.message,
      });
      console.warn('[SyncMessages] identity refresh failed:', idErr?.message);
    }
  }

  const durationMs = Date.now() - syncT0;
  const messagesReturnedCount =
    typeof messagesResponse?.returnedMessages === 'number'
      ? messagesResponse.returnedMessages
      : remoteMessages.length;
  const identityRefreshed = !skipTerminalIdentity && identityUpserted != null;
  const identitySkippedCooldown =
    !skipTerminalIdentity && identityTelemetry.skipped_cooldown === true;

  logUazChat('info', {
    event_type: 'chat_sync_summary',
    phase: 'complete',
    tenant_id: tenantId,
    user_id: userId,
    instance_id: conversation.instance_id,
    conversation_id: conversation.id,
    sync_trigger_source: syncTriggerSource,
    messages_requested: requestedLimit,
    messages_returned: messagesReturnedCount,
    messages_saved: saved,
    messages_skipped_existing: skippedExistingRemote,
    identity_refreshed: identityRefreshed,
    identity_skipped_cooldown: identitySkippedCooldown,
    contacts_called: skipTerminalIdentity ? 0 : identityTelemetry.contacts_called,
    chat_find_called: skipTerminalIdentity ? 0 : identityTelemetry.chat_find_called,
    refresh_identity_endpoint_called: false,
    duration_ms: durationMs,
  });

  return {
    synced: saved,
    totalReturned: remoteMessages.length,
    messagesResponse,
    history_sync_blocked: false,
    identity_refresh_skipped: skipTerminalIdentity,
    skipped_existing_remote: skippedExistingRemote,
    chat_sync_summary: {
      messages_requested: requestedLimit,
      messages_returned: messagesReturnedCount,
      messages_saved: saved,
      messages_skipped_existing: skippedExistingRemote,
      identity_refreshed: identityRefreshed,
      identity_skipped_cooldown: identitySkippedCooldown,
      contacts_called: skipTerminalIdentity ? 0 : identityTelemetry.contacts_called,
      chat_find_called: skipTerminalIdentity ? 0 : identityTelemetry.chat_find_called,
      refresh_identity_endpoint_called: false,
      duration_ms: durationMs,
    },
  };
}

async function runBootstrapSyncJob(
  userId: string,
  instanceId: string,
  syncRunId: string,
  trigger: BootstrapSyncTrigger
): Promise<void> {
  const startedWallMs = Date.now();
  const tenantId = await resolveTenantIdForUser(userId);
  const instRes = await pool.query<ChatInstanceRow>(
    'SELECT * FROM chat_instances WHERE id = $1',
    [instanceId]
  );
  const instance = instRes.rows[0];
  if (!instance) {
    console.log(
      JSON.stringify({
        tag: '[chat-initial-sync]',
        instanceId,
        tenantId,
        trigger,
        status: 'failed',
        reason: 'instance_not_found',
        conversationsSynced: 0,
        messagesSaved: 0,
        durationMs: Date.now() - startedWallMs,
      })
    );
    logUazChat('warn', {
      event_type: 'bootstrap_sync_aborted',
      tenant_id: tenantId,
      user_id: userId,
      instance_id: instanceId,
      sync_run_id: syncRunId,
      detail: 'instância não encontrada',
    });
    logUazChat('warn', {
      event_type: 'sync_ignored_deleted_instance',
      tenant_id: tenantId,
      user_id: userId,
      instance_id: instanceId,
      sync_run_id: syncRunId,
      phase: 'bootstrap_job',
      detail: 'instância ausente (provável DELETE); job abortado sem chamadas UazAPI',
    });
    return;
  }

  const bs = instance.metadata?.bootstrap_sync;
  if (!bs || bs.sync_run_id !== syncRunId) {
    console.log(
      JSON.stringify({
        tag: '[chat-initial-sync]',
        instanceId,
        tenantId,
        trigger,
        status: 'skipped',
        reason: 'stale_sync_run',
        conversationsSynced: 0,
        messagesSaved: 0,
        durationMs: Date.now() - startedWallMs,
      })
    );
    logUazChat('info', {
      event_type: 'bootstrap_sync_skip',
      tenant_id: tenantId,
      user_id: userId,
      instance_id: instanceId,
      sync_run_id: syncRunId,
      detail: 'sync_run_id não confere (job obsoleto)',
    });
    return;
  }

  if (instance.status !== 'connected' && instance.status !== 'open') {
    await mergeInstanceMetadata(instanceId, {
      bootstrap_sync: {
        ...bs,
        status: 'failed',
        finished_at: new Date().toISOString(),
        error: 'instance_not_connected',
      },
    });
    console.log(
      JSON.stringify({
        tag: '[chat-initial-sync]',
        instanceId,
        tenantId,
        trigger,
        status: 'failed',
        reason: 'instance_not_connected',
        conversationsSynced: 0,
        messagesSaved: 0,
        durationMs: Date.now() - startedWallMs,
      })
    );
    logUazChat('warn', {
      event_type: 'bootstrap_sync_failed',
      tenant_id: tenantId,
      user_id: userId,
      instance_id: instanceId,
      sync_run_id: syncRunId,
      phase: 'pre_check',
      detail: 'status não é connected/open',
    });
    return;
  }

  const startedAt = new Date().toISOString();
  await mergeInstanceMetadata(instanceId, {
    bootstrap_sync: {
      ...bs,
      status: 'running',
      started_at: startedAt,
    },
  });

  const effectiveSyncMode = normalizeSyncMode(instance.metadata?.sync_mode);
  const bootstrapSinceMs = syncModeToMinTimestampMs(effectiveSyncMode);

  logUazChat('info', {
    event_type: 'bootstrap_sync_started',
    tenant_id: tenantId,
    user_id: userId,
    instance_id: instanceId,
    external_instance_name: instance.external_instance_name,
    sync_run_id: syncRunId,
    phase: 'running',
    trigger,
    sync_mode: effectiveSyncMode,
    sync_on_connect: instance.metadata?.sync_on_connect ?? true,
    detail:
      bootstrapSinceMs != null
        ? `janela=${effectiveSyncMode} min_iso=${new Date(bootstrapSinceMs).toISOString()}`
        : `janela=${effectiveSyncMode} (sem filtro de data além dos limites padrão)`,
  });
  console.log(
    JSON.stringify({
      tag: '[chat-initial-sync]',
      instanceId,
      tenantId,
      trigger,
      status: 'started',
      reason: null,
      conversationsSynced: 0,
      messagesSaved: 0,
      durationMs: Date.now() - startedWallMs,
    })
  );

  try {
    const convResult = await performSyncConversationsForInstance(instance, {
      limit: BOOTSTRAP_CONV_LIMIT,
      syncRunId,
      tenantId,
      trigger,
      eventType: 'bootstrap_sync_conversations',
      sinceTimestampMs: bootstrapSinceMs,
    });

    const convRows = await pool.query<{ id: string; external_chat_id: string; instance_id: string; instance_token: string }>(
      `
      SELECT c.id, c.external_chat_id, c.instance_id, i.instance_token
      FROM chat_conversations c
      INNER JOIN chat_instances i ON i.id = c.instance_id
      WHERE c.user_id = $1 AND c.instance_id = $2
        AND c.external_chat_id NOT LIKE '%@g.us'
        AND c.identity_state = 'resolved'
        AND c.canonical_chat_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM chat_messages m WHERE m.conversation_id = c.id)
      ORDER BY COALESCE(
        (SELECT MAX(COALESCE(m.sent_at, m.created_at)) FROM chat_messages m WHERE m.conversation_id = c.id),
        c.last_message_at,
        c.created_at
      ) DESC NULLS LAST
      LIMIT $3
      `,
      [userId, instanceId, BOOTSTRAP_MAX_CHATS_FOR_MESSAGES]
    );

    let messagesSynced = 0;
    for (const row of convRows.rows) {
      const r = await performSyncConversationMessagesForConversation(row, userId, {
        limit: BOOTSTRAP_MSG_LIMIT,
        syncRunId,
        tenantId,
        trigger,
        eventType: 'bootstrap_sync_messages',
        minTimestampMs: bootstrapSinceMs,
        skipTerminalIdentityRefresh: true,
      });
      messagesSynced += r.synced;
    }

    let groupBootstrapTried = 0;
    if (isWhatsappGroupsEnabled()) {
      const groupConvRows = await pool.query<{
        id: string;
        external_chat_id: string;
        instance_id: string;
        instance_token: string;
      }>(
        `
      SELECT c.id, c.external_chat_id, c.instance_id, i.instance_token
      FROM chat_conversations c
      INNER JOIN chat_instances i ON i.id = c.instance_id
      WHERE c.user_id = $1 AND c.instance_id = $2
        AND (c.conversation_type = 'group' OR c.external_chat_id LIKE '%@g.us')
        AND c.identity_state = 'resolved'
        AND c.canonical_chat_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM chat_messages m WHERE m.conversation_id = c.id)
      ORDER BY COALESCE(
        (SELECT MAX(COALESCE(m.sent_at, m.created_at)) FROM chat_messages m WHERE m.conversation_id = c.id),
        c.last_message_at,
        c.created_at
      ) DESC NULLS LAST
      LIMIT $3
      `,
        [userId, instanceId, GROUP_SYNC_MAX_CHATS_PER_CYCLE]
      );
      groupBootstrapTried = groupConvRows.rows.length;
      for (const row of groupConvRows.rows) {
        const r = await performSyncConversationMessagesForConversation(row, userId, {
          limit: GROUP_MESSAGE_SYNC_LIMIT,
          syncRunId,
          tenantId,
          trigger,
          eventType: 'bootstrap_sync_messages_group',
          minTimestampMs: bootstrapSinceMs,
          skipTerminalIdentityRefresh: true,
        });
        messagesSynced += r.synced;
      }
      if (groupBootstrapTried > 0) {
        console.log('[chat-groups-sync]', {
          instance_id: instanceId,
          trigger,
          phase: 'bootstrap_messages',
          group_chats_tried: groupBootstrapTried,
        });
      }
    }

    const finishedAt = new Date().toISOString();
    await mergeInstanceMetadata(instanceId, {
      bootstrap_sync: {
        ...bs,
        sync_run_id: syncRunId,
        status: 'completed',
        started_at: startedAt,
        finished_at: finishedAt,
        trigger,
        applied_sync_mode: effectiveSyncMode,
        applied_since_ms: bootstrapSinceMs,
        conversations_total: convResult.total,
        conversations_upserted: convResult.upserted,
        messages_synced: messagesSynced,
        chats_messages_tried: convRows.rows.length + groupBootstrapTried,
      },
    });

    logUazChat('info', {
      event_type: 'bootstrap_sync_completed',
      tenant_id: tenantId,
      user_id: userId,
      instance_id: instanceId,
      external_instance_name: instance.external_instance_name,
      sync_run_id: syncRunId,
      phase: 'completed',
      detail: `conv_total=${convResult.total} conv_upserted=${convResult.upserted} msgs=${messagesSynced} private_chats_tried=${convRows.rows.length} group_chats_tried=${groupBootstrapTried}`,
    });
    console.log(
      JSON.stringify({
        tag: '[chat-initial-sync]',
        instanceId,
        tenantId,
        trigger,
        status: 'completed',
        reason: null,
        conversationsSynced: convResult.upserted,
        messagesSaved: messagesSynced,
        durationMs: Date.now() - startedWallMs,
      })
    );
  } catch (e: any) {
    const msg = e?.message || String(e);
    await mergeInstanceMetadata(instanceId, {
      bootstrap_sync: {
        ...instance.metadata?.bootstrap_sync,
        sync_run_id: syncRunId,
        status: 'failed',
        finished_at: new Date().toISOString(),
        error: msg,
        trigger,
      },
    });
    logUazChat('error', {
      event_type: 'bootstrap_sync_failed',
      tenant_id: tenantId,
      user_id: userId,
      instance_id: instanceId,
      external_instance_name: instance.external_instance_name,
      sync_run_id: syncRunId,
      phase: 'error',
      detail: msg,
    });
    console.log(
      JSON.stringify({
        tag: '[chat-initial-sync]',
        instanceId,
        tenantId,
        trigger,
        status: 'failed',
        reason: msg.slice(0, 500),
        conversationsSynced: 0,
        messagesSaved: 0,
        durationMs: Date.now() - startedWallMs,
      })
    );
  }
}

export async function connectInstance(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const data = connectSchema.parse(req.body || {});

    const instance = await loadInstanceForManage(userId, id, res);
    if (!instance) return;

    const tenantId = await resolveTenantIdForUser(userId);

    if (data.reset_chat_history === true) {
      const removed = await purgeChatHistoryForInstance(instance.id, userId);
      logUazChat('info', {
        event_type: 'connect_reset_chat_history',
        tenant_id: tenantId,
        user_id: userId,
        instance_id: instance.id,
        phase: 'before_connect',
        detail: `conversations_removed=${removed}`,
      });
    }
    logUazChat('info', {
      event_type: 'connect_instance_start',
      tenant_id: tenantId,
      user_id: userId,
      instance_id: instance.id,
      external_instance_name: instance.external_instance_name,
      phase: 'request',
    });

    let response: AnyObject;
    let instanceToUse = instance;

    // Tentar conectar diretamente - simplificado
    try {
      response = (await uazapiService.connectInstance(
      instance.instance_token,
      data.phone || undefined
    )) as AnyObject;
    } catch (connectError: any) {
      const errorMessage = connectError?.message || '';
      const errorStatus = connectError?.status;
      
      // Erro 409: Conflict (instância já conectada) - simplificado
      if (errorStatus === 409 || errorMessage.toLowerCase().includes('conflict') || errorMessage.toLowerCase().includes('already connected')) {
        console.log('[ConnectInstance] Erro 409 detectado, desconectando e reconectando...', {
          instanceId: instance.id,
        });

        try {
          // Desconectar e reconectar imediatamente (sem delay)
          await uazapiService.disconnectInstance(instance.instance_token);
          await pool.query(
            'UPDATE chat_instances SET status = $1, updated_at = now() WHERE id = $2',
            ['disconnected', instance.id]
          );

          // Reconectar imediatamente
          response = (await uazapiService.connectInstance(
            instance.instance_token,
            data.phone || undefined
          )) as AnyObject;
          
          console.log('[ConnectInstance] Reconexão bem-sucedida após 409');
        } catch (retryError: any) {
          console.error('[ConnectInstance] Erro ao reconectar após 409:', retryError.message);
          res.status(409).json({ 
            error: 'Instância já está conectada. Desconecte primeiro para gerar novo QR code.',
            details: retryError.message || errorMessage,
          });
          return;
        }
      }
      // Erro 429: Too Many Requests (rate limiting)
      else if (errorStatus === 429) {
        console.error('[ConnectInstance] Rate limit atingido (429)', {
          instanceId: instance.id,
          message: errorMessage,
        });
        res.status(429).json({ 
          error: 'Muitas requisições. Por favor, aguarde alguns instantes antes de tentar novamente.',
          details: errorMessage,
          retryAfter: 60, // Sugerir aguardar 60 segundos
        });
        return;
      }

      // Se o erro for "Invalid token", criar nova instância
      const isInvalidToken = 
        errorMessage.toLowerCase().includes('invalid token') ||
        errorMessage.toLowerCase().includes('token inválido') ||
        errorStatus === 401 ||
        errorStatus === 403;

      if (isInvalidToken) {
        console.log('[ConnectInstance] Token inválido detectado, criando nova instância...', {
          instanceId: instance.id,
          instanceName: instance.name,
          oldToken: instance.instance_token ? '***' + instance.instance_token.slice(-4) : 'MISSING',
        });

        try {
          // Criar nova instância na UazAPI com o mesmo nome
          const newRemoteInstance = (await uazapiService.createInstance(
            instance.name,
            instance.metadata || {}
          )) as AnyObject;

          const newInstanceInfo = newRemoteInstance?.instance || newRemoteInstance;
          const newInstanceToken = newInstanceInfo?.token || newRemoteInstance?.token;

          if (!newInstanceToken) {
            throw new Error('Token da nova instância não foi retornado pela UazAPI');
          }

          console.log('[ConnectInstance] Nova instância criada na UazAPI', {
            instanceId: instance.id,
            newToken: '***' + newInstanceToken.slice(-4),
          });

          // Atualizar registro no banco com novo token
          // Marcar que o token mudou para forçar reconfiguração do webhook
          await pool.query(
            `
            UPDATE chat_instances
            SET instance_token = $1,
                status = 'disconnected',
                metadata = COALESCE(metadata, '{}'::jsonb) || '{"tokenChanged": true}'::jsonb,
                updated_at = now()
            WHERE id = $2
            `,
            [newInstanceToken, instance.id]
          );

          // Buscar instância atualizada
          const updatedInstanceResult = await pool.query<ChatInstanceRow>(
            'SELECT * FROM chat_instances WHERE id = $1',
            [instance.id]
          );
          
          if (updatedInstanceResult.rows.length === 0) {
            throw new Error('Instância não encontrada após atualização');
          }

          instanceToUse = updatedInstanceResult.rows[0];

          const purged = await purgeChatHistoryForInstance(instance.id, userId);
          logUazChat('info', {
            event_type: 'instance_token_recreated_purged_local_chat',
            tenant_id: tenantId,
            user_id: userId,
            instance_id: instance.id,
            phase: 'after_new_token',
            detail: `conversations_removed=${purged} (histórico local limpo; sem herança por phone_key)`,
          });

          // Tentar conectar novamente com o novo token
          response = (await uazapiService.connectInstance(
            newInstanceToken,
            data.phone || undefined
          )) as AnyObject;

          console.log('[ConnectInstance] Reconexão bem-sucedida com novo token');

          // Configurar webhook imediatamente após recriar instância
          // Isso é crítico para que novas mensagens sejam recebidas
          try {
            console.log('[ConnectInstance] Configurando webhook para nova instância...', {
              instanceId: instanceToUse.id,
              instanceToken: '***' + instanceToUse.instance_token.slice(-4),
            });
            await autoConfigureWebhook(instanceToUse);
            console.log('[ConnectInstance] Webhook configurado com sucesso para nova instância', {
              instanceId: instanceToUse.id,
            });
            
            // Verificar se webhook foi configurado corretamente
            try {
              const webhookCheck = await uazapiService.getWebhook(instanceToUse.instance_token) as any;
              console.log('[ConnectInstance] Webhook verification:', {
                instanceId: instanceToUse.id,
                webhookConfigured: !!webhookCheck,
                webhookUrl: webhookCheck?.url || 'not found',
              });
            } catch (checkError: any) {
              console.warn('[ConnectInstance] Não foi possível verificar webhook:', checkError.message);
            }
          } catch (webhookError: any) {
            console.error('[ConnectInstance] Erro ao configurar webhook após recriar instância:', {
              error: webhookError.message,
              stack: webhookError.stack,
              instanceId: instanceToUse.id,
            });
            // Não falhar o processo se webhook falhar, mas logar o erro
          }
        } catch (recreateError: any) {
          console.error('[ConnectInstance] Erro ao recriar instância:', {
            error: recreateError.message,
            stack: recreateError.stack,
          });
          res.status(500).json({ 
            error: 'Falha ao recriar instância',
            details: recreateError.message || 'Token inválido e não foi possível criar nova instância',
          });
          return;
        }
      } else {
        // Se não for erro de token inválido nem 409/429, retornar erro HTTP
        console.error('[ConnectInstance] Erro desconhecido ao conectar:', {
          instanceId: instance.id,
          errorStatus,
          errorMessage,
        });
        res.status(errorStatus || 500).json({ 
          error: 'Erro ao conectar instância',
          details: errorMessage,
        });
        return;
      }
    }

    if (isUazIntegrationVerboseLogs()) {
      console.log('UazAPI connectInstance response (verbose):', JSON.stringify(response, null, 2));
    }

    // Extrair informações do perfil conectado da resposta
    const instanceData = response?.instance || response;
    const connectedPhone = extractConnectedPhone(response);
    const profileName = extractConnectedProfileName(response);

    const profilePicUrl = 
      response?.profilePicUrl ||
      instanceData?.profilePicUrl ||
      response?.profilePicture ||
      instanceData?.profilePicture ||
      response?.pictureUrl ||
      instanceData?.pictureUrl ||
      response?.profile_pic_url ||
      instanceData?.profile_pic_url ||
      (response?.instance && typeof response.instance === 'object' ? (response.instance as any).profilePicUrl : null) ||
      (instanceData?.instance && typeof instanceData.instance === 'object' ? (instanceData.instance as any).profilePicUrl : null) ||
      (response?.instance && typeof response.instance === 'object' ? (response.instance as any).profile_pic_url : null) ||
      (instanceData?.instance && typeof instanceData.instance === 'object' ? (instanceData.instance as any).profile_pic_url : null) ||
      null;
    
    console.log('[ConnectInstance] Profile info extraction:', {
      hasResponse: !!response,
      hasInstanceData: !!instanceData,
      responseKeys: response ? Object.keys(response) : [],
      instanceDataKeys: instanceData ? Object.keys(instanceData) : [],
      responseInstanceKeys: response?.instance && typeof response.instance === 'object' ? Object.keys(response.instance) : null,
      instanceDataInstanceKeys: instanceData?.instance && typeof instanceData.instance === 'object' ? Object.keys(instanceData.instance) : null,
      responseInstanceProfilePicUrl: response?.instance && typeof response.instance === 'object' ? (response.instance as any).profilePicUrl : null,
      instanceDataInstanceProfilePicUrl: instanceData?.instance && typeof instanceData.instance === 'object' ? (instanceData.instance as any).profilePicUrl : null,
      profilePicUrl,
      profileName,
      connectedPhone,
    });

    // Preparar metadata atualizado
    const updatedMetadata: any = {
      lastConnect: response,
    };

    // Se encontrou informações do perfil, salvar
    if (connectedPhone) {
      updatedMetadata.connectedPhone = connectedPhone;
      console.log('[ConnectInstance] Connected phone found:', connectedPhone);
    }
    if (profileName) {
      updatedMetadata.connectedProfileName = profileName;
      console.log('[ConnectInstance] Profile name found:', profileName);
    }
    if (profilePicUrl) {
      updatedMetadata.connectedProfilePicUrl = profilePicUrl;
      console.log('[ConnectInstance] Profile picture URL found and saved:', profilePicUrl);
    } else {
      console.log('[ConnectInstance] Profile picture URL NOT found. Response structure:', {
        hasResponse: !!response,
        hasInstanceData: !!instanceData,
        responseKeys: response ? Object.keys(response) : [],
        instanceDataKeys: instanceData ? Object.keys(instanceData) : [],
        responseInstance: response?.instance ? Object.keys(response.instance) : null,
        instanceDataInstance: instanceData?.instance ? Object.keys(instanceData.instance) : null,
      });
    }

    if (data.sync_on_connect !== undefined) {
      updatedMetadata.sync_on_connect = data.sync_on_connect;
    }
    if (data.sync_mode !== undefined) {
      updatedMetadata.sync_mode = normalizeSyncMode(data.sync_mode);
    }
    if (data.sync_on_connect !== undefined || data.sync_mode !== undefined) {
      logUazChat('info', {
        event_type: 'instance_sync_config_persisted',
        tenant_id: tenantId,
        user_id: userId,
        instance_id: instanceToUse.id,
        phase: 'connect_instance',
        sync_on_connect: updatedMetadata.sync_on_connect ?? null,
        sync_mode: updatedMetadata.sync_mode ?? null,
        detail: 'Etapa 4: campos opcionais no POST /instances/:id/connect',
      });
    }

    // Normalizar número e gerar phone_key
    let normalizedPhone: string | null = null;
    let phoneKey: string | null = null;
    if (connectedPhone) {
      normalizedPhone = normalizePhoneNumber(connectedPhone);
      if (normalizedPhone) {
        // Gerar chave única: user_id + ':' + normalized_phone
        phoneKey = `${instanceToUse.user_id}:${normalizedPhone}`;
        console.log('[ConnectInstance] Generated phone_key:', phoneKey);
      }
    } else {
      // Se não houver connectedPhone, tentar preservar phone_key existente
      phoneKey = (instanceToUse as any).phone_key || null;
    }

    // Atualizar instância com status, metadata, connected_phone e phone_key
    await pool.query(
      `
      UPDATE chat_instances
      SET status = $1,
          metadata = metadata || $2::jsonb,
          connected_phone = COALESCE($3, connected_phone),
          phone_key = COALESCE($4, phone_key),
          updated_at = now()
      WHERE id = $5
    `,
      [
        response?.status || 'connecting',
        JSON.stringify(updatedMetadata),
        normalizedPhone,
        phoneKey,
        instanceToUse.id
      ]
    );

    // Se conectado com sucesso, configurar webhook automaticamente
    // Também tentar configurar se status for 'connecting' (pode ser QR code)
    if (response?.status === 'connected' || response?.status === 'open' || response?.status === 'connecting') {
      // Buscar instância atualizada
      const updatedInstance = await pool.query<ChatInstanceRow>(
        'SELECT * FROM chat_instances WHERE id = $1',
        [instanceToUse.id]
      );
      if (updatedInstance.rows[0]) {
        console.log('[ConnectInstance] Configurando webhook após conectar/gerar QR code...', {
          instanceId: updatedInstance.rows[0].id,
          status: response?.status,
        });
        // Configurar webhook mesmo se estiver connecting (será útil quando conectar)
        await autoConfigureWebhook(updatedInstance.rows[0]);
        
        // Verificar se webhook foi configurado
        try {
          const webhookCheck = (await uazapiService.getWebhook(updatedInstance.rows[0].instance_token)) as any;
          console.log('[ConnectInstance] Webhook verification after connect:', {
            instanceId: updatedInstance.rows[0].id,
            webhookConfigured: !!webhookCheck,
            webhookUrl: webhookCheck?.url || 'not found',
            webhookEnabled: webhookCheck?.enabled,
          });
        } catch (checkError: any) {
          console.warn('[ConnectInstance] Não foi possível verificar webhook após conectar:', checkError.message);
        }
      }
    }

    // Se phone_key foi gerado, opcionalmente herdar conversas legacy (só com WHATSAPP_INHERIT_CONVERSATIONS_ON_CONNECT=true)
    if (phoneKey) {
      inheritConversationsFromPhoneKey(instanceToUse.user_id, instanceToUse.id, phoneKey)
        .then(count => {
          if (count > 0) {
            console.log(`[ConnectInstance] ${count} conversas herdadas automaticamente`);
          }
        })
        .catch(err => {
          console.error('[ConnectInstance] Erro ao herdar conversas (não crítico):', err);
        });
    }

    if (response?.status === 'connected' || response?.status === 'open') {
      logUazChat('info', {
        event_type: 'connect_instance_connected',
        tenant_id: tenantId,
        user_id: userId,
        instance_id: instanceToUse.id,
        external_instance_name: instanceToUse.external_instance_name,
        phase: 'response',
        detail: String(response?.status),
      });
      await scheduleBootstrapSyncIfNeeded(userId, instanceToUse.id, 'instance_connected');
    }

    res.json(response);
  } catch (error: any) {
    logUazChat('error', {
      event_type: 'connect_instance_error',
      user_id: req.userId ?? null,
      phase: 'exception',
      detail: error?.message,
    });
    console.error('Error connecting instance:', error);
    res.status(500).json({ error: error.message || 'Failed to connect instance' });
  }
}

export async function deleteInstance(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const instance = await loadInstanceForManage(userId, id, res);
    if (!instance) return;

    const tenantId = await resolveTenantIdForUser(userId);
    const ownerT = await pool.query<{ tenant_id: string | null }>(`SELECT tenant_id FROM users WHERE id = $1`, [
      instance.user_id,
    ]);
    const actorT = await pool.query<{ tenant_id: string | null }>(`SELECT tenant_id FROM users WHERE id = $1`, [userId]);
    if ((ownerT.rows[0]?.tenant_id ?? null) !== (actorT.rows[0]?.tenant_id ?? null)) {
      res.status(403).json({
        error: 'Não é possível remover esta instância.',
        code: 'INSTANCE_DELETE_TENANT_MISMATCH',
      });
      return;
    }

    const result = await deleteChatInstanceComplete(pool, id, userId);
    if (!result.deleted || !result.audit) {
      res.status(404).json({ error: 'Instância não encontrada' });
      return;
    }

    logUazChat('info', {
      event_type: 'whatsapp_instance_deleted',
      tenant_id: tenantId,
      user_id: userId,
      instance_id: result.audit.instance_id,
      notifications_deleted: result.audit.notifications_deleted,
      provider_delete_ok: result.audit.provider_delete_ok,
      provider_delete_note: result.audit.provider_delete_note,
      external_instance_name: instance.external_instance_name ?? null,
    });

    try {
      emitToUser(userId, 'whatsapp.instance_removed', { instance_id: id });
    } catch {
      /* socket opcional */
    }

    res.json({
      ok: true,
      message:
        'Instância removida. Todas as conversas e mensagens desta linha foram apagadas deste PainelCRM. Ao conectar de novo, comece do zero.',
      audit: {
        notifications_deleted: result.audit.notifications_deleted,
        provider_delete_ok: result.audit.provider_delete_ok,
        provider_disconnect_attempted: result.audit.provider_disconnect_attempted,
      },
    });
  } catch (error: any) {
    console.error('Error deleting instance:', error);
    res.status(500).json({ error: error.message || 'Failed to delete instance' });
  }
}

/** PATCH: ativar/desativar instância no chat (metadata.enabled_in_chat). */
export async function patchInstance(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const body = patchInstanceSchema.parse(req.body || {});

    const instance = await loadInstanceForManage(userId, id, res);
    if (!instance) return;

    await pool.query(
      `UPDATE chat_instances
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
           updated_at = now()
       WHERE id = $2 AND user_id = $3`,
      [JSON.stringify({ enabled_in_chat: body.enabledInChat }), id, userId]
    );

    const tenantId = await resolveTenantIdForUser(userId);
    logUazChat('info', {
      event_type: 'instance_chat_enabled_updated',
      tenant_id: tenantId,
      user_id: userId,
      instance_id: id,
      enabled_in_chat: body.enabledInChat,
      detail: 'PATCH /instances/:id enabledInChat',
    });

    const out = await pool.query('SELECT * FROM chat_instances WHERE id = $1 AND user_id = $2', [id, userId]);
    res.json(out.rows[0]);
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      res.status(400).json({ error: 'Payload inválido', details: error.errors });
      return;
    }
    console.error('Error patching instance:', error);
    res.status(500).json({ error: error.message || 'Failed to update instance' });
  }
}

/**
 * Configura webhook para uma instância WhatsApp na UazAPI
 * 
 * Eventos padrão configurados:
 * - messages: Novas mensagens recebidas
 * - messages_update: Atualizações de status (entregue, lida, etc)
 * - connection: Mudanças no estado da conexão
 * - chats: Atualizações de conversas
 * - leads: Atualizações de leads
 * 
 * Filtros críticos aplicados:
 * - excludeMessages: ["wasSentByApi"] - PREVINE LOOPS INFINITOS
 */
export async function configureInstanceWebhook(req: AuthRequest, res: Response) {
  const startTime = Date.now();
  const configId = randomUUID();

  try {
    const userId = req.userId!;
    const { id } = req.params;
    const payload = webhookConfigSchema.parse(req.body || {});

    console.log(`[Webhook Config ${configId}] Starting webhook configuration`, {
      instanceId: id,
      userId,
      timestamp: new Date().toISOString(),
    });

    // Carregar instância
    const instance = await loadInstanceForManage(userId, id, res);
    if (!instance) return;

    const instanceSecret = await ensureInstanceWebhookSecret(instance);
    // Resolver URL do webhook (sempre com instanceId + secret por instância)
    const resolvedUrl = payload.url || buildInstanceWebhookUrl(instance.id, instanceSecret);

    if (!resolvedUrl) {
      console.error(`[Webhook Config ${configId}] Webhook URL not configured`);
      res.status(400).json({
        error: 'Webhook URL is not configured. Provide url or set UAZAPI_WEBHOOK_URL/PUBLIC_API_URL.',
      });
      return;
    }

    // Eventos padrão recomendados
    const defaultEvents = [
      'messages',        // Novas mensagens recebidas
      'messages_update', // Atualizações de status
      'chats',           // Atualizações de conversas
      'connection',      // Mudanças no estado da conexão
      'leads',           // Atualizações de leads
    ];

    // Filtros CRÍTICOS para prevenir loops
    // SEMPRE excluir mensagens enviadas pela API
    const defaultExcludeMessages = ['wasSentByApi'];

    // Mesclar filtros: sempre incluir wasSentByApi, mas permitir adicionar outros
    const excludeMessages = payload.excludeMessages
      ? [...new Set([...defaultExcludeMessages, ...payload.excludeMessages])]
      : defaultExcludeMessages;

    // Preparar body para UazAPI
    const webhookBody: Record<string, any> = {
      enabled: payload.enabled !== false, // Padrão: true
      url: resolvedUrl,
      events: payload.events || defaultEvents,
      excludeMessages: excludeMessages,
      addUrlEvents: payload.addUrlEvents ?? true, // Padrão: true (URLs dinâmicas)
      AddUrlTypesMessages: payload.addUrlTypesMessages ?? true, // Padrão: true
    };

    // Adicionar secret se configurado
    const secret = instanceSecret;
    if (secret) {
      webhookBody.secret = secret;
    }

    console.log(`[Webhook Config ${configId}] Configuring webhook in UazAPI`, {
      instance: instance.external_instance_name,
      url: resolvedUrl,
      events: webhookBody.events,
      excludeMessages: webhookBody.excludeMessages,
      hasSecret: !!secret,
    });

    // Configurar webhook na UazAPI
    let uazapiResponse;
    try {
      uazapiResponse = await uazapiService.configureWebhook(instance.instance_token, webhookBody);
      console.log(`[Webhook Config ${configId}] Webhook configured successfully in UazAPI`, {
        response: JSON.stringify(uazapiResponse).substring(0, 200),
      });
    } catch (error: any) {
      console.error(`[Webhook Config ${configId}] Error from UazAPI:`, {
        error: error.message,
        status: error.status,
        payload: error.payload,
      });
      throw error;
    }

    // Salvar configuração no banco de dados
    const webhookMetadata = {
      webhook: {
        url: resolvedUrl,
        events: webhookBody.events,
        excludeMessages: webhookBody.excludeMessages,
        addUrlEvents: webhookBody.addUrlEvents,
        addUrlTypesMessages: webhookBody.AddUrlTypesMessages,
        enabled: webhookBody.enabled,
        hasSecret: !!secret,
        webhookSecretMask: maskSecretForLogs(secret),
        webhookSecretSource: 'instance_column',
        configuredAt: new Date().toISOString(),
        configuredBy: userId,
        uazapiResponse: uazapiResponse,
      },
      webhook_url: resolvedUrl,
      webhook_secret: secret,
    };

    await pool.query(
      `
        UPDATE chat_instances
        SET metadata = metadata || $1::jsonb,
            webhook_secret = $3,
            webhook_secret_created_at = COALESCE(webhook_secret_created_at, now()),
            webhook_secret_last_seen_at = now(),
            webhook_needs_reconfiguration = false,
            updated_at = now()
        WHERE id = $2
      `,
      [JSON.stringify(webhookMetadata), instance.id, secret]
    );

    console.log(`[Webhook Config ${configId}] Webhook configuration saved to database`, {
      instanceId: instance.id,
      processingTime: Date.now() - startTime,
    });

    res.json({
      configured: true,
      webhookId: configId,
      url: resolvedUrl,
      events: webhookBody.events,
      excludeMessages: webhookBody.excludeMessages,
      enabled: webhookBody.enabled,
      uazapiResponse: uazapiResponse,
      metadata: webhookMetadata.webhook,
    });
  } catch (error: any) {
    console.error(`[Webhook Config ${configId}] Error configuring webhook:`, {
      error: error.message,
      stack: error.stack,
      instanceId: req.params.id,
      processingTime: Date.now() - startTime,
    });

    // Se for erro de validação do Zod, retornar detalhes
    if (error.name === 'ZodError') {
      res.status(400).json({
        error: 'Invalid webhook configuration',
        details: error.errors,
      });
      return;
    }

    res.status(500).json({
      error: error.message || 'Failed to configure webhook',
      webhookId: configId,
    });
  }
}

/**
 * Obtém a configuração atual do webhook de uma instância
 * Retorna tanto a configuração salva no banco quanto a da UazAPI
 */
export async function getInstanceWebhook(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const instance = await loadInstanceForManage(userId, id, res);
    if (!instance) return;

    // Buscar configuração do banco de dados
    const dbWebhook = instance.metadata?.webhook || null;

    // Buscar configuração da UazAPI
    let uazapiWebhook = null;
    try {
      uazapiWebhook = await uazapiService.getWebhook(instance.instance_token);
    } catch (error: any) {
      console.warn('Error fetching webhook from UazAPI:', {
        error: error.message,
        instanceId: id,
      });
      // Não falhar se UazAPI não retornar, apenas logar
    }

    res.json({
      instanceId: id,
      webhookStatus: {
        has_secret: isSecretStrongEnough(normalizeIncomingWebhookSecret((instance as any).webhook_secret) ?? null),
        needs_reconfiguration: Boolean((instance as any).webhook_needs_reconfiguration),
        last_seen_at: (instance as any).webhook_secret_last_seen_at ?? null,
      },
      database: dbWebhook,
      uazapi: uazapiWebhook,
      synced: dbWebhook && uazapiWebhook ? 
        dbWebhook.url === (Array.isArray(uazapiWebhook) ? (uazapiWebhook[0] as any)?.url : (uazapiWebhook as any)?.url) : 
        false,
    });
  } catch (error: any) {
    console.error('Error getting webhook configuration:', error);
    res.status(500).json({ error: error.message || 'Failed to get webhook configuration' });
  }
}

/**
 * Força a configuração do webhook para uma instância
 * Útil para reconfigurar ou configurar manualmente
 */
export async function forceConfigureWebhook(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const instance = await loadInstanceForManage(userId, id, res);
    if (!instance) return;

    console.log('[Force-Webhook] Forcing webhook configuration', {
      instance: instance.external_instance_name,
    });

    await autoConfigureWebhook(instance);

    // Buscar webhook configurado
    let webhookResult = null;
    try {
      webhookResult = await uazapiService.getWebhook(instance.instance_token);
    } catch (error: any) {
      console.warn('Error fetching webhook from UazAPI:', error.message);
    }

    res.json({
      configured: true,
      webhook: webhookResult,
      message: 'Webhook configuration forced',
    });
  } catch (error: any) {
    console.error('Error forcing webhook configuration:', error);
    res.status(500).json({ error: error.message || 'Failed to force webhook configuration' });
  }
}

export async function reconfigureInstanceWebhook(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const instance = await loadInstanceForManage(userId, id, res);
    if (!instance) return;

    const previousSecret = normalizeIncomingWebhookSecret((instance as any).webhook_secret) ?? null;
    const tenantId = await resolveTenantIdForUser(userId);
    await autoConfigureWebhook(instance);

    const fresh = await pool.query<ChatInstanceRow>('SELECT * FROM chat_instances WHERE id = $1 LIMIT 1', [id]);
    const row = fresh.rows[0];
    const nextSecret = normalizeIncomingWebhookSecret((row as any)?.webhook_secret) ?? null;

    res.json({
      ok: true,
      instanceId: id,
      webhook_url: ((row as any)?.metadata as Record<string, unknown> | undefined)?.webhook_url ?? null,
      webhook_needs_reconfiguration: Boolean((row as any)?.webhook_needs_reconfiguration),
      secret_changed: Boolean(previousSecret && nextSecret && !webhookSecretsEqual(previousSecret, nextSecret)),
      secret_mask: maskSecretForLogs(nextSecret),
    });
    logUazChat('info', {
      event_type: 'webhook_reconfigure',
      tenant_id: tenantId,
      user_id: userId,
      instance_id: id,
      phase: 'completed',
      detail: JSON.stringify({
        secretChanged: Boolean(previousSecret && nextSecret && !webhookSecretsEqual(previousSecret, nextSecret)),
      }),
    });
  } catch (error: any) {
    console.error('Error reconfiguring webhook:', error);
    res.status(500).json({ error: error.message || 'Failed to reconfigure webhook' });
  }
}

/** Regista novamente o webhook na Uaz com URL v2 (path) ou v1 (legacy env). */
export async function repairInstanceWebhook(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const { id } = req.params;
  const tenantId = await resolveTenantIdForUser(userId);
  logUazChat('info', {
    event_type: 'webhook_repair_started',
    tenant_id: tenantId,
    user_id: userId,
    instance_id: id,
    phase: 'start',
  });
  try {
    const instance = await loadInstanceForManage(userId, id, res);
    if (!instance) return;

    const prevFp = webhookSecretFingerprint(
      normalizeIncomingWebhookSecret((instance as any).webhook_secret),
    );
    await ensureInstanceWebhookSecret(instance);
    const peek = await pool.query<ChatInstanceRow>('SELECT * FROM chat_instances WHERE id = $1 LIMIT 1', [id]);
    const inst = peek.rows[0];
    if (!inst) {
      logUazChat('warn', {
        event_type: 'webhook_repair_failed',
        instance_id: id,
        detail: 'instance_not_found_after_ensure',
      });
      res.status(404).json({ error: 'Instância não encontrada' });
      return;
    }

    await autoConfigureWebhook(inst);

    const after = await pool.query<ChatInstanceRow>('SELECT * FROM chat_instances WHERE id = $1 LIMIT 1', [id]);
    const row = after.rows[0];
    const nextFp = webhookSecretFingerprint(
      normalizeIncomingWebhookSecret((row as any)?.webhook_secret),
    );
    const routeVer = useLegacyQueryWebhookUrlRegistration() ? 'v1' : 'v2';
    const tokenRotated = Boolean(prevFp && nextFp && prevFp !== nextFp);

    logUazChat('info', {
      event_type: 'webhook_repair_completed',
      tenant_id: tenantId,
      user_id: userId,
      instance_id: id,
      webhook_route_version: routeVer,
      token_rotated: tokenRotated,
      phase: 'completed',
    });

    res.json({
      ok: true,
      instance_id: id,
      webhook_route_version: routeVer,
      configured: true,
      token_rotated: tokenRotated,
    });
  } catch (error: any) {
    logUazChat('warn', {
      event_type: 'webhook_repair_failed',
      tenant_id: tenantId,
      user_id: userId,
      instance_id: id,
      detail: error?.message || String(error),
    });
    res.status(500).json({ error: error.message || 'Failed to repair webhook' });
  }
}

export async function rotateInstanceWebhookSecret(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const instance = await loadInstanceForManage(userId, id, res);
    if (!instance) return;

    const previousSecret = normalizeIncomingWebhookSecret((instance as any).webhook_secret) ?? null;
    const tenantId = await resolveTenantIdForUser(userId);
    const nextSecret = generateWebhookSecret();
    const callbackUrl = buildInstanceWebhookUrl(id, nextSecret);
    if (!callbackUrl) {
      res.status(400).json({ error: 'Webhook URL base não configurada (UAZAPI_WEBHOOK_URL/PUBLIC_API_URL)' });
      return;
    }

    const webhookBody: Record<string, any> = {
      enabled: true,
      url: callbackUrl,
      events: ['messages', 'messages_update', 'chats', 'connection', 'leads'],
      excludeMessages: ['wasSentByApi'],
      addUrlEvents: true,
      AddUrlTypesMessages: true,
      secret: nextSecret,
    };
    await uazapiService.configureWebhook(instance.instance_token, webhookBody);

    await pool.query(
      `UPDATE chat_instances
       SET webhook_secret = $1,
           webhook_secret_version = COALESCE(webhook_secret_version, 1) + 1,
           webhook_secret_created_at = COALESCE(webhook_secret_created_at, now()),
           webhook_secret_last_seen_at = now(),
           webhook_needs_reconfiguration = false,
           metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
           updated_at = now()
       WHERE id = $3`,
      [
        nextSecret,
        JSON.stringify({
          webhook_secret: nextSecret,
          webhook_url: callbackUrl,
          webhook_previous_secret_mask: maskSecretForLogs(previousSecret),
          webhook_rotated_at: new Date().toISOString(),
        }),
        id,
      ]
    );

    res.json({
      ok: true,
      instanceId: id,
      callbackUrl,
      secret_mask: maskSecretForLogs(nextSecret),
      previous_secret_mask: maskSecretForLogs(previousSecret),
    });
    logUazChat('info', {
      event_type: 'webhook_rotate_secret',
      tenant_id: tenantId,
      user_id: userId,
      instance_id: id,
      phase: 'completed',
      detail: JSON.stringify({
        previousSecretMask: maskSecretForLogs(previousSecret),
        nextSecretMask: maskSecretForLogs(nextSecret),
      }),
    });
  } catch (error: any) {
    console.error('Error rotating webhook secret:', error);
    res.status(500).json({ error: error.message || 'Failed to rotate webhook secret' });
  }
}

export async function getInstanceStatus(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const instance = await loadInstanceForOperate(userId, id, res);
    if (!instance) return;

    let result: AnyObject;
    try {
      result = (await uazapiService.getInstanceStatus(instance.instance_token)) as AnyObject;
    } catch (apiErr: any) {
      const msg = String(apiErr?.message ?? '');
      const st = apiErr?.status as number | undefined;
      if (
        st === 401 ||
        st === 403 ||
        /invalid token/i.test(msg) ||
        /token inválido/i.test(msg)
      ) {
        const tid = await resolveTenantIdForUser(userId);
        logUazChat('warn', {
          event_type: 'instance_status_uaz_token_invalid',
          tenant_id: tid,
          user_id: userId,
          instance_id: instance.id,
          phase: 'uazapi',
          detail: msg.slice(0, 240),
        });
        res.status(401).json({
          error: 'Invalid token',
          code: 'UAZ_INSTANCE_TOKEN_INVALID',
          hint: 'Gere o QR code novamente (Conectar) para renovar o token na UazAPI.',
        });
        return;
      }
      throw apiErr;
    }
    
    // Atualizar status no banco se mudou
    const instanceData = result?.instance || result;
    const newStatus = instanceData?.state || instanceData?.status || result?.status;
    const connected = result?.connected || instanceData?.connected;
    const loggedIn = result?.loggedIn || instanceData?.loggedIn;
    
    // Extrair informações do perfil conectado da resposta
    const connectedPhone = extractConnectedPhone(result);
    const profileName = extractConnectedProfileName(result);

    const resultInstance = result?.instance && typeof result.instance === 'object' ? result.instance as any : null;
    const instanceDataInstance = instanceData?.instance && typeof instanceData.instance === 'object' ? instanceData.instance as any : null;
    
    const profilePicUrl = 
      result?.profilePicUrl ||
      instanceData?.profilePicUrl ||
      result?.profilePicture ||
      instanceData?.profilePicture ||
      result?.pictureUrl ||
      instanceData?.pictureUrl ||
      result?.profile_pic_url ||
      instanceData?.profile_pic_url ||
      resultInstance?.profilePicUrl ||
      instanceDataInstance?.profilePicUrl ||
      resultInstance?.profile_pic_url ||
      instanceDataInstance?.profile_pic_url ||
      null;
    
    console.log('[GetInstanceStatus] Profile info extraction:', {
      hasResult: !!result,
      hasInstanceData: !!instanceData,
      resultKeys: result ? Object.keys(result) : [],
      instanceDataKeys: instanceData ? Object.keys(instanceData) : [],
      resultInstanceKeys: resultInstance ? Object.keys(resultInstance) : null,
      instanceDataInstanceKeys: instanceDataInstance ? Object.keys(instanceDataInstance) : null,
      resultInstanceProfilePicUrl: resultInstance?.profilePicUrl,
      instanceDataInstanceProfilePicUrl: instanceDataInstance?.profilePicUrl,
      resultInstanceProfile_pic_url: resultInstance?.profile_pic_url,
      instanceDataInstanceProfile_pic_url: instanceDataInstance?.profile_pic_url,
      profilePicUrl,
      profileName,
      connectedPhone,
    });
    
    // Determinar status final
    let finalStatus = instance.status;
    if (newStatus === 'open' || newStatus === 'connected' || connected === true || loggedIn === true) {
      finalStatus = 'connected';
    } else if (newStatus === 'connecting') {
      finalStatus = 'connecting';
    } else if (newStatus) {
      finalStatus = newStatus;
    }
    
    // Preparar metadata atualizado
    const currentMetadata = instance.metadata || {};
    const updatedMetadata: any = {
      ...currentMetadata,
      lastStatusCheck: result,
    };

    // Se encontrou informações do perfil, salvar
    if (connectedPhone) {
      updatedMetadata.connectedPhone = connectedPhone;
      console.log('[GetInstanceStatus] Connected phone found:', connectedPhone);
    }
    if (profileName) {
      updatedMetadata.connectedProfileName = profileName;
      console.log('[GetInstanceStatus] Profile name found:', profileName);
    }
    if (profilePicUrl) {
      updatedMetadata.connectedProfilePicUrl = profilePicUrl;
      console.log('[GetInstanceStatus] Profile picture URL found and saved:', profilePicUrl);
    } else {
      console.log('[GetInstanceStatus] Profile picture URL NOT found. Result structure:', {
        hasResult: !!result,
        hasInstanceData: !!instanceData,
        resultKeys: result ? Object.keys(result) : [],
        instanceDataKeys: instanceData ? Object.keys(instanceData) : [],
        resultInstance: result?.instance ? Object.keys(result.instance) : null,
        instanceDataInstance: instanceData?.instance ? Object.keys(instanceData.instance) : null,
      });
    }
    
    // Normalizar número e gerar phone_key
    let normalizedPhone: string | null = null;
    let phoneKey: string | null = null;
    if (connectedPhone) {
      normalizedPhone = normalizePhoneNumber(connectedPhone);
      if (normalizedPhone) {
        // Gerar chave única: user_id + ':' + normalized_phone
        phoneKey = `${instance.user_id}:${normalizedPhone}`;
        console.log('[GetInstanceStatus] Generated phone_key:', phoneKey);
      }
    }
    
    // Atualizar no banco se mudou status ou número conectado
    if (finalStatus !== instance.status || (connectedPhone && currentMetadata?.connectedPhone !== connectedPhone)) {
      await pool.query(
        `
        UPDATE chat_instances 
        SET status = $1, 
            metadata = $2::jsonb, 
            connected_phone = COALESCE($3, connected_phone),
            phone_key = COALESCE($4, phone_key),
            updated_at = now() 
        WHERE id = $5
        `,
        [finalStatus, JSON.stringify(updatedMetadata), normalizedPhone, phoneKey, instance.id]
      );
      
      // Se mudou para connected, configurar webhook automaticamente
      if (finalStatus === 'connected' && instance.status !== 'connected') {
        const updatedInstance = await pool.query<ChatInstanceRow>(
          'SELECT * FROM chat_instances WHERE id = $1',
          [instance.id]
        );
        if (updatedInstance.rows[0]) {
          console.log('Instance status changed to connected, auto-configuring webhook...');
          await autoConfigureWebhook(updatedInstance.rows[0]);
        }
        /** Primeira vez como conectado: qualquer estado anterior não-ativo dispara sync inicial (idempotência via metadata). */
        const shouldBootstrapPoll =
          instance.status !== 'connected' && instance.status !== 'open';
        if (shouldBootstrapPoll) {
          await scheduleBootstrapSyncIfNeeded(userId, instance.id, 'status_poll_connected');
        }
      }

      // Se phone_key foi gerado, opcionalmente herdar conversas legacy (só com ENV explícita)
      if (phoneKey) {
        inheritConversationsFromPhoneKey(instance.user_id, instance.id, phoneKey)
          .then(count => {
            if (count > 0) {
              console.log(`[GetInstanceStatus] ${count} conversas herdadas automaticamente`);
            }
          })
          .catch(err => {
            console.error('[GetInstanceStatus] Erro ao herdar conversas (não crítico):', err);
          });
      }
    }
    
    res.json(result);
  } catch (error: any) {
    console.error('Error fetching instance status:', error);
    res.status(500).json({ error: error.message || 'Failed to get status' });
  }
}

/** Reagenda sincronização inicial (bootstrap) após falha ou quando o cliente solicita — não duplica se já concluído ou em execução. */
export async function retryInitialInstanceSync(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const instance = await loadInstanceForOperate(userId, id, res);
    if (!instance) return;

    const bs = (instance.metadata as Record<string, unknown> | null)?.bootstrap_sync as
      | { status?: string }
      | undefined;
    const st = bs?.status;
    if (st === 'completed') {
      res.json({ ok: true, skipped: true, reason: 'already_completed' });
      return;
    }
    if (st === 'running' || st === 'queued') {
      res.json({ ok: true, skipped: true, reason: 'already_in_progress' });
      return;
    }

    await scheduleBootstrapSyncIfNeeded(userId, instance.id, 'manual_retry');
    res.json({ ok: true });
  } catch (error: any) {
    console.error('retryInitialInstanceSync:', error);
    res.status(500).json({ error: error.message || 'Failed to retry initial sync' });
  }
}

/** GET /api/chat/runtime-config — flags de UI (sem dados sensíveis). */
export async function getChatRuntimeConfig(_req: AuthRequest, res: Response) {
  res.json({
    whatsappGroupsEnabled: isWhatsappGroupsEnabled(),
  });
}

/** GET /api/chat/tenant-users-for-group — utilizadores do tenant com WhatsApp (Fase 4). */
export async function getChatTenantUsersForGroupInvite(req: AuthRequest, res: Response) {
  try {
    if (!isWhatsappGroupsEnabled()) {
      res.status(404).json({ error: 'Recurso não disponível' });
      return;
    }
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(403).json({ error: 'Empresa não identificada' });
      return;
    }
    const r = await pool.query<{
      id: string;
      email: string;
      whatsapp_digits: string;
      display_name: string;
    }>(
      `
      SELECT u.id::text AS id,
             u.email,
             regexp_replace(COALESCE(u.whatsapp_number, ''), '\\D', '', 'g') AS whatsapp_digits,
             TRIM(CONCAT(COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, ''))) AS display_name
      FROM users u
      LEFT JOIN profiles p ON p.id = u.id
      WHERE u.tenant_id = $1::uuid AND COALESCE(u.is_super_admin, false) = false
      ORDER BY lower(COALESCE(p.first_name, '')), lower(u.email)
      `,
      [tenantId]
    );
    const items = r.rows.map((row) => {
      const w = String(row.whatsapp_digits || '').trim();
      const whatsapp_digits = w.length >= 10 ? w : null;
      const dn = row.display_name?.trim() || row.email?.split('@')[0] || 'Utilizador';
      return {
        id: row.id,
        email: row.email,
        display_name: dn,
        whatsapp_digits,
      };
    });
    res.json({ items });
  } catch (e: any) {
    console.error('[getChatTenantUsersForGroupInvite]', e);
    res.status(500).json({ error: e?.message || 'Erro' });
  }
}

/**
 * POST /api/chat/conversations/:id/group/create-from-conversation
 * Cria grupo WhatsApp (UazAPI) a partir de conversa 1:1.
 */
export async function postChatCreateGroupFromConversation(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const tenantId = req.tenantId ?? null;
  const conversationId = req.params.id;

  const auditFail = async (params: {
    instanceId: string;
    groupJid: string;
    payload: Record<string, unknown>;
    status: number;
    msg: string;
  }) => {
    await insertChatGroupAdminAudit({
      tenantId,
      actorUserId: userId,
      conversationId,
      instanceId: params.instanceId,
      groupJid: params.groupJid,
      action: 'create_group_from_conversation',
      payload: params.payload,
      uazapiStatus: params.status,
      errorMessage: params.msg,
    });
  };

  try {
    if (!isWhatsappGroupsEnabled()) {
      res.status(404).json({ error: 'Recurso não disponível' });
      return;
    }
    if (!(await canChatAction(userId, 'create_group', req))) {
      res.status(403).json({ error: 'Sem permissão para criar grupo pelo chat.' });
      return;
    }

    const parsed = createGroupFromConversationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
      return;
    }
    const body = parsed.data;

    const convRow = await pool.query<{
      id: string;
      instance_id: string;
      external_chat_id: string;
      conversation_type: string;
      provider: string | null;
      phone_number: string | null;
      canonical_phone: string | null;
      contact_name: string | null;
      profile_name: string | null;
      display_name: string | null;
    }>(
      `
      SELECT c.id, c.instance_id, c.external_chat_id, c.conversation_type, c.provider,
             c.phone_number, c.canonical_phone, c.contact_name, c.profile_name, c.display_name
      FROM chat_conversations c
      WHERE c.id = $1::uuid AND ${SQL_CHAT_ACCESS_PREDICATE}
      `,
      [conversationId, userId]
    );
    if (convRow.rowCount === 0) {
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }
    const c = convRow.rows[0];
    const ext = c.external_chat_id?.trim() ?? '';
    const isGroup = c.conversation_type === 'group' || ext.toLowerCase().endsWith('@g.us');
    if (isGroup) {
      res.status(400).json({ error: 'Só é possível criar grupo a partir de conversa individual' });
      return;
    }
    const prov = (c.provider || '').trim() || 'whatsapp_uazapi';
    if (prov === 'whatsapp_official') {
      res.status(400).json({ error: 'Indisponível para WhatsApp Oficial (Meta)' });
      return;
    }

    const instance = await fetchInstanceForOperate(userId, c.instance_id);
    if (!instance) {
      res.status(404).json({ error: 'Instância não encontrada' });
      return;
    }

    const instanceSelf =
      digitsOnlyMsisdn(instance.connected_phone || '') ||
      digitsOnlyMsisdn(instance.phone_key || '') ||
      null;

    const clientMsisdn = resolveConversationPrimaryMsisdn(
      {
        external_chat_id: c.external_chat_id,
        canonical_phone: c.canonical_phone,
        phone_number: c.phone_number,
      },
      instanceSelf
    );
    if (!clientMsisdn) {
      res.status(400).json({
        error:
          'Não foi possível determinar o telefone WhatsApp desta conversa. Verifique o número ou a identidade do contacto.',
      });
      return;
    }

    const fromBody = body.participants.map((p) => p.phone);
    const merged = mergeUniqueParticipantPhones([clientMsisdn, ...fromBody], instanceSelf);
    if (!merged.ok) {
      res.status(400).json({ error: merged.error });
      return;
    }
    if (!merged.list.includes(clientMsisdn)) {
      res.status(500).json({ error: 'Falha ao incluir o contacto da conversa nos participantes' });
      return;
    }
    if (merged.list.length < 1) {
      res.status(400).json({ error: 'É necessário pelo menos um participante' });
      return;
    }

    const dup = await pool.query<{ id: string; external_chat_id: string }>(
      `
      SELECT id::text, external_chat_id
      FROM chat_conversations
      WHERE instance_id = $1::uuid
        AND (conversation_type = 'group' OR external_chat_id ILIKE '%@g.us')
        AND (metadata->>'created_from_conversation_id') = $2
      ORDER BY created_at DESC
      LIMIT 5
      `,
      [c.instance_id, conversationId]
    );
    if ((dup.rowCount ?? 0) > 0 && !body.confirmDuplicate) {
      res.status(409).json({
        code: 'DUPLICATE_GROUP_FROM_CONVERSATION',
        message:
          'Já existe um grupo criado a partir desta conversa. Confirme se deseja criar outro.',
        existing: dup.rows,
      });
      return;
    }

    let rawCreate: unknown;
    try {
      rawCreate = await uazapiService.groupCreate(instance.instance_token, {
        name: body.name.trim(),
        participants: merged.list,
      });
    } catch (e: any) {
      const status = typeof e?.status === 'number' ? e.status : 502;
      const msg = e?.message || 'Falha ao criar grupo no WhatsApp';
      await auditFail({
        instanceId: c.instance_id,
        groupJid: '',
        payload: {
          original_conversation_id: conversationId,
          new_group_conversation_id: null,
          instance_id: c.instance_id,
          participant_count: merged.list.length,
        },
        status,
        msg,
      });
      res.status(status >= 400 && status < 600 ? status : 502).json({
        error: msg,
        details: e?.payload,
      });
      return;
    }

    const g0 = normalizeUazGroupInfo(rawCreate);
    let groupJid = g0.jid?.trim() || '';
    if (!groupJid) {
      await auditFail({
        instanceId: c.instance_id,
        groupJid: '',
        payload: {
          original_conversation_id: conversationId,
          new_group_conversation_id: null,
          instance_id: c.instance_id,
          participant_count: merged.list.length,
        },
        status: 502,
        msg: 'Resposta do WhatsApp sem JID do grupo',
      });
      res.status(502).json({ error: 'Resposta inválida ao criar grupo' });
      return;
    }

    const desc = body.description?.trim();
    if (desc) {
      try {
        await uazapiService.groupUpdateDescription(instance.instance_token, {
          groupjid: groupJid,
          description: desc,
        });
      } catch (descErr: any) {
        console.warn('[postChatCreateGroupFromConversation] updateDescription', descErr?.message);
      }
    }

    const contactLabel =
      c.display_name?.trim() ||
      c.profile_name?.trim() ||
      c.contact_name?.trim() ||
      clientMsisdn;

    const chatData = normalizeChatPayload({
      wa_chatid: groupJid,
      wa_isGroup: true,
      wa_name: body.name.trim(),
      profileName: body.name.trim(),
      contactName: body.name.trim(),
    });
    if (!chatData) {
      await auditFail({
        instanceId: c.instance_id,
        groupJid,
        payload: {
          original_conversation_id: conversationId,
          new_group_conversation_id: null,
          instance_id: c.instance_id,
          participant_count: merged.list.length,
        },
        status: 500,
        msg: 'Falha ao normalizar dados do grupo',
      });
      res.status(500).json({ error: 'Falha interna ao guardar conversa' });
      return;
    }

    const metaBase = (chatData.metadata as Record<string, unknown>) || {};
    chatData.metadata = {
      ...metaBase,
      created_from_conversation_id: conversationId,
      created_from_contact_phone: clientMsisdn,
      created_from_contact_name: contactLabel,
      created_by_user_id: userId,
      created_via: 'chat_create_group',
    };

    const upserted = await upsertConversation(instance as ChatInstanceRow, chatData, {
      communicationContactId: null,
    });
    if (!upserted?.id) {
      await auditFail({
        instanceId: c.instance_id,
        groupJid,
        payload: {
          original_conversation_id: conversationId,
          new_group_conversation_id: null,
          instance_id: c.instance_id,
          participant_count: merged.list.length,
        },
        status: 500,
        msg: 'Falha ao persistir conversa do grupo',
      });
      res.status(500).json({ error: 'Grupo criado no WhatsApp mas falhou ao guardar no painel' });
      return;
    }

    const fresh = await pool.query(
      `SELECT * FROM chat_conversations WHERE id = $1::uuid LIMIT 1`,
      [upserted.id]
    );
    const apiRow = conversationRowForClientApi(fresh.rows[0] as Record<string, unknown>);

    await insertChatGroupAdminAudit({
      tenantId,
      actorUserId: userId,
      conversationId,
      instanceId: c.instance_id,
      groupJid,
      action: 'create_group_from_conversation',
      payload: {
        original_conversation_id: conversationId,
        new_group_conversation_id: upserted.id,
        instance_id: c.instance_id,
        participant_count: merged.list.length,
      },
      uazapiStatus: 200,
      errorMessage: null,
    });

    res.status(201).json({ conversation: apiRow });
  } catch (error: any) {
    console.error('[postChatCreateGroupFromConversation]', error);
    res.status(500).json({ error: error?.message || 'Erro ao criar grupo' });
  }
}

export async function syncConversations(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const data = syncSchema.safeParse(req.body);

    if (!data.success) {
      res.status(400).json({ error: 'Invalid payload', details: data.error.flatten() });
      return;
    }

    const instance = await loadInstanceForOperate(userId, data.data.instanceId, res);
    if (!instance) return;

    const tenantId = await resolveTenantIdForUser(userId);

    const explicitMode = data.data.syncMode != null;
    const effectiveMode = explicitMode
      ? normalizeSyncMode(data.data.syncMode)
      : normalizeSyncMode((instance.metadata as any)?.sync_mode);

    if (effectiveMode === 'none') {
      logUazChat('info', {
        event_type: 'sync_conversations_skipped_none',
        phase: 'manual',
        tenant_id: tenantId,
        user_id: userId,
        instance_id: instance.id,
        detail:
          'sync_mode=none — nada sincronizado. Envie syncMode no body para forçar janela (ex.: full, days_30).',
      });
    res.json({
        total: 0,
        upserted: 0,
        skipped: true,
        reason: 'sync_mode_none',
      });
      return;
    }

    const manualSinceMs = syncModeToMinTimestampMs(effectiveMode);

    logUazChat('info', {
      event_type: 'sync_conversations_http',
      phase: 'start',
      tenant_id: tenantId,
      user_id: userId,
      instance_id: instance.id,
      external_instance_name: instance.external_instance_name,
      trigger: 'manual',
      sync_mode: effectiveMode,
      sync_mode_explicit: explicitMode,
      detail:
        manualSinceMs != null
          ? `janela manual min_iso=${new Date(manualSinceMs).toISOString()}`
          : 'janela manual sem filtro de data (full)',
    });

    const {
      total,
      upserted,
      identityHydrationAttempted,
      identityHydrationUpdated,
      batchMessagesSaved,
      batchConversationsTried,
    } = await performSyncConversationsForInstance(instance, {
      limit: data.data.limit ?? 200,
      filters: data.data.filters,
      tenantId,
      trigger: 'manual',
      eventType: 'sync_conversations_http',
      sinceTimestampMs: manualSinceMs,
      batchSyncRecentMessagesAfterList: true,
    });

    const extraIdentityHydration = await hydrateMissingIdentityFromStoredConversations(instance, 12);

    res.json({
      total,
      upserted,
      syncMode: effectiveMode,
      identityHydrationAttempted,
      identityHydrationUpdated,
      extraIdentityHydrationAttempted: extraIdentityHydration.attempted,
      extraIdentityHydrationUpdated: extraIdentityHydration.updated,
      batchMessagesSaved,
      batchConversationsTried,
    });
  } catch (error: any) {
    logUazChat('error', {
      event_type: 'sync_conversations_http',
      phase: 'error',
      detail: error?.message,
      user_id: req.userId ?? null,
    });
    console.error('Error syncing conversations:', error);
    res.status(500).json({ error: error.message || 'Failed to sync conversations' });
  }
}

/**
 * Foto WhatsApp mais recente vinculada ao cliente/lead (metadata), sem alterar cadastro CRM.
 * GET ?clientId= ou ?leadId=
 */
export async function getCrmWhatsappIdentity(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const clientId = typeof req.query.clientId === 'string' ? req.query.clientId.trim() : '';
    const leadId = typeof req.query.leadId === 'string' ? req.query.leadId.trim() : '';
    if ((clientId && leadId) || (!clientId && !leadId)) {
      res.status(400).json({ error: 'Informe exatamente um parâmetro: clientId ou leadId' });
      return;
    }
    const leadColumnAvailable = await hasLeadIdColumn();
    let metadata: unknown;
    if (clientId) {
      const r = await pool.query<{ metadata: unknown }>(
        `SELECT metadata FROM chat_conversations
         WHERE user_id = $1 AND client_id = $2
         ORDER BY COALESCE(last_message_at, created_at) DESC NULLS LAST
         LIMIT 1`,
        [userId, clientId]
      );
      metadata = r.rows[0]?.metadata;
    } else {
      if (!leadColumnAvailable) {
        res.json({ avatarUrl: null });
        return;
      }
      const r = await pool.query<{ metadata: unknown }>(
        `SELECT metadata FROM chat_conversations
         WHERE user_id = $1 AND lead_id = $2
         ORDER BY COALESCE(last_message_at, created_at) DESC NULLS LAST
         LIMIT 1`,
        [userId, leadId]
      );
      metadata = r.rows[0]?.metadata;
    }
    const meta = (metadata as Record<string, unknown> | null) || {};
    const avatarUrl = extractUazapiChatImageUrl(meta);
    res.json({ avatarUrl: avatarUrl || null });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Failed' });
  }
}

export async function getConversations(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    if (!(await canChatAction(userId, 'view', req))) {
      res.status(403).json({ error: 'Sem permissão para acessar o chat.' });
      return;
    }
    const { instanceId, search, status, startDate, endDate } = req.query;
    const inboxScope = req.query.inboxScope === 'tenant' ? 'tenant' : 'owner';
    const attendanceFilter = typeof req.query.attendanceFilter === 'string' ? req.query.attendanceFilter : '';
    const conversationFilterRaw =
      typeof req.query.conversationFilter === 'string' ? req.query.conversationFilter.trim().toLowerCase() : '';
    const conversationFilter = conversationFilterRaw === 'groups' ? 'groups' : 'all';
    const groupsFeat = isWhatsappGroupsEnabled();
    const diagDeep = String(req.query.diag || '') === '1';
    const logChatList = diagDeep || process.env.CHAT_LIST_LOG === '1';
    const includeWhatsAppOfficial =
      String(req.query.includeWhatsAppOfficial || '') === '1' ||
      String(req.query.includeWhatsAppOfficial || '') === 'true';
    const channelOriginRaw =
      typeof req.query.channelOrigin === 'string' ? req.query.channelOrigin.trim().toLowerCase() : '';
    const channelOrigin =
      channelOriginRaw === 'uazapi' || channelOriginRaw === 'official' ? channelOriginRaw : 'all';

    if (includeWhatsAppOfficial && !canAccessWhatsappOfficialOperationalChat(req)) {
      res.json([]);
      return;
    }

    if (includeWhatsAppOfficial && channelOrigin === 'uazapi') {
      res.json([]);
      return;
    }

    if (
      instanceId &&
      typeof instanceId === 'string' &&
      instanceId.trim() &&
      !includeWhatsAppOfficial
    ) {
      const instOk = await fetchInstanceForOperate(userId, instanceId.trim());
      if (!instOk) {
        res.status(404).json({ error: 'Instância não encontrada ou sem acesso' });
        return;
      }
    }

    const superadminOfficialEnabled =
      Boolean(req.user?.is_super_admin) && isWhatsappOfficialSuperadminEnabled();
    const tenantOfficialEnabled = isWhatsappOfficialTenantEnabled();
    const officialVisibilitySql = `
    AND (
      c.instance_id IS NOT NULL
      OR (
        c.whatsapp_official_account_id IS NOT NULL
        AND (
          (${superadminOfficialEnabled ? 'true' : 'false'}) AND EXISTS (
            SELECT 1 FROM whatsapp_official_accounts wa_vis
            WHERE wa_vis.id = c.whatsapp_official_account_id
              AND wa_vis.owner_scope = 'superadmin'
              AND (wa_vis.inbox_user_id IS NULL OR wa_vis.inbox_user_id = $1::uuid)
          )
          OR
          (${tenantOfficialEnabled ? 'true' : 'false'}) AND EXISTS (
            SELECT 1 FROM whatsapp_official_accounts wa_vis
            INNER JOIN users u_me ON u_me.id = $1::uuid
            WHERE wa_vis.id = c.whatsapp_official_account_id
              AND wa_vis.tenant_id IS NOT NULL
              AND u_me.tenant_id IS NOT NULL
              AND wa_vis.tenant_id = u_me.tenant_id
          )
        )
      )
    )`;

    const params: any[] = [userId];
    let paramIndex = 2;
    const leadColumnAvailable = await hasLeadIdColumn();
    const leadSelect = leadColumnAvailable ? 'c.lead_id' : 'NULL::uuid as lead_id';
    const leadJoinSql = leadColumnAvailable
      ? 'LEFT JOIN leads l ON l.id = c.lead_id AND l.user_id = c.user_id'
      : '';
    const leadAvatarSelect = leadColumnAvailable
      ? `l.whatsapp_avatar_url AS lead_whatsapp_avatar_url,
        l.whatsapp_avatar_cached_url AS lead_whatsapp_avatar_cached_url,`
      : `NULL::text AS lead_whatsapp_avatar_url,
        NULL::text AS lead_whatsapp_avatar_cached_url,`;
    const attendanceCols = await hasAttendanceColumns();
    const teamCols = attendanceCols && (await hasAssignedTeamColumn());
    const slaPhase5Cols = await hasChatPhase5SlaColumns();

    /** Última mensagem real: mensagens locais → colunas da conversa → SLA; nunca updated_at. */
    const messagesMaxAtExpr = `(SELECT MAX(COALESCE(m.sent_at, m.created_at))::timestamptz FROM chat_messages m WHERE m.conversation_id = c.id)`;
    const effectiveLastMessageExpr = slaPhase5Cols
      ? `COALESCE(
          ${messagesMaxAtExpr},
          c.last_message_at,
          GREATEST(c.last_customer_message_at, c.last_agent_message_at)
        )`
      : `COALESCE(
          ${messagesMaxAtExpr},
          c.last_message_at
        )`;

    const attendanceSelectAndJoins = attendanceCols
      ? {
          select: `c.attendance_status,
        c.assigned_to_user_id,
        c.queue_id,
        ${teamCols ? 'c.assigned_team_id,\n        t_chat_team.name AS assigned_team_name,' : 'NULL::uuid AS assigned_team_id,\n        NULL::text AS assigned_team_name,'}
        c.assigned_at,
        c.closed_at,
        c.last_assignment_reason,
        assignee.email AS assignee_email,
        COALESCE(
          NULLIF(TRIM(COALESCE(pf.first_name, '') || ' ' || COALESCE(pf.last_name, '')), ''),
          assignee.email
        ) AS assignee_display,
        COALESCE(
          NULLIF(TRIM(pf.avatar_url), ''),
          NULLIF(TRIM(assignee.avatar_url), '')
        ) AS assignee_avatar_url,`,
          joins: `
      LEFT JOIN users assignee ON assignee.id = c.assigned_to_user_id
      LEFT JOIN profiles pf ON pf.id = assignee.id${teamCols ? '\n      LEFT JOIN teams t_chat_team ON t_chat_team.id = c.assigned_team_id' : ''}`,
        }
      : {
          select: `'pending'::text AS attendance_status,
        NULL::uuid AS assigned_to_user_id,
        NULL::uuid AS queue_id,
        NULL::timestamptz AS assigned_at,
        NULL::timestamptz AS closed_at,
        NULL::text AS last_assignment_reason,
        NULL::text AS assignee_email,
        NULL::text AS assignee_display,
        NULL::text AS assignee_avatar_url,`,
          joins: '',
        };

    // tenant: sempre inclui conversas do próprio utilizador (evita lista vazia se EXISTS falha por
    // tenant_id NULL na BD, legado, ou divergência JWT vs users). Partilha = OR mesmo tenant.
    const whereOwnerOrTenant =
      inboxScope === 'owner'
        ? 'c.user_id = $1'
        : `(
      c.user_id = $1
      OR EXISTS (
        SELECT 1 FROM users u_owner
        INNER JOIN users u_me ON u_me.id = $1
        WHERE u_owner.id = c.user_id
          AND u_owner.tenant_id IS NOT NULL
          AND u_me.tenant_id IS NOT NULL
          AND u_owner.tenant_id = u_me.tenant_id
      )
    )`;

    let query = `
      SELECT
        c.id,
        c.user_id,
        c.instance_id,
        c.provider,
        c.external_chat_id,
        c.conversation_type,
        c.external_fast_id,
        c.contact_name,
        c.profile_name,
        c.phone_number,
        c.display_name,
        c.canonical_phone,
        c.avatar_url,
        c.avatar_cached_url,
        c.avatar_source_url,
        cl.whatsapp_avatar_url AS client_whatsapp_avatar_url,
        cl.whatsapp_avatar_cached_url AS client_whatsapp_avatar_cached_url,
        ${leadAvatarSelect}
        cc_ext.display_name AS communication_display_name,
        cc_ext.profile_avatar_url AS communication_avatar_url,
        cc_ext.communication_avatar_cached_url,
        c.identity_state,
        c.history_sync_status,
        c.last_history_sync_reason,
        c.status,
        c.last_message_preview,
        c.last_message_at,
        ${effectiveLastMessageExpr} AS effective_last_message_at,
        c.unread_count,
        c.metadata,
        c.created_at,
        c.updated_at,
        c.whatsapp_official_account_id,
        ${
          slaPhase5Cols
            ? `c.first_response_at,
        c.last_customer_message_at,
        c.last_agent_message_at,
        `
            : ''
        }c.client_id,
        ${attendanceSelectAndJoins.select}
        ${leadSelect},
        COALESCE(i.name, wa.display_phone_number, wa.verified_name, 'WhatsApp Oficial') as instance_name,
        CASE
          WHEN c.client_id IS NOT NULL THEN 'client_linked'
          WHEN ${leadColumnAvailable ? 'c.lead_id IS NOT NULL' : 'false'} THEN 'lead_linked'
          WHEN COALESCE((c.metadata->>'link_confidence'), '') = 'review' THEN 'review_required'
          ELSE 'unlinked'
        END as link_state,
        COALESCE(c.metadata->>'link_source', 'system') as link_source,
        COALESCE(c.metadata->>'link_confidence', 'review') as link_confidence,
        CASE
          WHEN ${leadColumnAvailable ? 'c.lead_id IS NOT NULL' : 'false'} THEN (
            SELECT l2.status FROM leads l2 WHERE l2.id = c.lead_id AND l2.user_id = c.user_id LIMIT 1
          )
          ELSE NULL
        END as lead_status
      FROM chat_conversations c
      LEFT JOIN chat_instances i ON i.id = c.instance_id
      LEFT JOIN whatsapp_official_accounts wa ON wa.id = c.whatsapp_official_account_id
      LEFT JOIN clients cl ON cl.id = c.client_id AND cl.user_id = c.user_id
      ${leadJoinSql}
      LEFT JOIN LATERAL (
        SELECT cc.display_name, cc.profile_avatar_url, cc.avatar_cached_url AS communication_avatar_cached_url
        FROM communication_contacts cc
        WHERE cc.provider = CASE
          WHEN NULLIF(btrim(c.provider), '') = 'whatsapp_official' THEN 'whatsapp_official'
          ELSE COALESCE(NULLIF(btrim(c.provider), ''), 'whatsapp_uazapi')
        END
          AND cc.tenant_id = (SELECT tenant_id FROM users WHERE id = $1 LIMIT 1)
          AND (
            (c.canonical_chat_id IS NOT NULL AND btrim(c.canonical_chat_id) <> '' AND cc.provider_contact_id = c.canonical_chat_id)
            OR (c.external_chat_id IS NOT NULL AND btrim(c.external_chat_id) <> '' AND cc.provider_contact_id = c.external_chat_id)
            OR (c.canonical_phone IS NOT NULL AND btrim(c.canonical_phone) <> '' AND cc.phone = regexp_replace(c.canonical_phone, '\D', '', 'g'))
            OR (c.phone_number IS NOT NULL AND btrim(c.phone_number) <> '' AND cc.phone = regexp_replace(c.phone_number, '\D', '', 'g'))
          )
        ORDER BY cc.updated_at DESC
        LIMIT 1
      ) cc_ext ON true${attendanceSelectAndJoins.joins}
      WHERE ${whereOwnerOrTenant}
      ${officialVisibilitySql}
    `;

    if (includeWhatsAppOfficial) {
      query += ` AND c.whatsapp_official_account_id IS NOT NULL`;
    }

    if (!includeWhatsAppOfficial && channelOrigin === 'uazapi') {
      query += ` AND c.instance_id IS NOT NULL AND c.whatsapp_official_account_id IS NULL`;
    } else if (!includeWhatsAppOfficial && channelOrigin === 'official') {
      query += ` AND c.whatsapp_official_account_id IS NOT NULL`;
    }

    if (instanceId && typeof instanceId === 'string' && instanceId.trim() && !includeWhatsAppOfficial) {
      params.push(instanceId.trim());
      query += ` AND c.instance_id = $${params.length}`;
      paramIndex++;
    }

    if (!groupsFeat) {
      query += ` AND (COALESCE(c.conversation_type, 'direct') <> 'group' AND c.external_chat_id NOT LIKE '%@g.us')`;
    } else if (conversationFilter === 'groups') {
      query += ` AND (c.conversation_type = 'group' OR c.external_chat_id LIKE '%@g.us')`;
    }

    if (attendanceCols) {
      if (attendanceFilter === 'mine') {
        params.push(userId);
        query += ` AND c.assigned_to_user_id = $${params.length} AND c.attendance_status = 'in_progress'`;
        paramIndex++;
      } else if (attendanceFilter === 'unassigned') {
        query += ` AND c.assigned_to_user_id IS NULL
          AND (c.attendance_status IS NULL OR c.attendance_status IN ('pending', 'open'))
          AND (c.attendance_status IS DISTINCT FROM 'closed')
          AND (c.attendance_status IS DISTINCT FROM 'archived')`;
        if (teamCols) {
          query += ` AND (c.assigned_team_id IS NULL)`;
        }
      } else if (attendanceFilter === 'queue' || attendanceFilter === 'queued') {
        /** Fila geral: sem operador e sem fila de equipe */
        query += ` AND c.assigned_to_user_id IS NULL
          AND (c.attendance_status IS NULL OR c.attendance_status IN ('pending', 'open'))
          AND (c.attendance_status IS DISTINCT FROM 'closed')
          AND (c.attendance_status IS DISTINCT FROM 'archived')`;
        if (teamCols) {
          query += ` AND (c.assigned_team_id IS NULL)`;
        }
      } else if (attendanceFilter === 'waiting' || attendanceFilter === 'waiting_customer') {
        query += ` AND c.attendance_status = 'waiting_customer'`;
      } else if (attendanceFilter === 'closed') {
        query += ` AND c.attendance_status IN ('closed', 'archived')`;
      } else if (attendanceFilter === 'team') {
        /** Equipe: conversas na fila da equipe (transferidas para equipe), visível só a membros */
        if (teamCols) {
          params.push(userId);
          query += ` AND c.assigned_team_id IS NOT NULL
          AND c.assigned_to_user_id IS NULL
          AND (c.attendance_status IS NULL OR c.attendance_status IN ('pending', 'open'))
          AND EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.team_id = c.assigned_team_id AND tm.user_id = $${params.length}
          )`;
          paramIndex++;
        } else {
          query += ` AND FALSE`;
        }
      }
    } else if (attendanceFilter && attendanceFilter.length > 0) {
      console.warn(
        '[GetConversations] attendanceFilter ignorado: migration Etapa 5 não aplicada (sem coluna assigned_to_user_id)'
      );
    }

    if (status && typeof status === 'string') {
      params.push(status);
      query += ` AND c.status = $${params.length}`;
      paramIndex++;
    }

    if (search && typeof search === 'string') {
      params.push(`%${search.toLowerCase()}%`);
      query += ` AND (
        LOWER(COALESCE(c.contact_name, '')) LIKE $${params.length} OR
        LOWER(COALESCE(c.profile_name, '')) LIKE $${params.length} OR
        LOWER(COALESCE(c.phone_number, '')) LIKE $${params.length} OR
        LOWER(COALESCE(c.display_name, '')) LIKE $${params.length} OR
        LOWER(COALESCE(c.canonical_phone, '')) LIKE $${params.length}
      )`;
    }

    // Filtros de data
    if (startDate && typeof startDate === 'string') {
      params.push(new Date(startDate));
      query += ` AND (COALESCE(c.last_message_at, c.created_at) >= $${params.length})`;
      paramIndex++;
    }

    if (endDate && typeof endDate === 'string') {
      params.push(new Date(endDate));
      query += ` AND (COALESCE(c.last_message_at, c.created_at) <= $${params.length})`;
      paramIndex++;
    }

    if (attendanceCols) {
      const viewAll = await canChatAction(userId, 'view_all', req);
      if (!viewAll) {
        if (teamCols) {
          query += ` AND (
          c.assigned_to_user_id = $1
          OR (
            c.assigned_team_id IS NOT NULL
            AND EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = c.assigned_team_id AND tm.user_id = $1)
          )
          OR (
            c.assigned_to_user_id IS NULL
            AND (c.attendance_status IS NULL OR c.attendance_status NOT IN ('closed', 'archived'))
          )
        )`;
        } else {
          query += ` AND (
          c.assigned_to_user_id = $1
          OR (
            c.assigned_to_user_id IS NULL
            AND (c.attendance_status IS NULL OR c.attendance_status NOT IN ('closed', 'archived'))
          )
        )`;
        }
      }
    }

    query += ` ORDER BY
      CASE WHEN (${effectiveLastMessageExpr}) IS NULL THEN 1 ELSE 0 END ASC,
      (${effectiveLastMessageExpr}) DESC NULLS LAST,
      c.created_at DESC NULLS LAST
      LIMIT 200`;

    console.log('[GetConversations] Querying conversations', {
      userId,
      instanceId,
      search: search || 'none',
      queryParams: params,
    });

    const conversations = await pool.query(query, params);

    const rowsForClient = conversations.rows.map((r: Record<string, unknown>) => {
      const displayName = resolveCommunicationDisplayIdentity({
        communicationDisplayName:
          (typeof r.communication_display_name === 'string' && r.communication_display_name.trim())
            ? r.communication_display_name
            : null,
        providerName:
          (typeof r.display_name === 'string' && r.display_name.trim())
            ? r.display_name
            : (typeof r.contact_name === 'string' && r.contact_name.trim())
              ? r.contact_name
              : (typeof r.profile_name === 'string' && r.profile_name.trim())
                ? r.profile_name
                : null,
        phone:
          (typeof r.phone_number === 'string' && r.phone_number.trim())
            ? r.phone_number
            : (typeof r.canonical_phone === 'string' && r.canonical_phone.trim())
              ? r.canonical_phone
              : null,
      });

      return conversationRowForClientApi({
        ...r,
        display_name: displayName,
      });
    });

    const chatMediaDebug =
      process.env.CHAT_MEDIA_DEBUG === '1' || process.env.CHAT_MEDIA_DEBUG === 'true';
    if (chatMediaDebug && rowsForClient.length > 0) {
      const sample = rowsForClient[0] as Record<string, unknown>;
      console.log('[CHAT_MEDIA_DEBUG]', {
        event: 'chat_avatar_resolution_sample',
        conversationId: sample.id,
        avatar_url: sample.avatar_url,
        communication_avatar_url: sample.communication_avatar_url,
      });
    }

    if (isChatAvatarDebugEnabled() && rowsForClient.length > 0) {
      let rowsWithAvatar = 0;
      let rowsWhatsappHost = 0;
      const samples: Array<{ id: unknown; host: string | null; prefix: string }> = [];
      for (const row of rowsForClient) {
        const rec = row as Record<string, unknown>;
        const a = rec.avatar_url;
        if (typeof a === 'string' && a.trim()) {
          rowsWithAvatar += 1;
          try {
            const host = new URL(a).hostname.toLowerCase();
            if (host === 'whatsapp.net' || host.endsWith('.whatsapp.net')) {
              rowsWhatsappHost += 1;
            }
            if (samples.length < 5 && (host.includes('whatsapp') || a.length > 0)) {
              samples.push({
                id: rec.id,
                host,
                prefix: a.length > 100 ? `${a.slice(0, 100)}…` : a,
              });
            }
          } catch {
            if (samples.length < 5) {
              samples.push({ id: rec.id, host: null, prefix: '(unparseable url)' });
            }
          }
        }
      }
      chatAvatarDebugLog('getConversations_api_payload', {
        rowCount: rowsForClient.length,
        rowsWithAvatarUrl: rowsWithAvatar,
        rowsAvatarHostWhatsappNet: rowsWhatsappHost,
        sampleRows: samples,
        note: 'Frontend ainda pode anular whatsapp.net em chatAvatarUrlForImgSrc (sem proxy).',
      });
    }

    const tenantRow = await pool.query<{ tenant_id: string | null }>(
      'SELECT tenant_id FROM users WHERE id = $1',
      [userId]
    );
    const dbTenantId = tenantRow.rows[0]?.tenant_id ?? null;

    if (logChatList) {
      console.log('[ChatListDiag] getConversations result', {
        userId,
        reqTenantId: req.tenantId ?? null,
        dbTenantId,
        attendanceColumnsInDb: attendanceCols,
        instanceId: instanceId ?? null,
        inboxScope,
        attendanceFilter: attendanceFilter || '(none)',
        search: typeof search === 'string' ? search : null,
        status: typeof status === 'string' ? status : null,
        finalRowCount: conversations.rowCount,
        whereSnippet: inboxScope === 'owner' ? 'owner:c.user_id=$1' : 'tenant:c.user_id=$1 OR EXISTS(tenant peers)',
      });
    }

    if (diagDeep && instanceId && typeof instanceId === 'string') {
      const raw = await pool.connect();
      try {
        await raw.query("SET LOCAL app.bypass_rls = '1'");
        const baseTotal = await raw.query<{ n: string }>(
          `SELECT COUNT(*)::text AS n FROM chat_conversations WHERE instance_id = $1`,
          [instanceId]
        );
        const forOwnerUser = await raw.query<{ n: string }>(
          `SELECT COUNT(*)::text AS n FROM chat_conversations WHERE instance_id = $1 AND user_id = $2`,
          [instanceId, userId]
        );
        const tenantPeerSql = `
          SELECT COUNT(*)::text AS n FROM chat_conversations c
          WHERE c.instance_id = $1
            AND EXISTS (
              SELECT 1 FROM users u_owner
              INNER JOIN users u_me ON u_me.id = $2
              WHERE u_owner.id = c.user_id
                AND u_owner.tenant_id IS NOT NULL
                AND u_me.tenant_id IS NOT NULL
                AND u_owner.tenant_id = u_me.tenant_id
            )`;
        const tenantScopeSim = await raw.query<{ n: string }>(tenantPeerSql, [instanceId, userId]);
        const ownerScopeSim = await raw.query<{ n: string }>(
          `SELECT COUNT(*)::text AS n FROM chat_conversations c WHERE c.instance_id = $1 AND c.user_id = $2`,
          [instanceId, userId]
        );
        let attendance_null = 0;
        let attendance_unassigned = 0;
        let assigned_to_user_id_null = 0;
        if (attendanceCols) {
          const nullAtt = await raw.query<{ n: string }>(
            `SELECT COUNT(*)::text AS n FROM chat_conversations c
           WHERE c.instance_id = $1 AND c.attendance_status IS NULL`,
            [instanceId]
          );
          const unassignedAtt = await raw.query<{ n: string }>(
            `SELECT COUNT(*)::text AS n FROM chat_conversations c
           WHERE c.instance_id = $1 AND c.attendance_status = 'pending'`,
            [instanceId]
          );
          const nullAssignee = await raw.query<{ n: string }>(
            `SELECT COUNT(*)::text AS n FROM chat_conversations c
           WHERE c.instance_id = $1 AND c.assigned_to_user_id IS NULL`,
            [instanceId]
          );
          attendance_null = Number(nullAtt.rows[0]?.n ?? 0);
          attendance_unassigned = Number(unassignedAtt.rows[0]?.n ?? 0);
          assigned_to_user_id_null = Number(nullAssignee.rows[0]?.n ?? 0);
        }
        const convOwnerNullTenant = await raw.query<{ n: string }>(
          `SELECT COUNT(*)::text AS n
           FROM chat_conversations c
           INNER JOIN users u ON u.id = c.user_id
           WHERE c.instance_id = $1 AND u.tenant_id IS NULL`,
          [instanceId]
        );
        console.log('[ChatListDiag] bypass_counts (RLS off)', {
          instanceId,
          attendance_columns: attendanceCols,
          base_total_for_instance: Number(baseTotal.rows[0]?.n ?? 0),
          owner_scope_total: Number(ownerScopeSim.rows[0]?.n ?? 0),
          tenant_scope_total_sim: Number(tenantScopeSim.rows[0]?.n ?? 0),
          attendance_null,
          attendance_unassigned,
          assigned_to_user_id_null,
          conversations_whose_owner_has_null_tenant_id: Number(convOwnerNullTenant.rows[0]?.n ?? 0),
          for_owner_user_id: Number(forOwnerUser.rows[0]?.n ?? 0),
          final_after_app_filters: conversations.rowCount,
        });
      } finally {
        raw.release();
      }
    }
    
    console.log('[GetConversations] Query result', {
      userId,
      instanceId,
      totalFound: conversations.rowCount,
      conversationIds: conversations.rows.slice(0, 10).map(c => c.id),
      sampleConversations: conversations.rows.slice(0, 3).map(c => ({
        id: c.id,
        external_chat_id: c.external_chat_id,
        contact_name: c.contact_name,
        instance_id: c.instance_id,
        user_id: c.user_id,
        last_message_at: c.last_message_at,
      })),
    });

    // Verificar se há conversas no banco para este usuário mas não retornadas
    if (conversations.rowCount === 0 && instanceId) {
      const allConversationsCheck = await pool.query(
        'SELECT id, user_id, instance_id, external_chat_id, contact_name FROM chat_conversations WHERE instance_id = $1 LIMIT 5',
        [instanceId]
      );
      console.log('[GetConversations] Debug: Conversations in DB for this instance', {
        instanceId,
        found: allConversationsCheck.rowCount,
        conversations: allConversationsCheck.rows.map(c => ({
          id: c.id,
          userId: c.user_id,
          requestedUserId: userId,
          userIdMatch: c.user_id === userId,
          instanceId: c.instance_id,
          externalChatId: c.external_chat_id,
          contactName: c.contact_name,
        })),
      });
    }

    if (rowsForClient.length > 0) {
      const tenantForTags = dbTenantId;
      if (tenantForTags) {
        const allTagIds = new Set<string>();
        const convToTagIds = new Map<string, string[]>();
        for (const row of rowsForClient) {
          const rec = row as Record<string, unknown>;
          const ids = readKanbanTagIdsFromConversationMetadata(rec.metadata);
          convToTagIds.set(String(rec.id), ids);
          ids.forEach((id) => allTagIds.add(id));
        }
        if (allTagIds.size > 0) {
          const idList = [...allTagIds];
          const tr = await pool.query<{ id: string; label: string; color: string | null }>(
            `SELECT id::text, label, color FROM chat_kanban_tags WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
            [tenantForTags, idList],
          );
          const byId = new Map(tr.rows.map((x) => [x.id, x]));
          for (const row of rowsForClient) {
            const rec = row as Record<string, unknown>;
            const ids = convToTagIds.get(String(rec.id)) ?? [];
            const tags = ids
              .map((id) => {
                const t = byId.get(id);
                if (!t) return null;
                const color = t.color?.trim() || DEFAULT_KANBAN_TAG_COLOR_UI;
                return { id, label: t.label, name: t.label, color };
              })
              .filter((x): x is { id: string; label: string; name: string; color: string } => Boolean(x));
            rec.tags = tags;
          }
        } else {
          for (const row of rowsForClient) {
            (row as Record<string, unknown>).tags = [];
          }
        }
      } else {
        for (const row of rowsForClient) {
          (row as Record<string, unknown>).tags = [];
        }
      }
    }

    res.json(rowsForClient);
  } catch (error: any) {
    console.error('[GetConversations] Error fetching conversations:', {
      error: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
      position: error.position,
      stack: error.stack,
      userId: req.userId,
      instanceId: req.query.instanceId,
    });
    res.status(500).json({ 
      error: 'Failed to fetch conversations',
      message: error.message,
      detail: error.detail,
    });
  }
}

/** Contagens por filtro de atendimento + não lidas (mesmo escopo inbox/instance que a listagem). */
export async function getConversationAttendanceCounts(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const inboxScope = req.query.inboxScope === 'tenant' ? 'tenant' : 'owner';
    const raw = req.query.instanceIds ?? req.query.instanceId;
    let instanceIds: string[] = [];
    if (typeof raw === 'string') {
      instanceIds = raw.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (Array.isArray(raw)) {
      instanceIds = raw.flatMap((s) => String(s).split(',')).map((s) => s.trim()).filter(Boolean);
    }
    if (instanceIds.length === 0) {
      res.status(400).json({ error: 'Informe instanceIds (UUIDs separados por vírgula)' });
      return;
    }

    const attendanceCols = await hasAttendanceColumns();
    const teamCols = attendanceCols && (await hasAssignedTeamColumn());
    const whereOwnerOrTenant =
      inboxScope === 'owner'
        ? 'c.user_id = $1'
        : `(
      c.user_id = $1
      OR EXISTS (
        SELECT 1 FROM users u_owner
        INNER JOIN users u_me ON u_me.id = $1
        WHERE u_owner.id = c.user_id
          AND u_owner.tenant_id IS NOT NULL
          AND u_me.tenant_id IS NOT NULL
          AND u_owner.tenant_id = u_me.tenant_id
      )
    )`;

    const params: unknown[] = [userId, instanceIds];
    const groupsHiddenSql = isWhatsappGroupsEnabled()
      ? ''
      : ` AND (COALESCE(c.conversation_type, 'direct') <> 'group' AND c.external_chat_id NOT LIKE '%@g.us')`;

    let selectCounts: string;
    if (attendanceCols) {
      const queueTeamExcl = teamCols
        ? `AND (c.assigned_team_id IS NULL)`
        : '';
      const unassTeamExcl = teamCols
        ? `AND (c.assigned_team_id IS NULL)`
        : '';
      const teamInboxCount = teamCols
        ? `COUNT(*) FILTER (
        WHERE c.assigned_team_id IS NOT NULL
          AND c.assigned_to_user_id IS NULL
          AND (c.attendance_status IS NULL OR c.attendance_status IN ('pending', 'open'))
          AND EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.team_id = c.assigned_team_id AND tm.user_id = $1
          )
      )::int AS team,`
        : `0::int AS team,`;
      selectCounts = `
      COUNT(*) FILTER (
        WHERE c.assigned_to_user_id IS NULL
          ${queueTeamExcl}
          AND (c.attendance_status IS NULL OR c.attendance_status IN ('pending', 'open'))
          AND (c.attendance_status IS DISTINCT FROM 'closed')
      )::int AS queue,
      COUNT(*) FILTER (
        WHERE c.assigned_to_user_id = $1 AND c.attendance_status = 'in_progress'
      )::int AS mine,
      ${teamInboxCount}
      COUNT(*) FILTER (
        WHERE c.assigned_to_user_id IS NULL
          ${unassTeamExcl}
          AND (c.attendance_status IS NULL OR c.attendance_status IN ('pending', 'open'))
          AND (c.attendance_status IS DISTINCT FROM 'closed')
          AND (c.attendance_status IS DISTINCT FROM 'archived')
      )::int AS unassigned,
      COUNT(*) FILTER (WHERE c.attendance_status IN ('closed', 'archived'))::int AS closed,
      `;
    } else {
      selectCounts = `
      0::int AS queue,
      0::int AS mine,
      0::int AS team,
      0::int AS unassigned,
      0::int AS closed,
      `;
    }

    const q = `
      SELECT
        ${selectCounts}
        COUNT(*) FILTER (WHERE COALESCE(c.unread_count, 0) > 0)::int AS unread
      FROM chat_conversations c
      INNER JOIN chat_instances i ON i.id = c.instance_id
      WHERE ${whereOwnerOrTenant}
        AND c.instance_id = ANY($2::uuid[])${groupsHiddenSql}
    `;

    const r = await pool.query<{
      queue: number;
      mine: number;
      team: number;
      unassigned: number;
      closed: number;
      unread: number;
    }>(q, params);

    const row = r.rows[0];
    res.json({
      queue: row?.queue ?? 0,
      mine: row?.mine ?? 0,
      team: row?.team ?? 0,
      unassigned: row?.unassigned ?? 0,
      closed: row?.closed ?? 0,
      unread: row?.unread ?? 0,
    });
  } catch (e: any) {
    console.error('[getConversationAttendanceCounts]', e);
    res.status(500).json({ error: e.message || 'Falha ao contar filtros' });
  }
}

export async function getConversationMessages(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const conversation = await pool.query<{
      id: string;
      external_chat_id: string;
      conversation_type: string | null;
    }>(
      `SELECT c.id, c.external_chat_id, c.conversation_type FROM chat_conversations c WHERE c.id = $1 AND ${SQL_CHAT_ACCESS_PREDICATE}`,
      [id, userId]
    );
    if (conversation.rowCount === 0) {
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }
    const convOpen = conversation.rows[0];
    const isGroupOpen =
      convOpen.conversation_type === 'group' || convOpen.external_chat_id?.endsWith('@g.us');
    if (isGroupOpen && isWhatsappGroupsEnabled()) {
      console.log('[chat-group-open]', {
        conversation_id: id,
        external_chat_id: convOpen.external_chat_id,
      });
    }
    const tenantId = req.tenantId ?? null;
    scheduleConversationAvatarAutoRecache({
      conversationId: id,
      userId,
      tenantId,
      trigger: 'open_conversation',
    });

    const messages = await pool.query(
      `
        SELECT m.*,
        (
          SELECT COUNT(*)::int
          FROM chat_message_comments cmc
          WHERE cmc.message_id = m.id AND cmc.deleted_at IS NULL
        ) AS internal_comment_count,
        (
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'id', c.id,
                'author_user_id', c.author_user_id,
                'comment_text', c.comment_text,
                'created_at', c.created_at,
                'author_email', au.email,
                'author_display', COALESCE(
                  NULLIF(trim(concat_ws(' ', pr.first_name, pr.last_name)), ''),
                  split_part(au.email, '@', 1)
                )
              )
              ORDER BY c.created_at ASC
            ),
            '[]'::json
          )
          FROM chat_message_comments c
          INNER JOIN users au ON au.id = c.author_user_id
          LEFT JOIN profiles pr ON pr.id = au.id
          WHERE c.message_id = m.id AND c.deleted_at IS NULL
        ) AS internal_comments
        FROM chat_messages m
        INNER JOIN chat_conversations c ON c.id = m.conversation_id
        INNER JOIN users actor ON actor.id = $2
        WHERE m.conversation_id = $1
          AND ${SQL_CHAT_ACCESS_PREDICATE}
          AND (
            c.user_id = actor.id
            OR (
              actor.tenant_id IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM users conv_owner
                WHERE conv_owner.id = c.user_id AND conv_owner.tenant_id = actor.tenant_id
              )
            )
          )
        ORDER BY m.sent_at DESC NULLS LAST, m.created_at DESC
        LIMIT 200
      `,
      [id, userId]
    );

    const ordered = messages.rows.reverse().map((row: any) => ({
      ...row,
      message_contract: contractFromDbRow(row),
    }));

    if (process.env.CHAT_MESSAGES_DEBUG === '1') {
      for (const r of ordered) {
        const m = r.media;
        const len = Array.isArray(m) ? m.length : typeof m === 'string' ? m.length : 0;
        if (r.message_contract?.kind === 'image' || len > 0) {
          logUazChat('info', {
            event_type: 'get_conversation_messages_debug',
            conversation_id: id,
            message_id: r.id,
            contract_kind: r.message_contract?.kind ?? null,
            media_array_len: Array.isArray(m) ? m.length : null,
            media_col_type: m == null ? 'null' : Array.isArray(m) ? 'array' : typeof m,
            first_url_len:
              Array.isArray(m) && m[0]?.url && typeof m[0].url === 'string' ? m[0].url.length : null,
            body_len: typeof r.body === 'string' ? r.body.length : 0,
          });
        }
      }
    }

    res.json(ordered);
  } catch (error: any) {
    console.error('Error fetching conversation messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
}

/**
 * Busca o perfil completo (cliente ou lead) vinculado a uma conversa
 * GET /api/chat/conversations/:id/profile
 */
export async function getConversationProfile(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const tenantId = req.tenantId ?? null;
    const leadColumnAvailable = await hasLeadIdColumn();
    /** Mesmo predicado que getConversations / inbox partilhado (não só c.user_id = ator). */
    const conversationResult = await pool.query<{
      id: string;
      client_id: string | null;
      lead_id?: string | null;
      phone_number: string | null;
      metadata: Record<string, unknown> | null;
    }>(
      `
      SELECT c.id, c.client_id,
             ${leadColumnAvailable ? 'c.lead_id,' : ''}
             c.phone_number, c.metadata
      FROM chat_conversations c
      WHERE c.id = $1 AND ${SQL_CHAT_ACCESS_PREDICATE}
      `,
      [id, userId]
    );

    if (conversationResult.rowCount === 0) {
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }
    scheduleConversationAvatarAutoRecache({
      conversationId: id,
      userId,
      tenantId,
      trigger: 'open_conversation',
    });

    const conversation = conversationResult.rows[0];
    let clientId = conversation.client_id ?? null;
    let leadId = leadColumnAvailable ? (conversation.lead_id ?? null) : null;

    // Hardening: GET não deve mutar vínculo. Migração lead->cliente ocorre por função explícita de domínio.

    /** CRM: dono do registo OU mesmo tenant que o utilizador (equipa). */
    const crmActorScopeSql = (table: 'clients' | 'leads') => `
      SELECT t.*
      FROM ${table} t
      INNER JOIN users owner ON owner.id = t.user_id
      INNER JOIN users actor ON actor.id = $2
      WHERE t.id = $1
        AND (
          t.user_id = $2
          OR (
            owner.tenant_id IS NOT NULL
            AND actor.tenant_id IS NOT NULL
            AND owner.tenant_id = actor.tenant_id
          )
        )
    `;

    // Priorizar cliente sobre lead
    if (clientId) {
      const clientResult = await pool.query(crmActorScopeSql('clients'), [clientId, userId]);
      if ((clientResult.rowCount ?? 0) > 0) {
        res.json({
          type: 'client',
          profile: clientResult.rows[0],
        });
        return;
      }
    }

    if (leadId) {
      const leadResult = await pool.query(crmActorScopeSql('leads'), [leadId, userId]);
      if ((leadResult.rowCount ?? 0) > 0) {
        res.json({
          type: 'lead',
          profile: leadResult.rows[0],
        });
        return;
      }
    }

    // Se não encontrou cliente nem lead, retornar null
    res.json({
      type: null,
      profile: null,
    });
  } catch (error: any) {
    console.error('Error fetching conversation profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
}

export async function linkConversation(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    const { id: conversationId } = req.params;
    const body = linkConversationSchema.parse(req.body);
    const leadColumnAvailable = await hasLeadIdColumn();

    const conv = await pool.query<{
      id: string;
      user_id: string;
      metadata: Record<string, unknown> | null;
    }>(
      `SELECT id, user_id, metadata FROM chat_conversations WHERE id = $1 AND user_id IN (
         SELECT id FROM users WHERE tenant_id = $2
       ) LIMIT 1`,
      [conversationId, tenantId]
    );
    if ((conv.rowCount ?? 0) === 0) {
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }
    const currentMeta = (conv.rows[0].metadata as Record<string, unknown> | null) ?? {};

    if (body.type === 'client') {
      const client = await pool.query<{ id: string }>(
        `SELECT c.id
         FROM clients c
         INNER JOIN users u ON u.id = c.user_id
         WHERE c.id = $1 AND u.tenant_id = $2
         LIMIT 1`,
        [body.id, tenantId]
      );
      if ((client.rowCount ?? 0) === 0) {
        res.status(404).json({ error: 'Cliente não encontrado para esta empresa' });
        return;
      }
      await pool.query(
        `
        UPDATE chat_conversations
        SET client_id = $1,
            ${leadColumnAvailable ? 'lead_id = NULL,' : ''}
            metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
            updated_at = now()
        WHERE id = $3
          AND user_id IN (SELECT id FROM users WHERE tenant_id = $4)
        `,
        [
          body.id,
          JSON.stringify({
            ...currentMeta,
            link_source: 'manual',
            link_confidence: 'manual',
            link_state: 'client_linked',
            link_manual_at: new Date().toISOString(),
            link_manual_by: userId,
          }),
          conversationId,
          tenantId,
        ]
      );
      await createClientTimelineEvent({
        tenantId,
        clientId: body.id,
        eventName: 'chat_link_manual',
        source: 'chat',
        actorType: 'user',
        actorId: userId,
        referenceType: 'chat_conversation',
        referenceId: conversationId,
        eventKey: `chat_link_manual:${conversationId}:${body.id}`,
        metadata: {
          link_source: 'manual',
        },
      });
    } else {
      if (!leadColumnAvailable) {
        res.status(400).json({ error: 'Ambiente sem suporte a vínculo com lead nesta versão do schema' });
        return;
      }
      const lead = await pool.query<{ id: string }>(
        `SELECT l.id
         FROM leads l
         INNER JOIN users u ON u.id = l.user_id
         WHERE l.id = $1 AND u.tenant_id = $2
         LIMIT 1`,
        [body.id, tenantId]
      );
      if ((lead.rowCount ?? 0) === 0) {
        res.status(404).json({ error: 'Lead não encontrado para esta empresa' });
        return;
      }
      await pool.query(
        `
        UPDATE chat_conversations
        SET lead_id = $1,
            client_id = NULL,
            metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
            updated_at = now()
        WHERE id = $3
          AND user_id IN (SELECT id FROM users WHERE tenant_id = $4)
        `,
        [
          body.id,
          JSON.stringify({
            ...currentMeta,
            link_source: 'manual',
            link_confidence: 'manual',
            link_state: 'lead_linked',
            link_manual_at: new Date().toISOString(),
            link_manual_by: userId,
          }),
          conversationId,
          tenantId,
        ]
      );
    }

    let updatedRow: Record<string, unknown> | undefined;
    {
      const updated = await pool.query(`SELECT * FROM chat_conversations WHERE id = $1 LIMIT 1`, [conversationId]);
      updatedRow = updated.rows[0] as Record<string, unknown> | undefined;
    }
    if (updatedRow && tenantId) {
      await ensureConversationAvatarCachedAndReplicateToCrm({
        conversationId,
        userId,
        tenantId,
      });
      const refreshed = await pool.query(`SELECT * FROM chat_conversations WHERE id = $1 LIMIT 1`, [conversationId]);
      updatedRow = refreshed.rows[0] as Record<string, unknown> | undefined;
    }
    if (updatedRow) {
      await upsertCommunicationContactFromProvider({
        tenantId,
        provider: 'whatsapp_uazapi',
        providerContactId: deriveProviderContactIdFromConversation(updatedRow),
        phone:
          typeof updatedRow.canonical_phone === 'string'
            ? updatedRow.canonical_phone
            : (updatedRow.phone_number as string | null | undefined) ?? null,
        displayName:
          (updatedRow.display_name as string | null | undefined) ??
          (updatedRow.contact_name as string | null | undefined) ??
          (updatedRow.profile_name as string | null | undefined) ??
          null,
        profileAvatarUrl: (updatedRow.avatar_url as string | null | undefined) ?? null,
        linkedClientId:
          body.type === 'client'
            ? body.id
            : ((updatedRow.client_id as string | null | undefined) ?? null),
        linkedLeadId:
          body.type === 'lead'
            ? body.id
            : ((updatedRow.lead_id as string | null | undefined) ?? null),
        rawProfile:
          updatedRow.metadata && typeof updatedRow.metadata === 'object'
            ? (updatedRow.metadata as Record<string, unknown>)
            : null,
      });
    }
    void applyKanbanAutomationForConversation({
      tenantId,
      actorUserId: userId,
      conversationId,
      reason: body.type === 'lead' ? 'lead_linked' : 'client_linked',
    }).catch((err) => console.error('[kanban-entry-automation] manual link', err));
    res.json(updatedRow ?? null);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Payload inválido', details: error.errors });
      return;
    }
    console.error('Error linking conversation:', error);
    res.status(500).json({ error: 'Falha ao vincular conversa' });
  }
}

export async function unlinkConversation(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    const { id: conversationId } = req.params;
    const leadColumnAvailable = await hasLeadIdColumn();

    const conv = await pool.query<{ metadata: Record<string, unknown> | null }>(
      `SELECT metadata FROM chat_conversations
       WHERE id = $1
         AND user_id IN (SELECT id FROM users WHERE tenant_id = $2)
       LIMIT 1`,
      [conversationId, tenantId]
    );
    if ((conv.rowCount ?? 0) === 0) {
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }
    const currentMeta = (conv.rows[0].metadata as Record<string, unknown> | null) ?? {};
    await pool.query(
      `
      UPDATE chat_conversations
      SET client_id = NULL,
          ${leadColumnAvailable ? 'lead_id = NULL,' : ''}
          metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
          updated_at = now()
      WHERE id = $2
        AND user_id IN (SELECT id FROM users WHERE tenant_id = $3)
      `,
      [
        JSON.stringify({
          ...currentMeta,
          link_source: 'manual',
          link_confidence: 'manual',
          link_state: 'unlinked',
          link_unlinked_at: new Date().toISOString(),
          link_unlinked_by: userId,
        }),
        conversationId,
        tenantId,
      ]
    );
    let updatedRow: Record<string, unknown> | undefined;
    {
    const updated = await pool.query(`SELECT * FROM chat_conversations WHERE id = $1 LIMIT 1`, [conversationId]);
      updatedRow = updated.rows[0] as Record<string, unknown> | undefined;
    }
    if (updatedRow && tenantId) {
      await ensureConversationAvatarCachedAndReplicateToCrm({
        conversationId,
        userId,
        tenantId,
      });
      const refreshed = await pool.query(`SELECT * FROM chat_conversations WHERE id = $1 LIMIT 1`, [conversationId]);
      updatedRow = refreshed.rows[0] as Record<string, unknown> | undefined;
    }
    if (updatedRow) {
      await upsertCommunicationContactFromProvider({
        tenantId,
        provider: 'whatsapp_uazapi',
        providerContactId: deriveProviderContactIdFromConversation(updatedRow),
        phone:
          typeof updatedRow.canonical_phone === 'string'
            ? updatedRow.canonical_phone
            : (updatedRow.phone_number as string | null | undefined) ?? null,
        displayName:
          (updatedRow.display_name as string | null | undefined) ??
          (updatedRow.contact_name as string | null | undefined) ??
          (updatedRow.profile_name as string | null | undefined) ??
          null,
        profileAvatarUrl: (updatedRow.avatar_url as string | null | undefined) ?? null,
        rawProfile:
          updatedRow.metadata && typeof updatedRow.metadata === 'object'
            ? (updatedRow.metadata as Record<string, unknown>)
            : null,
      });
    }
    res.json(updatedRow ?? null);
  } catch (error: any) {
    console.error('Error unlinking conversation:', error);
    res.status(500).json({ error: 'Falha ao remover vínculo da conversa' });
  }
}

export async function systemDeleteConversation(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  const tenantId = req.tenantId ?? null;
  if (!tenantId) {
    res.status(401).json({ error: 'Empresa não identificada' });
    return;
  }

  const canDelete =
    (await canChatAction(userId, 'delete', req)) ||
    (await canChatAction(userId, 'manage_queues', req));
  if (!canDelete) {
    res.status(403).json({ error: 'Sem permissão para deletar conversas do sistema' });
    return;
  }

  const { id: conversationId } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const convResult = await client.query<{
      id: string;
      user_id: string;
      instance_id: string | null;
      external_chat_id: string | null;
      client_id: string | null;
      lead_id: string | null;
      provider: string | null;
      owner_tenant_id: string | null;
      instance_owner_tenant_id: string | null;
    }>(
      `
      SELECT
        c.id,
        c.user_id,
        c.instance_id,
        c.external_chat_id,
        c.client_id,
        c.lead_id,
        c.provider,
        owner.tenant_id AS owner_tenant_id,
        inst_owner.tenant_id AS instance_owner_tenant_id
      FROM chat_conversations c
      INNER JOIN users owner ON owner.id = c.user_id
      LEFT JOIN chat_instances i ON i.id = c.instance_id
      LEFT JOIN users inst_owner ON inst_owner.id = i.user_id
      WHERE c.id = $1::uuid
        AND ${SQL_CHAT_ACCESS_PREDICATE}
      FOR UPDATE OF c
      `,
      [conversationId, userId]
    );

    if ((convResult.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }

    const conversation = convResult.rows[0];
    if (conversation.owner_tenant_id !== tenantId) {
      await client.query('ROLLBACK');
      res.status(403).json({ error: 'Conversa pertence a outra empresa' });
      return;
    }
    if (conversation.instance_id && conversation.instance_owner_tenant_id !== tenantId) {
      await client.query('ROLLBACK');
      res.status(403).json({ error: 'Instância da conversa pertence a outra empresa' });
      return;
    }

    const messageRows = await client.query<{ id: string }>(
      `SELECT id FROM chat_messages WHERE conversation_id = $1::uuid`,
      [conversationId]
    );
    const messageIds = messageRows.rows.map((row) => row.id);
    const deletedMessagesCount = messageIds.length;

    const hasTable = async (schemaQualifiedName: string): Promise<boolean> => {
      const r = await client.query<{ exists: boolean }>(
        `SELECT to_regclass($1) IS NOT NULL AS exists`,
        [schemaQualifiedName]
      );
      return r.rows[0]?.exists === true;
    };

    if (await hasTable('public.media_assets')) {
      if (messageIds.length > 0) {
        await client.query(
          `
          DELETE FROM public.media_assets
          WHERE owner_type IN ('chat_message', 'chat-message', 'chat.messages', 'chat_message_media')
            AND owner_id = ANY($1::uuid[])
          `,
          [messageIds]
        );
      }
      await client.query(
        `
        DELETE FROM public.media_assets
        WHERE owner_type IN ('chat_conversation', 'chat-conversation', 'chat.conversations')
          AND owner_id = $1::uuid
        `,
        [conversationId]
      );
    }

    await client.query(
      `
      DELETE FROM notifications
      WHERE COALESCE(data->>'conversation_id', data->>'conversationId') = $1
      `,
      [conversationId]
    );

    if (await hasTable('public.crm_notes')) {
      await client.query(`DELETE FROM public.crm_notes WHERE conversation_id = $1::uuid`, [conversationId]);
    }
    if (await hasTable('public.client_timeline_events')) {
      await client.query(
        `
        DELETE FROM public.client_timeline_events
        WHERE tenant_id = $2::uuid
          AND (
            (reference_type = 'chat_conversation' AND reference_id::text = $1)
            OR metadata->>'conversation_id' = $1
            OR metadata->>'conversationId' = $1
          )
        `,
        [conversationId, tenantId]
      );
    }

    await client.query(`DELETE FROM chat_messages WHERE conversation_id = $1::uuid`, [conversationId]);
    await client.query(`DELETE FROM chat_conversations WHERE id = $1::uuid`, [conversationId]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.chat_conversation_system_delete_audit (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
        actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
        conversation_id UUID NOT NULL,
        external_chat_id TEXT,
        linked_client_id UUID,
        linked_lead_id UUID,
        deleted_messages_count INTEGER NOT NULL DEFAULT 0,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await client.query(
      `
      INSERT INTO public.chat_conversation_system_delete_audit (
        tenant_id,
        actor_user_id,
        conversation_id,
        external_chat_id,
        linked_client_id,
        linked_lead_id,
        deleted_messages_count,
        payload
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6::uuid, $7, $8::jsonb)
      `,
      [
        tenantId,
        userId,
        conversation.id,
        conversation.external_chat_id,
        conversation.client_id,
        conversation.lead_id,
        deletedMessagesCount,
        JSON.stringify({
          event: 'chat_conversation_deleted',
          provider: conversation.provider ?? 'whatsapp_uazapi',
          external_chat_id: conversation.external_chat_id,
          deleted_at: new Date().toISOString(),
        }),
      ]
    );

    await client.query('COMMIT');

    const payload = {
      id: conversation.id,
      conversation_id: conversation.id,
      external_chat_id: conversation.external_chat_id,
    };
    try {
      emitConversationDeletedToTenant(tenantId, payload);
      emitToTenant(tenantId, 'conversation.deleted', {
        v: 1,
        type: 'conversation.deleted',
        conversation_id: conversation.id,
        id: conversation.id,
        external_chat_id: conversation.external_chat_id,
        ts: new Date().toISOString(),
      });
    } catch (eventError) {
      console.warn('[chat.system_delete] Falha ao emitir realtime', eventError);
    }

    res.json({
      ok: true,
      conversation_id: conversation.id,
      deleted_messages_count: deletedMessagesCount,
    });
  } catch (error: any) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* noop */
    }
    if (error?.code === '22P02') {
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }
    console.error('[chat.system_delete] error', error);
    res.status(500).json({ error: 'Falha ao deletar conversa do sistema' });
  } finally {
    client.release();
  }
}

/**
 * Busca todas as mensagens de conversas vinculadas a um cliente
 * GET /api/chat/clients/:id/messages
 */
export async function getClientMessages(req: AuthRequest, res: Response) {
  const userId = req.userId!;
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(403).json({ error: 'Empresa não identificada' });
      return;
    }

    const { id: clientId } = req.params;

    // Cliente deve existir e pertencer ao tenant (colaborativo: qualquer usuário do tenant).
    const clientResult = await pool.query(
      `SELECT c.id FROM clients c
       INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1
       WHERE c.id = $2`,
      [tenantId, clientId]
    );

    if ((clientResult.rowCount ?? 0) === 0) {
      res.status(404).json({ error: 'Cliente não encontrado' });
      return;
    }

    // Conversas de qualquer usuário do mesmo tenant vinculadas a este cliente.
    const conversationsResult = await pool.query(
      `
      SELECT
        c.id,
        c.phone_number,
        c.contact_name,
        c.profile_name,
        c.external_chat_id
      FROM chat_conversations c
      INNER JOIN users cu ON cu.id = c.user_id AND cu.tenant_id = $1
      WHERE c.client_id = $2
      `,
      [tenantId, clientId]
    );

    if ((conversationsResult.rowCount ?? 0) === 0) {
      res.json({
        messages: [],
        conversationId: null,
        conversationIds: [],
      });
      return;
    }

    const conversationIds = conversationsResult.rows.map((row) => row.id);

    // Buscar todas as mensagens dessas conversas
    // Usar ANY com array UUID para melhor performance
    const messagesResult = await pool.query(
      `
      SELECT 
        m.id,
        m.conversation_id,
        m.direction,
        m.external_message_id,
        m.body,
        m.media,
        m.status,
        m.sent_at,
        m.metadata,
        m.created_at,
        c.phone_number,
        c.contact_name,
        c.profile_name,
        c.external_chat_id,
        c.instance_id
      FROM chat_messages m
      INNER JOIN chat_conversations c ON c.id = m.conversation_id
      WHERE m.conversation_id = ANY($1::uuid[])
      ORDER BY m.sent_at DESC NULLS LAST, m.created_at DESC
      LIMIT 500
      `,
      [conversationIds]
    );

    // Retornar mensagens e também a primeira conversation_id encontrada para facilitar envio
    const firstConversationId = conversationIds.length > 0 ? conversationIds[0] : null;

    const rows = messagesResult.rows.reverse().map((row: any) => ({
      ...row,
      message_contract: contractFromDbRow(row),
    }));
    
    res.json({
      messages: rows,
      conversationId: firstConversationId,
      conversationIds: conversationIds,
    });
  } catch (error: any) {
    console.error('Error fetching client messages:', {
      error: error.message,
      code: error.code,
      detail: error.detail,
      stack: error.stack,
      clientId: req.params.id,
      userId,
      tenantId: req.tenantId,
    });
    res.status(500).json({ 
      error: 'Failed to fetch messages',
      message: error.message,
      detail: error.detail,
    });
  }
}

/**
 * POST /chat/find (wa_chatid) + opcional GET/POST contacts + upsert local.
 * Contacts só quando necessário (@lid sem PN ou nomes fracos) — evita agenda completa a cada sync.
 */
export async function fetchAndUpsertRemoteChatIdentity(
  instance: ChatInstanceRow,
  externalChatId: string,
  opts?: {
    contactCatalog?: Map<string, UazContactCatalogEntry>;
    /** true: ignora `metadata.last_identity_sync_at` (sync manual, botão “atualizar perfil”, hidratação de lacunas). */
    forceRefresh?: boolean;
    telemetry?: RemoteIdentityTelemetry;
    /** true: não corre matching CRM (cliente/lead) — ex.: sync de participante a partir do grupo. */
    skipCrmAutoLink?: boolean;
  }
): Promise<AnyObject | null> {
  const telemetry = opts?.telemetry;

  const bumpContacts = () => {
    if (telemetry) telemetry.contacts_called += 1;
  };
  const bumpChatFind = () => {
    if (telemetry) telemetry.chat_find_called += 1;
  };

  if (!opts?.forceRefresh) {
    const cooldownRow = await pool.query<{ metadata: Record<string, unknown> | null }>(
      `SELECT metadata FROM chat_conversations WHERE instance_id = $1 AND external_chat_id = $2 LIMIT 1`,
      [instance.id, externalChatId]
    );
    const cmeta = cooldownRow.rows[0]?.metadata;
    const last =
      cmeta && typeof cmeta.last_identity_sync_at === 'string' ? cmeta.last_identity_sync_at : null;
    if (last && Date.now() - Date.parse(last) < IDENTITY_REMOTE_FETCH_COOLDOWN_MS) {
      if (telemetry) telemetry.skipped_cooldown = true;
      const tenantIdCd = await resolveTenantIdForUser(instance.user_id);
      logUazChat('info', {
        event_type: 'identity_fetch_skipped_cooldown',
        tenant_id: tenantIdCd,
        user_id: instance.user_id,
        instance_id: instance.id,
        external_chat_id: externalChatId,
        detail: `within_${IDENTITY_REMOTE_FETCH_COOLDOWN_MS}ms`,
      });
      return null;
    }
  }

  bumpChatFind();
  const remoteChats = (await uazapiService.findChats(instance.instance_token, {
    wa_chatid: externalChatId,
    limit: 20,
    sort: '-wa_lastMsgTimestamp',
  })) as AnyObject;

  const chatsArray =
    (Array.isArray(remoteChats?.chats) && remoteChats?.chats) ||
    (Array.isArray(remoteChats?.data?.chats) && remoteChats?.data?.chats) ||
    (Array.isArray(remoteChats?.results) && remoteChats?.results) ||
    (Array.isArray(remoteChats?.data) && remoteChats?.data) ||
    (Array.isArray(remoteChats) ? remoteChats : []);

  let item: any = null;
  for (const ch of chatsArray) {
    const n = normalizeChatPayload(ch);
    if (n && n.externalChatId === externalChatId) {
      item = ch;
      break;
    }
  }
  if (!item) {
    return null;
  }
  const normalized = normalizeChatPayload(item);
  if (!normalized) {
    return null;
  }

  let catalog = opts?.contactCatalog;
  const catalogPreloaded = catalog != null && catalog.size > 0;

  if (!catalogPreloaded) {
    if (
      shouldLoadContactCatalogForIdentityEnrichment({
        externalChatId,
        contactName: normalized.contactName,
        profileName: normalized.profileName,
        phoneNumber: normalized.phoneNumber,
        metadata: normalized.metadata,
      })
    ) {
      bumpContacts();
      try {
        catalog = await fetchUazContactCatalogMap(instance.instance_token);
      } catch {
        catalog = new Map();
      }
    } else {
      catalog = new Map();
    }
  }

  enrichNormalizedChatFromContactCatalog(normalized, catalog ?? new Map());

  const prevMeta =
    normalized.metadata && typeof normalized.metadata === 'object' && !Array.isArray(normalized.metadata)
      ? { ...(normalized.metadata as Record<string, unknown>) }
      : {};
  prevMeta.last_identity_sync_at = new Date().toISOString();
  normalized.metadata = prevMeta;

  const tenantId = await resolveTenantIdForUser(instance.user_id);
  const ccId = await syncCommunicationContactFromNormalized(tenantId, normalized);
  const upserted = (await upsertConversation(instance, normalized, {
    communicationContactId: ccId,
    skipCrmAutoLink: opts?.skipCrmAutoLink === true,
  })) as AnyObject | null;
  if (upserted) {
    const metaForLog =
      normalized.metadata && typeof normalized.metadata === 'object' && !Array.isArray(normalized.metadata)
        ? (normalized.metadata as Record<string, unknown>)
        : {};
    void logChatAvatarSyncResult({
      conversationId: String(upserted.id),
      tenantId,
      normalizedMetadata: metaForLog,
      upsertedRow: upserted as Record<string, unknown>,
    }).catch(() => {});
  }
  return upserted;
}

async function hydrateMissingIdentityFromStoredConversations(
  instance: ChatInstanceRow,
  limit = 15
): Promise<{ attempted: number; updated: number }> {
  const q = await pool.query<{ external_chat_id: string }>(
    `SELECT c.external_chat_id
     FROM chat_conversations c
     WHERE c.instance_id = $1
       AND (
         c.display_name IS NULL OR btrim(c.display_name) = ''
         OR c.avatar_url IS NULL OR btrim(c.avatar_url) = ''
       )
     ORDER BY COALESCE(
       (SELECT MAX(COALESCE(m.sent_at, m.created_at)) FROM chat_messages m WHERE m.conversation_id = c.id),
       c.last_message_at,
       c.created_at
     ) DESC NULLS LAST
     LIMIT $2`,
    [instance.id, limit]
  );

  let updated = 0;
  for (const row of q.rows) {
    const before = await pool.query<{ display_name: string | null; avatar_url: string | null }>(
      `SELECT display_name, avatar_url
       FROM chat_conversations
       WHERE instance_id = $1 AND external_chat_id = $2
       LIMIT 1`,
      [instance.id, row.external_chat_id]
    );
    const prevDisplay = before.rows[0]?.display_name ?? null;
    const prevAvatar = before.rows[0]?.avatar_url ?? null;

    await fetchAndUpsertRemoteChatIdentity(instance, row.external_chat_id, { forceRefresh: true });

    const after = await pool.query<{ display_name: string | null; avatar_url: string | null }>(
      `SELECT display_name, avatar_url
       FROM chat_conversations
       WHERE instance_id = $1 AND external_chat_id = $2
       LIMIT 1`,
      [instance.id, row.external_chat_id]
    );
    const nextDisplay = after.rows[0]?.display_name ?? null;
    const nextAvatar = after.rows[0]?.avatar_url ?? null;

    if ((nextDisplay && nextDisplay !== prevDisplay) || (nextAvatar && nextAvatar !== prevAvatar)) {
      updated += 1;
    }
  }

  return { attempted: q.rows.length, updated };
}

export async function syncConversationMessages(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const payload = syncMessagesSchema.safeParse(req.body || {});

    if (!payload.success) {
      res.status(400).json({ error: 'Invalid payload', details: payload.error.flatten() });
      return;
    }

    const conversationResult = await pool.query(
      `
        SELECT c.*, i.instance_token, i.metadata AS instance_metadata
        FROM chat_conversations c
        INNER JOIN chat_instances i ON i.id = c.instance_id
        WHERE c.id = $1 AND ${SQL_CHAT_ACCESS_PREDICATE}
      `,
      [id, userId]
    );

    if (conversationResult.rowCount === 0) {
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }

    const conversation = conversationResult.rows[0];
    const instMeta = (conversation as any).instance_metadata as Record<string, unknown> | undefined;
    const fullHistory = payload.data.fullHistory === true;
    const explicitMsgMode = payload.data.syncMode != null;
    const explicitModeNorm = explicitMsgMode ? normalizeSyncMode(payload.data.syncMode) : null;
    const effectiveMsgMode =
      explicitModeNorm != null
        ? explicitModeNorm
        : fullHistory
          ? normalizeSyncMode(instMeta?.sync_mode)
          : 'days_30';
    /** Janela “pesada”: flag explícita ou syncMode full no body (ex.: Kanban). */
    const treatAsDeepHistory = fullHistory || effectiveMsgMode === 'full';

    if (effectiveMsgMode === 'none') {
      logUazChat('info', {
        event_type: 'sync_messages_skipped_none',
        phase: 'manual',
        user_id: userId,
        instance_id: conversation.instance_id,
        conversation_id: conversation.id,
        detail:
          'sync_mode=none — use syncMode no body para forçar (ex.: full).',
      });
      res.json({
        synced: 0,
        totalReturned: 0,
        skipped: true,
        reason: 'sync_mode_none',
        pagination: null,
      });
      return;
    }

    const msgMinTs = syncModeToMinTimestampMs(effectiveMsgMode);

    const tenantId = await resolveTenantIdForUser(userId);

    const rawLimitRequested =
      payload.data.limit ??
      (treatAsDeepHistory ? BOOTSTRAP_MSG_LIMIT : MANUAL_LIGHT_SYNC_MSG_CAP);
    const msgCapUpper = treatAsDeepHistory ? BOOTSTRAP_MSG_LIMIT : MANUAL_LIGHT_SYNC_MSG_CAP;
    const effectiveHttpLimit = Math.min(
      msgCapUpper,
      Math.min(BOOTSTRAP_MSG_LIMIT, Math.min(UAZ_MESSAGE_FIND_MAX_LIMIT, Math.max(1, rawLimitRequested)))
    );

    const forceSync = payload.data.force === true;
    const syncTriggerSource = forceSync ? 'sync_forced_manual' : 'http_auto';

    const convMeta = (conversation.metadata as Record<string, unknown>) || {};
    const lastAtStr =
      typeof convMeta._last_messages_sync_http_at === 'string'
        ? convMeta._last_messages_sync_http_at
        : null;
    const lastLim = convMeta._last_messages_sync_http_limit;
    const lastLimit =
      typeof lastLim === 'number'
        ? lastLim
        : typeof lastLim === 'string'
          ? parseInt(lastLim, 10)
          : null;

    if (!forceSync) {
      const lockTs = conversationMessageSyncInFlight.get(conversation.id);
      if (
        lockTs != null &&
        Date.now() - lockTs < MESSAGE_SYNC_IN_FLIGHT_LOCK_MS
      ) {
        logUazChat('info', {
          event_type: 'sync_messages_http',
          phase: 'sync_skipped_lock',
          tenant_id: tenantId,
          user_id: userId,
          instance_id: conversation.instance_id,
          conversation_id: conversation.id,
          sync_trigger_source: syncTriggerSource,
          detail: `within_${MESSAGE_SYNC_IN_FLIGHT_LOCK_MS}ms_in_flight`,
        });
        res.json({
          synced: 0,
          totalReturned: 0,
          skipped: true,
          reason: 'sync_skipped_lock',
          sync_trigger_source: syncTriggerSource,
          syncMode: effectiveMsgMode,
          pagination: null,
        });
        return;
      }

      const lastHistRaw = (conversation as { last_history_sync_at?: string | Date | null })
        .last_history_sync_at;
      const lastHistMs =
        lastHistRaw != null ? Date.parse(String(lastHistRaw)) : NaN;
      if (
        conversation.history_sync_status === 'synced' &&
        conversation.identity_state === 'resolved' &&
        conversation.canonical_chat_id &&
        !Number.isNaN(lastHistMs) &&
        Date.now() - lastHistMs < MESSAGE_SYNC_RECENT_FULL_SKIP_MS
      ) {
        logUazChat('info', {
          event_type: 'sync_messages_http',
          phase: 'sync_skipped_recent',
          tenant_id: tenantId,
          user_id: userId,
          instance_id: conversation.instance_id,
          conversation_id: conversation.id,
          sync_trigger_source: syncTriggerSource,
          detail: `history_sync_status=synced within_${MESSAGE_SYNC_RECENT_FULL_SKIP_MS}ms`,
        });
        res.json({
          synced: 0,
          totalReturned: 0,
          skipped: true,
          reason: 'sync_skipped_recent',
          sync_trigger_source: syncTriggerSource,
          syncMode: effectiveMsgMode,
          pagination: null,
        });
        return;
      }
    } else {
      logUazChat('info', {
        event_type: 'sync_messages_http',
        phase: 'sync_forced_manual',
        tenant_id: tenantId,
        user_id: userId,
        instance_id: conversation.instance_id,
        conversation_id: conversation.id,
        sync_trigger_source: syncTriggerSource,
        detail: 'force=true',
      });
    }

    if (
      lastAtStr &&
      lastLimit === effectiveHttpLimit &&
      !Number.isNaN(Date.parse(lastAtStr)) &&
      Date.now() - Date.parse(lastAtStr) < MESSAGE_SYNC_HTTP_DEBOUNCE_MS &&
      !forceSync
    ) {
      logUazChat('info', {
        event_type: 'sync_messages_http',
        phase: 'debounced',
        tenant_id: tenantId,
        user_id: userId,
        instance_id: conversation.instance_id,
        conversation_id: conversation.id,
        sync_trigger_source: syncTriggerSource,
        detail: `within_${MESSAGE_SYNC_HTTP_DEBOUNCE_MS}ms_same_limit=${effectiveHttpLimit}`,
      });
      res.json({
        synced: 0,
        totalReturned: 0,
        skipped: true,
        reason: 'debounce',
        sync_trigger_source: syncTriggerSource,
        syncMode: effectiveMsgMode,
        pagination: null,
      });
      return;
    }

    logUazChat('info', {
      event_type: 'sync_messages_http',
      phase: 'start',
      tenant_id: tenantId,
      user_id: userId,
      instance_id: conversation.instance_id,
      conversation_id: conversation.id,
      external_chat_id: conversation.external_chat_id,
      trigger: 'manual',
      sync_mode: effectiveMsgMode,
      sync_trigger_source: syncTriggerSource,
      detail:
        (msgMinTs != null
          ? `corte de mensagens min_iso=${new Date(msgMinTs).toISOString()} (app-side); `
          : 'sem corte por data (full); ') +
        `limit_requested=${rawLimitRequested} effective=${effectiveHttpLimit}`,
    });

    conversationMessageSyncInFlight.set(conversation.id, Date.now());
    let performResult: Awaited<
      ReturnType<typeof performSyncConversationMessagesForConversation>
    >;
    try {
      performResult = await performSyncConversationMessagesForConversation(
        {
          id: conversation.id,
          external_chat_id: conversation.external_chat_id,
          instance_id: conversation.instance_id,
          instance_token: conversation.instance_token,
        },
        userId,
        {
          limit: effectiveHttpLimit,
          before: payload.data.before,
          after: payload.data.after,
          tenantId,
          trigger: 'manual',
          eventType: 'sync_messages_http',
          minTimestampMs: msgMinTs,
          force: forceSync,
          syncTriggerSource,
        }
      );
    } finally {
      conversationMessageSyncInFlight.delete(conversation.id);
    }

    const {
      synced: saved,
      totalReturned,
      messagesResponse,
      history_sync_blocked,
      history_sync_reason,
      identity_refresh_skipped,
      skipped_existing_remote,
    } = performResult;

    if (history_sync_blocked) {
      res.json({
        synced: 0,
        totalReturned: 0,
        skipped: true,
        reason: 'unresolved_identity',
        history_sync_reason: history_sync_reason ?? null,
        syncMode: effectiveMsgMode,
        sync_trigger_source: syncTriggerSource,
        pagination: null,
        chat_sync_summary: performResult.chat_sync_summary ?? null,
      });
      return;
    }

    await pool.query(
      `UPDATE chat_conversations
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
           updated_at = now()
       WHERE id = $2
         AND EXISTS (
           SELECT 1 FROM chat_conversations c
           WHERE c.id = $2
             AND ${sqlChatAccessPredicate('$3')}
         )`,
      [
        JSON.stringify({
          _last_messages_sync_http_at: new Date().toISOString(),
          _last_messages_sync_http_limit: effectiveHttpLimit,
        }),
        conversation.id,
        userId,
      ]
    );

    const convFresh = await pool.query(
      `SELECT c.*, i.name AS instance_name
       FROM chat_conversations c
       INNER JOIN chat_instances i ON i.id = c.instance_id
       WHERE c.id = $1 AND ${SQL_CHAT_ACCESS_PREDICATE}`,
      [conversation.id, userId]
    );
    const conversationOut =
      convFresh.rows[0] != null
        ? conversationRowForClientApi(convFresh.rows[0] as Record<string, unknown>)
        : undefined;

    await attemptConversationAvatarAutoRecache({
      conversationId: conversation.id,
      userId,
      tenantId,
      trigger: 'manual_sync',
      force: forceSync,
    });

    res.json({
      synced: saved,
      totalReturned,
      syncMode: effectiveMsgMode,
      skipped: false,
      sync_trigger_source: syncTriggerSource,
      identity_refresh_skipped: identity_refresh_skipped === true,
      skipped_existing_remote: skipped_existing_remote ?? 0,
      conversation: conversationOut,
      chat_sync_summary: performResult.chat_sync_summary ?? null,
      pagination: {
        returnedMessages: messagesResponse?.returnedMessages,
        limit: messagesResponse?.limit,
        offset: messagesResponse?.offset,
        nextOffset: messagesResponse?.nextOffset,
        hasMore: messagesResponse?.hasMore,
      },
    });
  } catch (error: any) {
    logUazChat('error', {
      event_type: 'sync_messages_http',
      phase: 'error',
      detail: error?.message,
      user_id: req.userId ?? null,
    });
    console.error('Error syncing messages:', error);
    res.status(500).json({ error: error.message || 'Failed to sync messages' });
  }
}

/**
 * Busca na UazAPI o chat pelo wa_chatid e reaplica upsert (nome, foto, metadata) sem sincronizar mensagens.
 */
export async function refreshConversationIdentity(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const convRow = await pool.query<{ external_chat_id: string; instance_id: string }>(
      `SELECT c.external_chat_id, c.instance_id FROM chat_conversations c WHERE c.id = $1 AND ${SQL_CHAT_ACCESS_PREDICATE}`,
      [id, userId]
    );
    if (convRow.rowCount === 0) {
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }

    const { external_chat_id: externalChatId, instance_id: instanceId } = convRow.rows[0]!;
    const instance = await loadInstanceForOperate(userId, instanceId, res);
    if (!instance) return;

    const upserted = await fetchAndUpsertRemoteChatIdentity(instance, externalChatId, {
      forceRefresh: true,
    });
    if (!upserted) {
      res.json({ ok: true, updated: false, reason: 'no_remote_chat' });
      return;
    }

    const tenantId = req.tenantId ?? (await resolveTenantIdForUser(userId));
    await attemptConversationAvatarAutoRecache({
      conversationId: id,
      userId,
      tenantId,
      trigger: 'identity_refresh',
      force: true,
    });

    res.json({ ok: true, updated: true, conversation: upserted });
  } catch (error: any) {
    console.error('Error refreshing conversation identity:', error);
    res.status(500).json({ error: error.message || 'Failed to refresh conversation identity' });
  }
}

/**
 * Resposta de `/send/text` e `/send/media` varia; sem id persistido a busca
 * `external_message_id = null` não encontra linha e o WebSocket não emite a mensagem.
 */
function extractUazOutgoingMessageId(res: AnyObject | null | undefined): string | null {
  if (!res || typeof res !== 'object') return null;
  const o = res as Record<string, any>;
  const pick = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return (
    pick(o.id) ||
    pick(o.messageId) ||
    pick(o.message_id) ||
    (o.key && pick(o.key.id)) ||
    (o.message && pick(o.message.id)) ||
    (o.message && o.message.key && pick(o.message.key.id)) ||
    (o.data && pick(o.data.id)) ||
    (o.response && pick(o.response.id)) ||
    (o.response && o.response.key && pick(o.response.key.id)) ||
    null
  );
}

/** OpenAPI: `number` internacional; JID 1:1 costuma ir sem sufixo. Grupos mantêm `@g.us`. */
function toUazRecipientNumber(phone: string | null | undefined, externalChatId: string | null | undefined): string {
  const raw = String(phone || externalChatId || '').trim();
  if (!raw) return raw;
  if (raw.endsWith('@g.us') || raw.endsWith('@broadcast')) return raw;
  if (raw.endsWith('@s.whatsapp.net')) return raw.replace(/@s\.whatsapp\.net$/i, '');
  if (raw.endsWith('@c.us')) return raw.replace(/@c\.us$/i, '');
  return raw;
}

function normalizeLeadPhoneToWhatsappDigits(raw: unknown): string | null {
  let digits = digitsOnlyMsisdn(String(raw ?? ''));
  while (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('5555') && digits.length > 13) {
    digits = digits.slice(2);
  }
  if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
    digits = `55${digits}`;
  }
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

function whatsappDirectJidFromDigits(digits: string): string {
  return `${digits}@s.whatsapp.net`;
}

async function findLeadConversationForManualStart(params: {
  tenantId: string;
  leadId: string;
  instanceId: string;
  digits: string;
  jid: string;
}): Promise<AnyObject | null> {
  const candidates = [
    params.jid.toLowerCase(),
    params.jid.replace(/@s\.whatsapp\.net$/i, '@c.us').toLowerCase(),
    params.digits,
  ];

  const r = await pool.query(
    `
    SELECT c.*
    FROM chat_conversations c
    INNER JOIN users owner ON owner.id = c.user_id
    WHERE owner.tenant_id = $1
      AND COALESCE(c.conversation_type, 'direct') = 'direct'
      AND (
        c.lead_id = $2::uuid
        OR (
          c.instance_id = $3::uuid
          AND (
            lower(c.external_chat_id) = ANY($4::text[])
            OR lower(COALESCE(c.canonical_chat_id, '')) = ANY($4::text[])
            OR lower(COALESCE(c.provider_conversation_id, '')) = ANY($4::text[])
            OR NULLIF(regexp_replace(COALESCE(c.phone_number, ''), '[^0-9]', '', 'g'), '') = $5
            OR NULLIF(regexp_replace(COALESCE(c.canonical_phone, ''), '[^0-9]', '', 'g'), '') = $5
          )
        )
      )
    ORDER BY
      CASE WHEN c.lead_id = $2::uuid THEN 0 ELSE 1 END,
      COALESCE(c.last_message_at, c.created_at) DESC NULLS LAST
    LIMIT 1
    `,
    [params.tenantId, params.leadId, params.instanceId, candidates, params.digits]
  );
  return (r.rows[0] as AnyObject | undefined) ?? null;
}

async function ensureLeadConversationForManualStart(params: {
  actorUserId: string;
  tenantId: string;
  lead: AnyObject;
  instance: ChatInstanceRow;
  digits: string;
  jid: string;
  messagePreview?: string;
}): Promise<{ conversationId: string; reused: boolean; isNew: boolean }> {
  const found = await findLeadConversationForManualStart({
    tenantId: params.tenantId,
    leadId: params.lead.id,
    instanceId: params.instance.id,
    digits: params.digits,
    jid: params.jid,
  });

  if (found?.id) {
    if (!found.lead_id && !found.client_id) {
      await pool.query(
        `
        UPDATE chat_conversations
        SET lead_id = $1::uuid,
            metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
            updated_at = now()
        WHERE id = $3::uuid
        `,
        [
          params.lead.id,
          JSON.stringify({
            link_source: 'manual',
            link_confidence: 'manual',
            link_state: 'lead_linked',
            manual_start_linked_at: new Date().toISOString(),
          }),
          found.id,
        ]
      );
      void applyKanbanAutomationForConversation({
        tenantId: params.tenantId,
        actorUserId: params.actorUserId,
        conversationId: String(found.id),
        reason: 'lead_linked',
      }).catch((err) => console.error('[kanban-entry-automation] lead_linked (manual start)', err));
    }
    return { conversationId: String(found.id), reused: true, isNew: false };
  }

  const leadName = String(params.lead.name || '').trim() || params.digits;
  const metadata = {
    source: 'outbound/manual_start',
    link_source: 'manual',
    link_confidence: 'manual',
    link_state: 'lead_linked',
    phone_normalized: params.digits,
    created_by_manual_start_at: new Date().toISOString(),
    ...(params.messagePreview ? { first_message_preview: params.messagePreview.slice(0, 160) } : {}),
    // TODO timeline: registrar lead_conversation_started quando houver timeline de lead.
  };
  const displayName = leadName;
  const inserted = await pool.query(
    `
    INSERT INTO chat_conversations (
      user_id, instance_id, external_chat_id, contact_name, profile_name, phone_number,
      status, last_message_at, unread_count, metadata, client_id, lead_id,
      canonical_chat_id, canonical_phone, display_name, identity_source, identity_strength,
      identity_state, history_sync_status, last_history_sync_reason, provider,
      provider_conversation_id, conversation_type, attendance_status
    )
    VALUES (
      $1, $2, $3, $4, $4, $5,
      'open', NULL, 0, $6::jsonb, NULL, $7,
      $3, $5, $4, 'phone_derived', 'medium',
      'resolved', 'ready', 'manual_start',
      'whatsapp_uazapi', $3, 'direct', $8
    )
    RETURNING *
    `,
    [
      params.instance.user_id,
      params.instance.id,
      params.jid,
      displayName,
      params.digits,
      JSON.stringify(metadata),
      params.lead.id,
      normalizeAttendanceStatusForDb(undefined),
    ]
  );

  const conversationId = String(inserted.rows[0].id);
  void applyKanbanAutomationForConversation({
    tenantId: params.tenantId,
    actorUserId: params.actorUserId,
    conversationId,
    reason: 'lead_linked',
  }).catch((err) => console.error('[kanban-entry-automation] lead_linked (manual start insert)', err));
  return { conversationId, reused: false, isNew: true };
}

async function findClientConversationForManualStart(params: {
  tenantId: string;
  clientId: string;
  instanceId: string;
  digits: string;
  jid: string;
}): Promise<AnyObject | null> {
  const candidates = [
    params.jid.toLowerCase(),
    params.jid.replace(/@s\.whatsapp\.net$/i, '@c.us').toLowerCase(),
    params.digits,
  ];

  const r = await pool.query(
    `
    SELECT c.*
    FROM chat_conversations c
    INNER JOIN users owner ON owner.id = c.user_id
    WHERE owner.tenant_id = $1
      AND COALESCE(c.conversation_type, 'direct') = 'direct'
      AND (
        c.client_id = $2::uuid
        OR (
          c.instance_id = $3::uuid
          AND (
            lower(c.external_chat_id) = ANY($4::text[])
            OR lower(COALESCE(c.canonical_chat_id, '')) = ANY($4::text[])
            OR lower(COALESCE(c.provider_conversation_id, '')) = ANY($4::text[])
            OR NULLIF(regexp_replace(COALESCE(c.phone_number, ''), '[^0-9]', '', 'g'), '') = $5
            OR NULLIF(regexp_replace(COALESCE(c.canonical_phone, ''), '[^0-9]', '', 'g'), '') = $5
          )
        )
      )
    ORDER BY
      CASE WHEN c.client_id = $2::uuid THEN 0 ELSE 1 END,
      COALESCE(c.last_message_at, c.created_at) DESC NULLS LAST
    LIMIT 1
    `,
    [params.tenantId, params.clientId, params.instanceId, candidates, params.digits]
  );
  return (r.rows[0] as AnyObject | undefined) ?? null;
}

async function ensureClientConversationForManualStart(params: {
  actorUserId: string;
  tenantId: string;
  client: AnyObject;
  instance: ChatInstanceRow;
  digits: string;
  jid: string;
}): Promise<{ conversationId: string; reused: boolean; isNew: boolean }> {
  const found = await findClientConversationForManualStart({
    tenantId: params.tenantId,
    clientId: params.client.id,
    instanceId: params.instance.id,
    digits: params.digits,
    jid: params.jid,
  });

  if (found?.id) {
    if (!found.client_id) {
      await pool.query(
        `
        UPDATE chat_conversations
        SET client_id = $1::uuid,
            metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
            updated_at = now()
        WHERE id = $3::uuid
        `,
        [
          params.client.id,
          JSON.stringify({
            link_source: 'manual',
            link_confidence: 'manual',
            link_state: 'client_linked',
            manual_start_linked_at: new Date().toISOString(),
          }),
          found.id,
        ]
      );
      void applyKanbanAutomationForConversation({
        tenantId: params.tenantId,
        actorUserId: params.actorUserId,
        conversationId: String(found.id),
        reason: 'client_linked',
      }).catch((err) => console.error('[kanban-entry-automation] client_linked (manual start)', err));
    }
    return { conversationId: String(found.id), reused: true, isNew: false };
  }

  const clientName = String(params.client.name || '').trim() || params.digits;
  const metadata = {
    source: 'outbound/manual_start',
    link_source: 'manual',
    link_confidence: 'manual',
    link_state: 'client_linked',
    phone_normalized: params.digits,
    created_by_manual_start_at: new Date().toISOString(),
  };
  const displayName = clientName;
  const inserted = await pool.query(
    `
    INSERT INTO chat_conversations (
      user_id, instance_id, external_chat_id, contact_name, profile_name, phone_number,
      status, last_message_at, unread_count, metadata, client_id, lead_id,
      canonical_chat_id, canonical_phone, display_name, identity_source, identity_strength,
      identity_state, history_sync_status, last_history_sync_reason, provider,
      provider_conversation_id, conversation_type, attendance_status
    )
    VALUES (
      $1, $2, $3, $4, $4, $5,
      'open', NULL, 0, $6::jsonb, $7, NULL,
      $3, $5, $4, 'phone_derived', 'medium',
      'resolved', 'ready', 'manual_start',
      'whatsapp_uazapi', $3, 'direct', $8
    )
    RETURNING *
    `,
    [
      params.instance.user_id,
      params.instance.id,
      params.jid,
      displayName,
      params.digits,
      JSON.stringify(metadata),
      params.client.id,
      normalizeAttendanceStatusForDb(undefined),
    ]
  );

  const conversationId = String(inserted.rows[0].id);
  void applyKanbanAutomationForConversation({
    tenantId: params.tenantId,
    actorUserId: params.actorUserId,
    conversationId,
    reason: 'client_linked',
  }).catch((err) => console.error('[kanban-entry-automation] client_linked (manual start insert)', err));
  return { conversationId, reused: false, isNew: true };
}

function absolutizeOutgoingMediaUrl(candidate: unknown): string | null {
  if (typeof candidate !== 'string') return null;
  const raw = candidate.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw;
  if (raw.startsWith('/media/whatsapp-templates/')) {
    const rel = raw.slice('/media/whatsapp-templates/'.length).split('/').filter(Boolean).join('/');
    if (!rel) return null;
    return buildWhatsappTemplateMediaPublicUrlFromStoragePath(rel);
  }
  if (raw.startsWith('media/whatsapp-templates/')) {
    const rel = raw.slice('media/whatsapp-templates/'.length).split('/').filter(Boolean).join('/');
    if (!rel) return null;
    return buildWhatsappTemplateMediaPublicUrlFromStoragePath(rel);
  }
  if (raw.startsWith('/')) {
    const base =
      process.env.API_PUBLIC_BASE_URL?.trim().replace(/\/$/, '') ||
      process.env.API_PUBLIC_ORIGIN?.trim().replace(/\/$/, '') ||
      'http://localhost:3001';
    return `${base}${raw}`;
  }
  return raw;
}

function isPublicHttpUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const s = raw.trim();
  if (!s) return false;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = (u.hostname || '').toLowerCase();
    if (!host) return false;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') return false;
    const p = host.split('.').map((n) => Number(n));
    if (p.length === 4 && p.every((n) => Number.isFinite(n) && n >= 0 && n <= 255)) {
      if (p[0] === 10) return false;
      if (p[0] === 127) return false;
      if (p[0] === 192 && p[1] === 168) return false;
      if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function extractOutgoingFileName(input: { fileName?: string | null; storagePath?: string | null; fileUrl?: string | null }): string | null {
  const direct = (input.fileName ?? '').trim();
  if (direct) return direct;
  const fromStorage = (input.storagePath ?? '').trim();
  if (fromStorage) {
    const seg = fromStorage.split('/').filter(Boolean).pop() ?? '';
    if (seg) return decodeURIComponent(seg).replace(/^[0-9a-f-]{8,}_/i, '') || seg;
  }
  const fromUrl = (input.fileUrl ?? '').trim();
  if (fromUrl) {
    try {
      const u = new URL(fromUrl, 'http://localhost');
      const seg = u.pathname.split('/').filter(Boolean).pop() ?? '';
      if (seg) return decodeURIComponent(seg).replace(/^[0-9a-f-]{8,}_/i, '') || seg;
    } catch {
      // ignore
    }
  }
  return null;
}

const REPLY_PREVIEW_MAX = 280;

function truncateReplyPreview(s: string, max = REPLY_PREVIEW_MAX): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function replyPreviewFromMessageRow(
  row: Record<string, unknown>,
  bodyFallback: string | null
): { preview: string; messageType: string } {
  const contract = contractFromDbRow(row);
  const k = contract.kind;
  if (k === 'text' || k === 'unknown') {
    return {
      preview: truncateReplyPreview(ensurePlainString(contract.body) || bodyFallback || ''),
      messageType: k,
    };
  }
  if (k === 'image') return { preview: '[Imagem]', messageType: k };
  if (k === 'video') return { preview: '[Vídeo]', messageType: k };
  if (k === 'audio') return { preview: '[Áudio]', messageType: k };
  if (k === 'document') return { preview: '[Documento]', messageType: k };
  if (k === 'sticker') return { preview: '[Figurinha]', messageType: k };
  return {
    preview: truncateReplyPreview(ensurePlainString(contract.body) || bodyFallback || ''),
    messageType: k,
  };
}

type ReplySnapshotPayload = {
  replyToMessageId: string;
  replyToExternalMessageId: string | null;
  replyPreview: string;
  replySenderName: string;
  replyMessageType: string;
  uazReplyId: string | null;
};

async function loadReplyContextForSend(params: {
  userId: string;
  conversationId: string;
  replyToMessageId: string;
  contactName: string | null;
  profileName: string | null;
}): Promise<ReplySnapshotPayload | { error: string; status: number }> {
  const r = await pool.query<Record<string, unknown>>(
    `
    SELECT m.*
    FROM chat_messages m
    INNER JOIN chat_conversations c ON c.id = m.conversation_id
    WHERE m.id = $1 AND m.conversation_id = $2 AND ${sqlChatAccessPredicate('$3')}
    `,
    [params.replyToMessageId, params.conversationId, params.userId]
  );
  if (r.rowCount === 0) {
    return { error: 'Mensagem a citar não encontrada', status: 400 };
  }
  const row = r.rows[0];
  const direction = String(row.direction || '');
  const extRaw = row.external_message_id;
  const ext = extRaw == null || extRaw === undefined ? null : String(extRaw);
  const { preview, messageType } = replyPreviewFromMessageRow(
    row,
    row.body == null ? null : String(row.body)
  );
  const contact =
    (params.contactName && String(params.contactName).trim()) ||
    (params.profileName && String(params.profileName).trim()) ||
    null;
  const replySenderName =
    direction === 'incoming' ? contact || 'Contato' : 'Sua equipe';
  const uazReplyId =
    ext && !ext.startsWith('local:') && !ext.startsWith('track_') ? ext : null;
  if (ext && !uazReplyId) {
    // UI + DB mantêm a citação; UazAPI precisa do id real do WhatsApp.
    // TODO: quando o provider confirmar o id da mensagem citada, reenviar com replyid.
  }
  return {
    replyToMessageId: String(row.id),
    replyToExternalMessageId: ext,
    replyPreview: preview,
    replySenderName,
    replyMessageType: messageType,
    uazReplyId,
  };
}

export async function resolveConversationForClient(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const tenantId = req.tenantId ?? (await resolveTenantIdForUser(userId));
    if (!tenantId) {
      res.status(403).json({ error: 'Tenant não identificado' });
      return;
    }

    const data = resolveConversationForClientSchema.parse(req.body);
    if (!(await canChatAction(userId, 'view', req))) {
      res.status(403).json({ error: 'Sem permissão para visualizar o chat' });
      return;
    }
    await assertPermissionKey(userId, 'clients.view', req);

    const clientResult = await pool.query<AnyObject>(
      `
      SELECT c.*
      FROM clients c
      INNER JOIN users owner ON owner.id = c.user_id AND owner.tenant_id = $1
      WHERE c.id = $2::uuid
      LIMIT 1
      `,
      [tenantId, data.client_id]
    );
    const clientRow = clientResult.rows[0];
    if (!clientRow) {
      res.status(404).json({ error: 'Cliente não encontrado' });
      return;
    }

    const phoneRaw = String(data.phone?.trim() || clientRow.phone || '').trim();
    const digits = normalizeLeadPhoneToWhatsappDigits(phoneRaw);
    if (!digits) {
      res.status(400).json({ error: 'Cliente sem telefone WhatsApp válido' });
      return;
    }
    const jid = whatsappDirectJidFromDigits(digits);

    const instance = await fetchInstanceForOperate(userId, data.instance_id);
    if (!instance) {
      res.status(404).json({ error: 'Instância WhatsApp não encontrada' });
      return;
    }
    const instanceStatus = String(instance.status || '').toLowerCase();
    if (!['connected', 'open'].includes(instanceStatus)) {
      res.status(400).json({ error: 'Instância WhatsApp desconectada' });
      return;
    }

    const prepared = await ensureClientConversationForManualStart({
      actorUserId: userId,
      tenantId,
      client: clientRow,
      instance: instance as ChatInstanceRow,
      digits,
      jid,
    });

    const fresh = await pool.query(
      `
      SELECT c.*, COALESCE(i.name, 'WhatsApp') AS instance_name
      FROM chat_conversations c
      LEFT JOIN chat_instances i ON i.id = c.instance_id
      WHERE c.id = $1::uuid
      LIMIT 1
      `,
      [prepared.conversationId]
    );

    res.status(201).json({
      conversation: fresh.rows[0] ? conversationRowForClientApi(fresh.rows[0] as Record<string, unknown>) : null,
      is_new: prepared.isNew,
      reused: prepared.reused,
    });
  } catch (error: any) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Dados inválidos', details: error.errors });
      return;
    }
    console.error('resolveConversationForClient:', error);
    res.status(500).json({ error: error?.message || 'Não foi possível resolver a conversa' });
  }
}

export async function prepareLeadConversation(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const tenantId = req.tenantId ?? (await resolveTenantIdForUser(userId));
    if (!tenantId) {
      res.status(403).json({ error: 'Tenant não identificado para preparar conversa' });
      return;
    }

    const data = prepareLeadConversationSchema.parse(req.body);
    if (!(await canChatAction(userId, 'view', req))) {
      res.status(403).json({ error: 'Sem permissão para visualizar o chat' });
      return;
    }
    await assertPermissionKey(userId, 'leads.view', req);

    const leadColumnAvailable = await hasLeadIdColumn();
    if (!leadColumnAvailable) {
      res.status(503).json({ error: 'Banco sem suporte para vínculo de conversa com lead' });
      return;
    }

    const leadResult = await pool.query<AnyObject>(
      `
      SELECT l.*
      FROM leads l
      INNER JOIN users owner ON owner.id = l.user_id
      WHERE l.id = $1::uuid
        AND owner.tenant_id = $2
      LIMIT 1
      `,
      [data.lead_id, tenantId]
    );
    const lead = leadResult.rows[0];
    if (!lead) {
      res.status(404).json({ error: 'Lead não encontrado' });
      return;
    }

    const digits = normalizeLeadPhoneToWhatsappDigits(lead.phone);
    if (!digits) {
      res.status(400).json({ error: 'Lead sem telefone WhatsApp válido' });
      return;
    }
    const jid = whatsappDirectJidFromDigits(digits);

    const instance = await fetchInstanceForOperate(userId, data.instance_id);
    if (!instance) {
      res.status(404).json({ error: 'Instância WhatsApp não encontrada' });
      return;
    }
    const instanceStatus = String(instance.status || '').toLowerCase();
    if (!['connected', 'open'].includes(instanceStatus)) {
      res.status(400).json({ error: 'Instância WhatsApp desconectada' });
      return;
    }

    const prepared = await ensureLeadConversationForManualStart({
      actorUserId: userId,
      tenantId,
      lead,
      instance: instance as ChatInstanceRow,
      digits,
      jid,
    });

    const fresh = await pool.query(
      `
      SELECT c.*, COALESCE(i.name, 'WhatsApp') AS instance_name
      FROM chat_conversations c
      LEFT JOIN chat_instances i ON i.id = c.instance_id
      WHERE c.id = $1::uuid
      LIMIT 1
      `,
      [prepared.conversationId]
    );

    res.status(201).json({
      conversation: fresh.rows[0] ? conversationRowForClientApi(fresh.rows[0] as Record<string, unknown>) : null,
      is_new: prepared.isNew,
      reused: prepared.reused,
    });
  } catch (error: any) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Dados inválidos para preparar conversa', details: error.errors });
      return;
    }
    console.error('Error preparing lead conversation:', error);
    res.status(500).json({ error: error?.message || 'Não foi possível preparar a conversa' });
  }
}

export async function patchPreparedConversationInstance(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const tenantId = req.tenantId ?? (await resolveTenantIdForUser(userId));
    const conversationId = String(req.params.id || '').trim();
    const data = patchPreparedConversationInstanceSchema.parse(req.body);
    if (!tenantId) {
      res.status(403).json({ error: 'Tenant não identificado' });
      return;
    }
    if (!(await canChatAction(userId, 'view', req))) {
      res.status(403).json({ error: 'Sem permissão para visualizar o chat' });
      return;
    }

    const instance = await fetchInstanceForOperate(userId, data.instance_id);
    if (!instance) {
      res.status(404).json({ error: 'Instância WhatsApp não encontrada' });
      return;
    }
    const instanceStatus = String(instance.status || '').toLowerCase();
    if (!['connected', 'open'].includes(instanceStatus)) {
      res.status(400).json({ error: 'Instância WhatsApp desconectada' });
      return;
    }

    const msgCount = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM chat_messages WHERE conversation_id = $1::uuid`,
      [conversationId]
    );
    if (Number(msgCount.rows[0]?.n ?? 0) > 0) {
      res.status(409).json({ error: 'A instância só pode ser alterada antes da primeira mensagem' });
      return;
    }

    const updated = await pool.query(
      `
      UPDATE chat_conversations c
      SET instance_id = $1::uuid,
          metadata = COALESCE(c.metadata, '{}'::jsonb) || $2::jsonb,
          updated_at = now()
      FROM users owner
      WHERE c.id = $3::uuid
        AND owner.id = c.user_id
        AND owner.tenant_id = $4
        AND c.lead_id IS NOT NULL
      RETURNING c.*
      `,
      [
        data.instance_id,
        JSON.stringify({ prepared_instance_changed_at: new Date().toISOString() }),
        conversationId,
        tenantId,
      ]
    );
    if (updated.rowCount === 0) {
      res.status(404).json({ error: 'Conversa preparada não encontrada' });
      return;
    }
    res.json({ conversation: conversationRowForClientApi(updated.rows[0] as Record<string, unknown>) });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Dados inválidos para alterar instância', details: error.errors });
      return;
    }
    if (String(error?.code) === '23505') {
      res.status(409).json({ error: 'Já existe conversa para este contato na instância selecionada' });
      return;
    }
    console.error('Error patching prepared conversation instance:', error);
    res.status(500).json({ error: error?.message || 'Não foi possível alterar a instância' });
  }
}

export async function sendMessage(req: AuthRequest, res: Response) {
  let queuedMessageRowId: string | null = null;
  try {
    const userId = req.userId!;
    const tenantId = await resolveTenantIdForUser(userId);
    const data = sendMessageSchema.parse(req.body);

    if (!(await canChatAction(userId, 'reply', req))) {
      res.status(403).json({ error: 'Sem permissão para enviar mensagens no chat' });
      return;
    }

    const conversationResult = await pool.query(
      `
        SELECT c.*, i.instance_token, i.external_instance_name
        FROM chat_conversations c
        LEFT JOIN chat_instances i ON i.id = c.instance_id
        WHERE c.id = $1 AND ${SQL_CHAT_ACCESS_PREDICATE}
      `,
      [data.conversationId, userId]
    );

    if (conversationResult.rowCount === 0) {
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }

    const conversation = conversationResult.rows[0];

    const isOfficial =
      String((conversation as { provider?: string }).provider || '') === 'whatsapp_official' ||
      Boolean((conversation as { whatsapp_official_account_id?: string }).whatsapp_official_account_id);

    if (isOfficial) {
      const accId = String(
        (conversation as { whatsapp_official_account_id?: string }).whatsapp_official_account_id || ''
      ).trim();
      if (!accId || !(await assertWhatsappOfficialConversationSendAllowed(req, accId))) {
        res.status(403).json({ error: 'Sem permissão para enviar pelo WhatsApp Oficial' });
        return;
      }
    } else if (!(conversation as { instance_token?: string }).instance_token) {
      res.status(400).json({ error: 'Instância não disponível para esta conversa' });
      return;
    }

    let replyContext: ReplySnapshotPayload | null = null;
    if (!isOfficial && data.replyToMessageId) {
      const rc = await loadReplyContextForSend({
        userId,
        conversationId: data.conversationId,
        replyToMessageId: data.replyToMessageId,
        contactName:
          typeof (conversation as { contact_name?: string }).contact_name === 'string'
            ? (conversation as { contact_name?: string }).contact_name ?? null
            : null,
        profileName:
          typeof (conversation as { profile_name?: string }).profile_name === 'string'
            ? (conversation as { profile_name?: string }).profile_name ?? null
            : null,
      });
      if ('error' in rc) {
        res.status(rc.status).json({ error: rc.error });
        return;
      }
      replyContext = rc;
    }

    const numberTo = toUazRecipientNumber(
      (conversation as { canonical_phone?: string }).canonical_phone || conversation.phone_number,
      conversation.external_chat_id
    );
    const msgType = data.type ?? 'text';

    if (msgType === 'text' && data.clientMessageId) {
      const dupPred = sqlChatAccessPredicate('$3');
      const dupQ = await pool.query(
        `SELECT m.* FROM chat_messages m
         INNER JOIN chat_conversations c ON c.id = m.conversation_id
         WHERE m.conversation_id = $1 AND m.client_message_id = $2::uuid
         AND ${dupPred}
         LIMIT 1`,
        [data.conversationId, data.clientMessageId, userId]
      );
      if (dupQ.rowCount && dupQ.rows[0]) {
        const row: any = dupQ.rows[0];
        res.status(200).json({
          message: { ...row, message_contract: contractFromDbRow(row) },
          duplicate: true,
        });
        return;
      }
    }

    let messageResponse: AnyObject;
    let savedRowId: string | null = null;
    const localTrackId = `track_${randomUUID()}`;
    const provisionalExternalId = `local:${randomUUID()}`;

    if (msgType === 'image' || msgType === 'document') {
      if (isOfficial) {
        res.status(400).json({
          error: 'Envio de mídia pelo WhatsApp Oficial ainda não está disponível neste chat.',
        });
        return;
      }
      const caption = (data.caption ?? '').trim();
      const sourceFile: string | null =
        data.fileUrl ||
        (data.fileBase64
          ? `data:${data.mimeType || (msgType === 'document' ? 'application/pdf' : 'image/jpeg')};base64,${data.fileBase64}`
          : null);
      if (!sourceFile) {
        res.status(400).json({ error: 'Informe fileBase64 ou fileUrl para envio de mídia' });
        return;
      }
      const resolvedMedia = await resolveOutgoingMediaPayload({
        type: msgType,
        fileUrl: sourceFile,
        mimeType: data.mimeType || (msgType === 'document' ? 'application/pdf' : 'image/jpeg'),
      });
      const providerFile =
        msgType === 'document' &&
        typeof resolvedMedia.fileForProvider === 'string' &&
        resolvedMedia.fileForProvider.startsWith('data:') &&
        isPublicHttpUrl(absolutizeOutgoingMediaUrl(resolvedMedia.persistedUrl))
          ? (absolutizeOutgoingMediaUrl(resolvedMedia.persistedUrl) as string)
          : resolvedMedia.fileForProvider;

      // 1) Persistência local imediata (estado inicial)
      {
        const saveResult = await saveMessage(conversation.id, 'outgoing', {
        externalMessageId: provisionalExternalId,
        body: caption || null,
        media: [
          {
            type: msgType,
            url: resolvedMedia.persistedUrl,
            mimetype: resolvedMedia.mimeType,
          },
        ],
        messageKind: msgType,
        status: 'queued',
        sentAt: new Date(),
        metadata: { source: 'send/media', track_id: localTrackId, provisional: true },
        ...(replyContext
          ? {
              replyToMessageId: replyContext.replyToMessageId,
              replyToExternalMessageId: replyContext.replyToExternalMessageId,
              replyPreview: replyContext.replyPreview,
              replySenderName: replyContext.replySenderName,
              replyMessageType: replyContext.replyMessageType,
            }
          : {}),
      });
        savedRowId = saveResult.rowId;
      }
      queuedMessageRowId = savedRowId;

      messageResponse = (await uazapiService.sendMediaMessage(conversation.instance_token, {
        number: numberTo,
        ...(replyContext?.uazReplyId ? { replyid: replyContext.uazReplyId } : {}),
        type: msgType,
        file: providerFile,
        ...(data.fileName?.trim()
          ? {
              fileName: data.fileName.trim(),
              filename: data.fileName.trim(),
              documentName: data.fileName.trim(),
              docName: data.fileName.trim(),
              file_name: data.fileName.trim(),
              name: data.fileName.trim(),
            }
          : {}),
        ...(resolvedMedia.mimeType ? { mimeType: resolvedMedia.mimeType, mimetype: resolvedMedia.mimeType } : {}),
        ...(caption ? { text: caption } : {}),
        readchat: data.readChat,
        readmessages: data.readMessages,
        delay: data.delay,
        track_source: 'painelcrm',
        track_id: localTrackId,
      })) as AnyObject;

      const extId = extractUazOutgoingMessageId(messageResponse);

      const remoteUrl =
        absolutizeOutgoingMediaUrl(resolvedMedia.persistedUrl) ||
        absolutizeOutgoingMediaUrl((messageResponse as any)?.response?.fileUrl) ||
        absolutizeOutgoingMediaUrl((messageResponse as any)?.fileUrl) ||
        absolutizeOutgoingMediaUrl((messageResponse as any)?.url) ||
        null;
      const uiMediaUrl =
        msgType !== 'document' &&
        typeof resolvedMedia.fileForProvider === 'string' &&
        resolvedMedia.fileForProvider.startsWith('data:')
          ? resolvedMedia.fileForProvider
          : remoteUrl || resolvedMedia.persistedUrl;

      const mediaItems: ChatMediaItem[] = [
        {
          type: msgType,
          url: uiMediaUrl,
          mimetype: resolvedMedia.mimeType,
          fileName: data.fileName?.trim() || null,
        },
      ];

      logUazChat('info', {
        event_type: msgType === 'document' ? 'send_message_document' : 'send_message_image',
        phase: 'uazapi_ok',
        user_id: userId,
        instance_id: conversation.instance_id,
        conversation_id: conversation.id,
        external_id_extracted: extId,
        uaz_response_top_keys:
          messageResponse && typeof messageResponse === 'object'
            ? Object.keys(messageResponse as object).slice(0, 25)
            : [],
        file_is_data_url: resolvedMedia.fileForProvider.startsWith('data:'),
        mime_type: resolvedMedia.mimeType,
        caption_len: caption.length,
      });

      if (savedRowId) {
        const nextStatus = pickBestOutgoingStatus('queued', 'provider_sent') ?? 'provider_sent';
        await pool.query(
          `
          UPDATE chat_messages
          SET
            external_message_id = COALESCE($1, external_message_id),
            status = $2,
            media = CASE
              WHEN $4::jsonb IS NOT NULL
                AND jsonb_typeof($4::jsonb) = 'array'
                AND jsonb_array_length($4::jsonb) > 0
              THEN $4::jsonb
              ELSE media
            END,
            metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
            sent_at = COALESCE(sent_at, $5::timestamptz)
          WHERE id = $6
          `,
          [
            extId,
            nextStatus,
            JSON.stringify({ ...messageResponse, source: 'send/media', track_id: localTrackId }),
            JSON.stringify(mediaItems),
            new Date(),
            savedRowId,
          ]
        );
      }
    } else {
      const rawText = (data.text ?? '').trim();
      let text = rawText;
      let senderNamePrefixMeta: Record<string, unknown> = {};
      if (msgType === 'text' && rawText) {
        const sndQ = await pool.query<{
          chat_show_sender_name: boolean | null;
          display_name: string | null;
          email: string;
        }>(
          `SELECT COALESCE(u.chat_show_sender_name, false) AS chat_show_sender_name,
                  TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS display_name,
                  u.email
           FROM users u
           LEFT JOIN profiles p ON p.id = u.id
           WHERE u.id = $1`,
          [userId]
        );
        const srow = sndQ.rows[0];
        const displayName =
          ((srow?.display_name as string) ?? '').trim() || ((srow?.email as string) ?? '').trim() || '';
        const chatShow = srow?.chat_show_sender_name === true;
        const pref = buildManualOutgoingTextWithSenderPrefix({
          rawBody: rawText,
          senderDisplayName: displayName,
          chatShowSenderName: chatShow,
        });
        text = pref.textToSend;
        senderNamePrefixMeta = pref.meta;
      }

      if (isOfficial) {
        const accountId = String(
          (conversation as { whatsapp_official_account_id?: string }).whatsapp_official_account_id || ''
        ).trim();
        const cred = await getAccountCredentials(accountId);
        if (!cred) {
          res.status(400).json({ error: 'Conta WhatsApp Oficial não encontrada ou indisponível' });
          return;
        }
        const rawDigits = toUazRecipientNumber(
          (conversation as { canonical_phone?: string }).canonical_phone || conversation.phone_number,
          conversation.external_chat_id
        );
        const digits = rawDigits.replace(/\D/g, '');
        if (!digits || digits.length < 8) {
          res.status(400).json({ error: 'Telefone do destinatário inválido para este canal' });
          return;
        }

        {
          const saveResult = await saveMessage(conversation.id, 'outgoing', {
            externalMessageId: provisionalExternalId,
            body: text,
            media: [],
            messageKind: 'text',
            status: 'queued',
      sentAt: new Date(),
            clientMessageId: data.clientMessageId ?? null,
            messageProvider: 'whatsapp_official',
            metadata: {
              source: 'send/text/whatsapp_official',
              track_id: localTrackId,
              provisional: true,
              ...(data.clientMessageId ? { client_message_id: data.clientMessageId } : {}),
              ...senderNamePrefixMeta,
            },
          });
          savedRowId = saveResult.rowId;
        }
        queuedMessageRowId = savedRowId;

        console.log(
          JSON.stringify({
            event: 'meta_message_send_started',
            conversation_id: data.conversationId,
            account_id: accountId,
            phone_number_id: cred.phoneNumberId,
          })
        );
        const sendResult = await graphOfficialSendText(
          cred.phoneNumberId,
          cred.accessToken,
          digits,
          text
        );

        if (!sendResult.ok) {
          if (savedRowId) {
            await pool.query(
              `
              UPDATE chat_messages
              SET status = 'failed',
                  metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
              WHERE id = $2
              `,
              [
                JSON.stringify({
                  send_error: sendResult.error || 'Meta send failed',
                  source: 'whatsapp_official',
                }),
                savedRowId,
              ]
            );
          }
          console.warn(
            JSON.stringify({
              event: 'meta_message_send_failed',
              conversation_id: data.conversationId,
              account_id: accountId,
              error: sendResult.error || 'Meta send failed',
            })
          );
          res.status(502).json({
            error: sendResult.error || 'Falha ao enviar pela Meta Cloud API',
          });
          return;
        }

        console.log(
          JSON.stringify({
            event: 'meta_message_send_success',
            conversation_id: data.conversationId,
            account_id: accountId,
            wamid: sendResult.messages?.[0]?.id ?? null,
          })
        );
        const wamid = sendResult.messages?.[0]?.id;
        messageResponse = {
          source: 'whatsapp_official',
          wamid,
          raw: sendResult.raw,
        } as AnyObject;

        const extId = wamid ?? null;
        if (savedRowId) {
          const nextStatus = pickBestOutgoingStatus('queued', 'sent') ?? 'sent';
          await pool.query(
            `
            UPDATE chat_messages
            SET
              external_message_id = COALESCE($1, external_message_id),
              status = $2,
              metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
              sent_at = COALESCE(sent_at, $4::timestamptz)
            WHERE id = $5
            `,
            [
              extId,
              nextStatus,
              JSON.stringify({
                ...((sendResult.raw && typeof sendResult.raw === 'object'
                  ? sendResult.raw
                  : {}) as object),
                source: 'whatsapp_official',
                track_id: localTrackId,
                ...senderNamePrefixMeta,
              }),
              new Date(),
              savedRowId,
            ]
          );
        }
      } else {
        // 1) Persistência local imediata (estado inicial)
        {
          const saveResult = await saveMessage(conversation.id, 'outgoing', {
            externalMessageId: provisionalExternalId,
            body: text,
            media: [],
            messageKind: 'text',
            status: 'queued',
            sentAt: new Date(),
            clientMessageId: data.clientMessageId ?? null,
            metadata: {
              source: 'send/text',
              track_id: localTrackId,
              provisional: true,
              ...(data.clientMessageId ? { client_message_id: data.clientMessageId } : {}),
              ...senderNamePrefixMeta,
            },
            ...(replyContext
              ? {
                  replyToMessageId: replyContext.replyToMessageId,
                  replyToExternalMessageId: replyContext.replyToExternalMessageId,
                  replyPreview: replyContext.replyPreview,
                  replySenderName: replyContext.replySenderName,
                  replyMessageType: replyContext.replyMessageType,
                }
              : {}),
          });
          savedRowId = saveResult.rowId;
        }
        queuedMessageRowId = savedRowId;

        messageResponse = (await uazapiService.sendTextMessage(
          (conversation as { instance_token: string }).instance_token,
          {
            number: numberTo,
            text,
            ...(replyContext?.uazReplyId ? { replyid: replyContext.uazReplyId } : {}),
            readchat: data.readChat,
            readmessages: data.readMessages,
            delay: data.delay,
            track_source: 'painelcrm',
            track_id: localTrackId,
          }
        )) as AnyObject;

        const extId = extractUazOutgoingMessageId(messageResponse);

        if (savedRowId) {
          const nextStatus = pickBestOutgoingStatus('queued', 'provider_sent') ?? 'provider_sent';
          await pool.query(
            `
            UPDATE chat_messages
            SET
              external_message_id = COALESCE($1, external_message_id),
              status = $2,
              metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
              sent_at = COALESCE(sent_at, $4::timestamptz)
            WHERE id = $5
            `,
            [
              extId,
              nextStatus,
              JSON.stringify({ ...messageResponse, track_id: localTrackId, ...senderNamePrefixMeta }),
              new Date(),
              savedRowId,
            ]
          );
        }
      }
    }

    if (!isOfficial) {
      try {
        const instRow = await fetchInstanceForOperate(userId, conversation.instance_id);
        if (instRow) {
          void fetchAndUpsertRemoteChatIdentity(instRow as ChatInstanceRow, conversation.external_chat_id).catch(
          (idErr: any) => console.warn('[SendMessage] identity refresh failed:', idErr?.message)
        );
      }
    } catch {
      /* não bloquear envio */
      }
    }

    // Pequeno delay para garantir que a atualização da conversa foi commitada no banco
    // Isso evita problemas de race condition
    await new Promise(resolve => setTimeout(resolve, 50));

    // Buscar conversa atualizada e mensagem salva para emitir via WebSocket
    // IMPORTANTE: manter os mesmos campos de vínculo persistido da listagem principal.
    const leadColumnAvailableWs = await hasLeadIdColumn();
    const [updatedConversationResult, savedMessageResult] = await Promise.all([
      pool.query(
        `
          SELECT
            c.id,
            c.user_id,
            c.instance_id,
            c.provider,
            c.external_chat_id,
            c.external_fast_id,
            c.contact_name,
            c.profile_name,
            c.phone_number,
            c.display_name,
            c.avatar_url,
            c.status,
            c.last_message_preview,
            c.last_message_at,
            c.unread_count,
            c.metadata,
            c.created_at,
            c.updated_at,
            c.client_id,
            ${leadColumnAvailableWs ? 'c.lead_id,' : 'NULL::uuid as lead_id,'}
            c.phone_key,
            c.assigned_to_user_id,
            c.assigned_team_id,
            COALESCE(i.name, wa.display_phone_number, wa.verified_name, 'WhatsApp Oficial') as instance_name,
            CASE
              WHEN c.client_id IS NOT NULL THEN 'client_linked'
              WHEN ${leadColumnAvailableWs ? 'c.lead_id IS NOT NULL' : 'false'} THEN 'lead_linked'
              WHEN COALESCE((c.metadata->>'link_confidence'), '') = 'review' THEN 'review_required'
              ELSE 'unlinked'
            END as link_state,
            COALESCE(c.metadata->>'link_source', 'system') as link_source,
            COALESCE(c.metadata->>'link_confidence', 'review') as link_confidence,
            CASE
              WHEN ${leadColumnAvailableWs ? 'c.lead_id IS NOT NULL' : 'false'} THEN (
                SELECT l2.status FROM leads l2 WHERE l2.id = c.lead_id AND l2.user_id = c.user_id LIMIT 1
              )
              ELSE NULL
            END as lead_status
          FROM chat_conversations c
          LEFT JOIN chat_instances i ON i.id = c.instance_id
          LEFT JOIN whatsapp_official_accounts wa ON wa.id = c.whatsapp_official_account_id
          WHERE c.id = $1
        `,
        [data.conversationId]
      ),
      savedRowId
        ? pool.query(`SELECT * FROM chat_messages WHERE id = $1`, [savedRowId])
        : Promise.resolve({ rows: [] as any[] }),
    ]);

    if (updatedConversationResult.rows.length > 0) {
      const updatedConversation = updatedConversationResult.rows[0];
      
      // Log detalhado para debug
      console.log('[SendMessage] Updated conversation data:', {
        conversationId: updatedConversation.id,
        lastMessagePreview: updatedConversation.last_message_preview,
        lastMessageAt: updatedConversation.last_message_at,
        updatedAt: updatedConversation.updated_at,
        userId,
      });
      
      // Emitir atualização de conversa via WebSocket
      try {
        emitConversationUpdate(userId, updatedConversation);
        if (tenantId) {
          const rowProv = (updatedConversation as { provider?: string }).provider;
          emitToTenant(
            tenantId,
            'conversation.updated',
            buildConversationUpdatedPayload({
              provider: (rowProv as typeof DEFAULT_COMMUNICATION_PROVIDER) ?? DEFAULT_COMMUNICATION_PROVIDER,
              conversation_id: updatedConversation.id,
              last_message_preview: updatedConversation.last_message_preview ?? null,
              last_message_at: updatedConversation.last_message_at ?? null,
              unread_count: updatedConversation.unread_count ?? 0,
              status: updatedConversation.status ?? null,
              assigned_user_id: updatedConversation.assigned_to_user_id ?? null,
              assigned_team_id: updatedConversation.assigned_team_id ?? null,
              display_name: updatedConversation.display_name ?? null,
              avatar_url: updatedConversation.avatar_url ?? null,
            })
          );
        }
        console.log('[SendMessage] Conversation update emitted via WebSocket', {
          conversationId: updatedConversation.id,
          userId,
          lastMessagePreview: updatedConversation.last_message_preview,
          lastMessageAt: updatedConversation.last_message_at,
        });
      } catch (wsError: any) {
        console.warn('[SendMessage] Failed to emit conversation update:', wsError.message);
      }

      // Emitir nova mensagem via WebSocket
      if (savedMessageResult.rows.length > 0) {
        const row: any = savedMessageResult.rows[0];
        try {
          const contract = contractFromDbRow(row);
          emitNewMessage(
            userId,
            {
              id: row.id,
            conversation_id: conversation.id,
              direction: row.direction,
              body: row.body,
              sent_at: row.sent_at || new Date(),
              status: row.status,
              external_message_id: row.external_message_id,
              media: row.media,
              message_contract: contract,
              reply_to_message_id: row.reply_to_message_id ?? null,
              reply_to_external_message_id: row.reply_to_external_message_id ?? null,
              reply_preview: row.reply_preview ?? null,
              reply_sender_name: row.reply_sender_name ?? null,
              reply_message_type: row.reply_message_type ?? null,
            },
            conversation.id
          );
          if (tenantId) {
            const media = Array.isArray(row.media) ? (row.media as Array<Record<string, unknown>>) : [];
            const mediaUrlRaw = media.find((m) => typeof m?.url === 'string' && m.url)?.url;
            const mediaUrl = typeof mediaUrlRaw === 'string' ? mediaUrlRaw : null;
            const convProv = (conversation as { provider?: string }).provider;
            emitToTenant(
              tenantId,
              'message.created',
              buildMessageCreatedPayload({
                provider: (convProv as typeof DEFAULT_COMMUNICATION_PROVIDER) ?? DEFAULT_COMMUNICATION_PROVIDER,
                conversation_id: conversation.id,
                message_id: row.id != null ? String(row.id) : null,
                direction: String(row.direction ?? ''),
                body: row.body == null ? null : String(row.body),
                message_type: String(contract.kind ?? 'text'),
                media_url: mediaUrl,
                sent_at: row.sent_at || new Date(),
                provider_message_id:
                  row.external_message_id == null ? null : String(row.external_message_id),
                reply_to_message_id:
                  row.reply_to_message_id == null ? null : String(row.reply_to_message_id),
                reply_preview: row.reply_preview == null ? null : String(row.reply_preview),
                reply_sender_name: row.reply_sender_name == null ? null : String(row.reply_sender_name),
                reply_message_type:
                  row.reply_message_type == null ? null : String(row.reply_message_type),
              })
            );
          }
          console.log('[SendMessage] New message emitted via WebSocket', {
            messageId: row.id,
            conversationId: conversation.id,
            userId,
          });
        } catch (wsError: any) {
          console.warn('[SendMessage] Failed to emit new message:', wsError.message);
        }
      }
    }

    let outgoingMessageDto: AnyObject | null = null;
    if (savedMessageResult.rows.length > 0) {
      const row: any = savedMessageResult.rows[0];
      outgoingMessageDto = {
        ...row,
        message_contract: contractFromDbRow(row),
      };
    }

    res.status(201).json({
      response: messageResponse,
      ...(outgoingMessageDto ? { message: outgoingMessageDto } : {}),
    });
  } catch (error: any) {
    console.error('Error sending message:', error);
    if (queuedMessageRowId) {
      try {
        await pool.query(
          `
          UPDATE chat_messages
          SET
            status = 'failed',
            metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
          WHERE id = $2
          `,
          [JSON.stringify({ send_error: error?.message || String(error) }), queuedMessageRowId]
        );
      } catch (markErr: any) {
        console.warn('[SendMessage] Failed to mark queued message as failed:', markErr?.message);
      }
    }
    res.status(500).json({ error: error.message || 'Failed to send message' });
  }
}

export type KanbanAutomationOutboundTextInput = {
  actorUserId: string;
  conversationId: string;
  text: string;
  /** Referência Kanban; ausente no envio manual de modelo WhatsApp */
  automationRef?: { boardId: string; columnId: string; cardId: string };
  /** Default `kanban_auto_text` */
  metadataSource?: string;
  whatsappModelTrace?: { template_id: string; item_index: number; message_type: string };
};

export type KanbanAutomationOutboundMediaInput = {
  actorUserId: string;
  conversationId: string;
  type: 'image' | 'document';
  fileUrl?: string | null;
  storagePath?: string | null;
  caption?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  automationRef?: { boardId: string; columnId: string; cardId: string };
  metadataSource?: string;
  whatsappModelTrace?: { template_id: string; item_index: number; message_type: string };
};

/**
 * Envio outbound de texto reutilizando o mesmo pipeline do painel (`saveMessage` + UazAPI + WS),
 * para automações Kanban (não bloqueante; erros retornam em `error` sem lançar).
 */
export async function sendKanbanAutomationOutboundText(
  input: KanbanAutomationOutboundTextInput,
): Promise<{ ok: boolean; error?: string }> {
  const text = (input.text ?? '').trim();
  if (!text) {
    return { ok: false, error: 'empty_text' };
  }

  let queuedMessageRowId: string | null = null;
  try {
    const conversationResult = await pool.query(
      `
        SELECT c.*, i.instance_token, i.external_instance_name, i.status AS instance_status
        FROM chat_conversations c
        INNER JOIN chat_instances i ON i.id = c.instance_id
        WHERE c.id = $1 AND ${SQL_CHAT_ACCESS_PREDICATE}
      `,
      [input.conversationId, input.actorUserId],
    );

    if (conversationResult.rowCount === 0) {
      return { ok: false, error: 'conversation_not_found_or_no_access' };
    }

    const conversation = conversationResult.rows[0];
    const instStatus = String(conversation.instance_status || '').toLowerCase();
    if (instStatus !== 'connected' && instStatus !== 'open') {
      return { ok: false, error: 'whatsapp_not_connected' };
    }

    const numberTo = toUazRecipientNumber(
      (conversation as { canonical_phone?: string }).canonical_phone || conversation.phone_number,
      conversation.external_chat_id,
    );
    if (!numberTo) {
      return { ok: false, error: 'no_recipient_number' };
    }

    const localTrackId = `kanban_auto_${randomUUID()}`;
    const provisionalExternalId = `local:${randomUUID()}`;
    const metaBase: Record<string, unknown> = {
      source: input.metadataSource ?? 'kanban_auto_text',
      track_id: localTrackId,
      provisional: true,
    };
    if (input.automationRef) {
      metaBase.board_id = input.automationRef.boardId;
      metaBase.column_id = input.automationRef.columnId;
      metaBase.card_id = input.automationRef.cardId;
    }
    if (input.whatsappModelTrace) {
      metaBase.whatsapp_model_template_id = input.whatsappModelTrace.template_id;
      metaBase.whatsapp_model_item_index = input.whatsappModelTrace.item_index;
      metaBase.whatsapp_model_item_type = input.whatsappModelTrace.message_type;
    }
    const saveResult = await saveMessage(conversation.id, 'outgoing', {
      externalMessageId: provisionalExternalId,
      body: text,
      media: [],
      messageKind: 'text',
      status: 'queued',
      sentAt: new Date(),
      metadata: metaBase,
    });
    const savedRowId = saveResult.rowId;
    queuedMessageRowId = savedRowId;

    const trackSource =
      input.metadataSource === 'manual_whatsapp_model' || input.metadataSource === 'kanban_whatsapp_model'
        ? 'painelcrm_whatsapp_model'
        : 'painelcrm_kanban_auto';

    const messageResponse = (await uazapiService.sendTextMessage(conversation.instance_token, {
      number: numberTo,
      text,
      readchat: false,
      readmessages: false,
      delay: 0,
      track_source: trackSource,
      track_id: localTrackId,
    })) as AnyObject;

    const extId = extractUazOutgoingMessageId(messageResponse);

    if (savedRowId) {
      const nextStatus = pickBestOutgoingStatus('queued', 'provider_sent') ?? 'provider_sent';
      await pool.query(
        `
          UPDATE chat_messages
          SET
            external_message_id = COALESCE($1, external_message_id),
            status = $2,
            metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
            sent_at = COALESCE(sent_at, $4::timestamptz)
          WHERE id = $5
        `,
        [
          extId,
          nextStatus,
          JSON.stringify({ ...messageResponse, track_id: localTrackId }),
          new Date(),
          savedRowId,
        ],
      );
    }

    try {
      const instRow = await fetchInstanceForOperate(input.actorUserId, conversation.instance_id);
      if (instRow) {
        void fetchAndUpsertRemoteChatIdentity(instRow as ChatInstanceRow, conversation.external_chat_id).catch(
          (idErr: any) => console.warn('[KanbanAutoText] identity refresh failed:', idErr?.message),
        );
      }
    } catch {
      /* não bloquear envio */
    }

    await new Promise((resolve) => setTimeout(resolve, 50));

    const leadColumnAvailableWs = await hasLeadIdColumn();
    const [updatedConversationResult, savedMessageResult] = await Promise.all([
      pool.query(
        `
          SELECT
            c.id,
            c.user_id,
            c.instance_id,
            c.provider,
            c.external_chat_id,
            c.external_fast_id,
            c.contact_name,
            c.profile_name,
            c.phone_number,
            c.display_name,
            c.avatar_url,
            c.status,
            c.last_message_preview,
            c.last_message_at,
            c.unread_count,
            c.metadata,
            c.created_at,
            c.updated_at,
            c.client_id,
            ${leadColumnAvailableWs ? 'c.lead_id,' : 'NULL::uuid as lead_id,'}
            c.phone_key,
            c.assigned_to_user_id,
            c.assigned_team_id,
            i.name as instance_name,
            CASE
              WHEN c.client_id IS NOT NULL THEN 'client_linked'
              WHEN ${leadColumnAvailableWs ? 'c.lead_id IS NOT NULL' : 'false'} THEN 'lead_linked'
              WHEN COALESCE((c.metadata->>'link_confidence'), '') = 'review' THEN 'review_required'
              ELSE 'unlinked'
            END as link_state,
            COALESCE(c.metadata->>'link_source', 'system') as link_source,
            COALESCE(c.metadata->>'link_confidence', 'review') as link_confidence,
            CASE
              WHEN ${leadColumnAvailableWs ? 'c.lead_id IS NOT NULL' : 'false'} THEN (
                SELECT l2.status FROM leads l2 WHERE l2.id = c.lead_id AND l2.user_id = c.user_id LIMIT 1
              )
              ELSE NULL
            END as lead_status
          FROM chat_conversations c
          INNER JOIN chat_instances i ON i.id = c.instance_id
          WHERE c.id = $1
        `,
        [input.conversationId],
      ),
      savedRowId ? pool.query(`SELECT * FROM chat_messages WHERE id = $1`, [savedRowId]) : Promise.resolve({ rows: [] as any[] }),
    ]);

    if (updatedConversationResult.rows.length > 0) {
      const updatedConversation = updatedConversationResult.rows[0];
      try {
        emitConversationUpdate(input.actorUserId, updatedConversation);
      } catch (wsError: any) {
        console.warn('[KanbanAutoText] Failed to emit conversation update:', wsError.message);
      }

      if (savedMessageResult.rows.length > 0) {
        const row: any = savedMessageResult.rows[0];
        try {
          const contract = contractFromDbRow(row);
          emitNewMessage(
            input.actorUserId,
            {
              id: row.id,
              conversation_id: conversation.id,
              direction: row.direction,
              body: row.body,
              sent_at: row.sent_at || new Date(),
              status: row.status,
              external_message_id: row.external_message_id,
              media: row.media,
              message_contract: contract,
            },
            conversation.id,
          );
        } catch (wsError: any) {
          console.warn('[KanbanAutoText] Failed to emit new message:', wsError.message);
        }
      }
    }

    return { ok: true };
  } catch (error: any) {
    console.error('[KanbanAutoText] send failed', {
      conversationId: input.conversationId,
      error: error?.message || error,
    });
    if (queuedMessageRowId) {
      try {
        await pool.query(
          `
          UPDATE chat_messages
          SET
            status = 'failed',
            metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
          WHERE id = $2
          `,
          [JSON.stringify({ send_error: error?.message || String(error) }), queuedMessageRowId],
        );
      } catch (markErr: any) {
        console.warn('[KanbanAutoText] Failed to mark queued message as failed:', markErr?.message);
      }
    }
    return { ok: false, error: error?.message || 'send_failed' };
  }
}

/**
 * Imagem ou documento para automações Kanban / sequência de modelo WhatsApp.
 * Resolve mídia em data-uri (quando storage interno / URL local) ou URL pública antes de chamar o provider.
 * Reutiliza `saveMessage` + UazAPI `/send/media` + WS (mesmo padrão do texto automático).
 */
export async function sendKanbanAutomationOutboundMedia(
  input: KanbanAutomationOutboundMediaInput,
): Promise<{ ok: boolean; error?: string }> {
  const mimeDefault = input.type === 'document' ? 'application/pdf' : 'image/jpeg';
  const mime = (input.mimeType ?? mimeDefault).trim() || mimeDefault;
  let resolvedMedia: Awaited<ReturnType<typeof resolveOutgoingMediaPayload>>;
  try {
    resolvedMedia = await resolveOutgoingMediaPayload({
      type: input.type,
      fileUrl: input.fileUrl ?? null,
      storagePath: input.storagePath ?? null,
      mimeType: mime,
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || 'invalid_or_missing_media_source' };
  }
  let queuedMessageRowId: string | null = null;
  try {
    const conversationResult = await pool.query(
      `
        SELECT c.*, i.instance_token, i.external_instance_name, i.status AS instance_status
        FROM chat_conversations c
        INNER JOIN chat_instances i ON i.id = c.instance_id
        WHERE c.id = $1 AND ${SQL_CHAT_ACCESS_PREDICATE}
      `,
      [input.conversationId, input.actorUserId],
    );

    if (conversationResult.rowCount === 0) {
      return { ok: false, error: 'conversation_not_found_or_no_access' };
    }

    const conversation = conversationResult.rows[0];
    const instStatus = String(conversation.instance_status || '').toLowerCase();
    if (instStatus !== 'connected' && instStatus !== 'open') {
      return { ok: false, error: 'whatsapp_not_connected' };
    }

    const numberTo = toUazRecipientNumber(
      (conversation as { canonical_phone?: string }).canonical_phone || conversation.phone_number,
      conversation.external_chat_id,
    );
    if (!numberTo) {
      return { ok: false, error: 'no_recipient_number' };
    }

    const caption = (input.caption ?? '').trim() || '';
    const localTrackId = `kanban_auto_media_${randomUUID()}`;
    const provisionalExternalId = `local:${randomUUID()}`;
    const metaBase: Record<string, unknown> = {
      source: input.metadataSource ?? 'kanban_auto_media',
      track_id: localTrackId,
      provisional: true,
    };
    if (input.automationRef) {
      metaBase.board_id = input.automationRef.boardId;
      metaBase.column_id = input.automationRef.columnId;
      metaBase.card_id = input.automationRef.cardId;
    }
    if (input.whatsappModelTrace) {
      metaBase.whatsapp_model_template_id = input.whatsappModelTrace.template_id;
      metaBase.whatsapp_model_item_index = input.whatsappModelTrace.item_index;
      metaBase.whatsapp_model_item_type = input.whatsappModelTrace.message_type;
    }

    const messageKind = input.type === 'document' ? 'document' : 'image';
    const saveResult = await saveMessage(conversation.id, 'outgoing', {
      externalMessageId: provisionalExternalId,
      body: caption || null,
      media: [{ type: input.type, url: resolvedMedia.persistedUrl, mimetype: resolvedMedia.mimeType }],
      messageKind,
      status: 'queued',
      sentAt: new Date(),
      metadata: metaBase,
    });
    const savedRowId = saveResult.rowId;
    queuedMessageRowId = savedRowId;

    const trackSource =
      input.metadataSource === 'manual_whatsapp_model' || input.metadataSource === 'kanban_whatsapp_model'
        ? 'painelcrm_whatsapp_model'
        : 'painelcrm_kanban_auto';

    const inferredFileName = extractOutgoingFileName({
      fileName: input.fileName ?? null,
      storagePath: input.storagePath ?? null,
      fileUrl: input.fileUrl ?? null,
    });
    const messageResponse = (await uazapiService.sendMediaMessage(conversation.instance_token, {
      number: numberTo,
      type: input.type,
      file:
        input.type === 'document' &&
        typeof resolvedMedia.fileForProvider === 'string' &&
        resolvedMedia.fileForProvider.startsWith('data:') &&
        isPublicHttpUrl(absolutizeOutgoingMediaUrl(resolvedMedia.persistedUrl))
          ? (absolutizeOutgoingMediaUrl(resolvedMedia.persistedUrl) as string)
          : resolvedMedia.fileForProvider,
      ...(inferredFileName
        ? {
            fileName: inferredFileName,
            filename: inferredFileName,
            documentName: inferredFileName,
            docName: inferredFileName,
            file_name: inferredFileName,
            name: inferredFileName,
          }
        : {}),
      ...(resolvedMedia.mimeType ? { mimeType: resolvedMedia.mimeType, mimetype: resolvedMedia.mimeType } : {}),
      ...(caption ? { text: caption } : {}),
      readchat: false,
      readmessages: false,
      delay: 0,
      track_source: trackSource,
      track_id: localTrackId,
    })) as AnyObject;

    const extId = extractUazOutgoingMessageId(messageResponse);
    const remoteUrl =
      absolutizeOutgoingMediaUrl(resolvedMedia.persistedUrl) ||
      absolutizeOutgoingMediaUrl((messageResponse as any)?.response?.fileUrl) ||
      absolutizeOutgoingMediaUrl((messageResponse as any)?.fileUrl) ||
      absolutizeOutgoingMediaUrl((messageResponse as any)?.url) ||
      null;
    const shouldPreferDataUrlForModelDocument =
      input.type === 'document' &&
      (input.metadataSource === 'manual_whatsapp_model' || input.metadataSource === 'kanban_whatsapp_model') &&
      typeof resolvedMedia.fileForProvider === 'string' &&
      resolvedMedia.fileForProvider.startsWith('data:');
    const uiMediaUrl =
      shouldPreferDataUrlForModelDocument ||
      (input.type !== 'document' &&
        typeof resolvedMedia.fileForProvider === 'string' &&
        resolvedMedia.fileForProvider.startsWith('data:'))
        ? resolvedMedia.fileForProvider
        : remoteUrl || resolvedMedia.persistedUrl;

    const mediaItems: ChatMediaItem[] = [
      {
        type: input.type,
        url: uiMediaUrl,
        mimetype: resolvedMedia.mimeType,
        fileName: inferredFileName || null,
      },
    ];

    if (savedRowId) {
      const nextStatus = pickBestOutgoingStatus('queued', 'provider_sent') ?? 'provider_sent';
      await pool.query(
        `
          UPDATE chat_messages
          SET
            external_message_id = COALESCE($1, external_message_id),
            status = $2,
            media = CASE
              WHEN $4::jsonb IS NOT NULL
                AND jsonb_typeof($4::jsonb) = 'array'
                AND jsonb_array_length($4::jsonb) > 0
              THEN $4::jsonb
              ELSE media
            END,
            metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
            sent_at = COALESCE(sent_at, $5::timestamptz)
          WHERE id = $6
        `,
        [
          extId,
          nextStatus,
          JSON.stringify({ ...messageResponse, track_id: localTrackId }),
          JSON.stringify(mediaItems),
          new Date(),
          savedRowId,
        ],
      );
    }

    try {
      const instRow = await fetchInstanceForOperate(input.actorUserId, conversation.instance_id);
      if (instRow) {
        void fetchAndUpsertRemoteChatIdentity(instRow as ChatInstanceRow, conversation.external_chat_id).catch(
          (idErr: any) => console.warn('[KanbanAutoMedia] identity refresh failed:', idErr?.message),
        );
      }
    } catch {
      /* não bloquear */
    }

    await new Promise((resolve) => setTimeout(resolve, 50));

    const leadColumnAvailableWs = await hasLeadIdColumn();
    const [updatedConversationResult, savedMessageResult] = await Promise.all([
      pool.query(
        `
          SELECT
            c.id,
            c.user_id,
            c.instance_id,
            c.provider,
            c.external_chat_id,
            c.external_fast_id,
            c.contact_name,
            c.profile_name,
            c.phone_number,
            c.display_name,
            c.avatar_url,
            c.status,
            c.last_message_preview,
            c.last_message_at,
            c.unread_count,
            c.metadata,
            c.created_at,
            c.updated_at,
            c.client_id,
            ${leadColumnAvailableWs ? 'c.lead_id,' : 'NULL::uuid as lead_id,'}
            c.phone_key,
            c.assigned_to_user_id,
            c.assigned_team_id,
            i.name as instance_name,
            CASE
              WHEN c.client_id IS NOT NULL THEN 'client_linked'
              WHEN ${leadColumnAvailableWs ? 'c.lead_id IS NOT NULL' : 'false'} THEN 'lead_linked'
              WHEN COALESCE((c.metadata->>'link_confidence'), '') = 'review' THEN 'review_required'
              ELSE 'unlinked'
            END as link_state,
            COALESCE(c.metadata->>'link_source', 'system') as link_source,
            COALESCE(c.metadata->>'link_confidence', 'review') as link_confidence,
            CASE
              WHEN ${leadColumnAvailableWs ? 'c.lead_id IS NOT NULL' : 'false'} THEN (
                SELECT l2.status FROM leads l2 WHERE l2.id = c.lead_id AND l2.user_id = c.user_id LIMIT 1
              )
              ELSE NULL
            END as lead_status
          FROM chat_conversations c
          INNER JOIN chat_instances i ON i.id = c.instance_id
          WHERE c.id = $1
        `,
        [input.conversationId],
      ),
      savedRowId ? pool.query(`SELECT * FROM chat_messages WHERE id = $1`, [savedRowId]) : Promise.resolve({ rows: [] as any[] }),
    ]);

    if (updatedConversationResult.rows.length > 0) {
      try {
        emitConversationUpdate(input.actorUserId, updatedConversationResult.rows[0]);
      } catch (wsError: any) {
        console.warn('[KanbanAutoMedia] Failed to emit conversation update:', wsError.message);
      }

      if (savedMessageResult.rows.length > 0) {
        const row: any = savedMessageResult.rows[0];
        try {
          const contract = contractFromDbRow(row);
          emitNewMessage(
            input.actorUserId,
            {
              id: row.id,
              conversation_id: conversation.id,
              direction: row.direction,
              body: row.body,
              sent_at: row.sent_at || new Date(),
              status: row.status,
              external_message_id: row.external_message_id,
              media: row.media,
              message_contract: contract,
            },
            conversation.id,
          );
        } catch (wsError: any) {
          console.warn('[KanbanAutoMedia] Failed to emit new message:', wsError.message);
        }
      }
    }

    return { ok: true };
  } catch (error: any) {
    console.error('[KanbanAutoMedia] send failed', {
      conversationId: input.conversationId,
      type: input.type,
      error: error?.message || error,
    });
    if (queuedMessageRowId) {
      try {
        await pool.query(
          `
          UPDATE chat_messages
          SET
            status = 'failed',
            metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
          WHERE id = $2
          `,
          [JSON.stringify({ send_error: error?.message || String(error) }), queuedMessageRowId],
        );
      } catch (markErr: any) {
        console.warn('[KanbanAutoMedia] Failed to mark queued message as failed:', markErr?.message);
      }
    }
    return { ok: false, error: error?.message || 'send_failed' };
  }
}

export async function markConversationRead(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    
    console.log('[MarkRead] Starting mark conversation as read', {
      userId,
      conversationId: id,
    });

    const payload = markReadSchema.parse(req.body || { read: true });

    const conversationResult = await pool.query(
      `
        SELECT c.*, i.instance_token
        FROM chat_conversations c
        INNER JOIN chat_instances i ON i.id = c.instance_id
        WHERE c.id = $1 AND ${SQL_CHAT_ACCESS_PREDICATE}
      `,
      [id, userId]
    );

    if (conversationResult.rowCount === 0) {
      console.warn('[MarkRead] Conversation not found', { conversationId: id, userId });
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }

    const conversation = conversationResult.rows[0];
    const identifier =
      conversation.external_chat_id ||
      conversation.phone_number ||
      (conversation.metadata?.wa_chatid ?? null);

    if (!identifier) {
      console.warn('[MarkRead] No identifier found', {
        conversationId: id,
        external_chat_id: conversation.external_chat_id,
        phone_number: conversation.phone_number,
        metadata: conversation.metadata,
      });
      res.status(400).json({ error: 'Conversation has no WhatsApp identifier' });
      return;
    }

    // Tentar marcar como lida na UazAPI (pode falhar, mas não é crítico)
    try {
      await uazapiService.readChat(conversation.instance_token, {
        number: identifier,
        read: payload.read,
      });
      console.log('[MarkRead] Successfully marked as read in UazAPI', {
        conversationId: id,
        identifier,
      });
    } catch (uazapiError: any) {
      // Não falhar se UazAPI der erro - apenas logar
      console.warn('[MarkRead] Failed to mark as read in UazAPI (non-critical):', {
        error: uazapiError.message,
        conversationId: id,
        identifier,
      });
    }

    // Sempre atualizar no banco de dados local
    if (payload.read) {
      await pool.query(
        `
          UPDATE chat_conversations
          SET unread_count = 0, updated_at = now()
          WHERE id = $1
        `,
        [conversation.id]
      );
      console.log('[MarkRead] Updated unread_count to 0 in database', {
        conversationId: id,
      });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('[MarkRead] Error updating read status:', {
      error: error.message,
      stack: error.stack,
      conversationId: req.params.id,
      userId: req.userId,
    });
    res.status(500).json({ error: error.message || 'Failed to update read status' });
  }
}

/**
 * Extrai informações de mensagem de diferentes formatos de payload
 */
function extractMessageData(payload: any): {
  message: any;
  chatId: string | null;
  direction: 'incoming' | 'outgoing';
  messageType: string | null;
  isGroup: boolean;
} {
  // Tentar diferentes formatos de payload
      const data = payload.data || payload.message || payload;
  const message = mergeMessageEnvelope(data);

  // Extrair chatId de múltiplas fontes (envelope já unificado em `message`)
      const chatId =
    message.wa_chatid ||
        message.chatid ||
        message.chatId ||
        message.chat?.id ||
        message.key?.remoteJid ||
    message.remoteJid ||
        message.number ||
        null;

  // Determinar direção
  const direction: 'incoming' | 'outgoing' =
    message.fromMe || message.wasSentByApi ? 'outgoing' : 'incoming';

  // Tipo de mensagem
  const messageType =
    message.type ||
    message.messageType ||
    message.msgType ||
    (message.text ? 'text' : null) ||
    (message.image || message.imageMessage ? 'image' : null) ||
    (message.video || message.videoMessage ? 'video' : null) ||
    (message.audio || message.audioMessage || message.pttMessage ? 'audio' : null) ||
    (message.document || message.documentMessage ? 'document' : null) ||
    (message.sticker || message.stickerMessage ? 'sticker' : null) ||
    (message.location ? 'location' : null) ||
    (message.contact ? 'contact' : null) ||
    null;

  // Verificar se é grupo
  const isGroup =
    chatId?.endsWith('@g.us') ||
    chatId?.includes('@g.us') ||
    message.isGroup ||
    false;

  return {
    message,
    chatId,
    direction,
    messageType,
    isGroup,
  };
}

/**
 * Obtém URL de mídia via `POST /message/download` quando find/webhook não traz `fileURL`.
 * Testa id normalizado (`5511…:3EB0…` → só `3EB0…`) e o id completo.
 */
async function fetchIncomingMediaViaDownload(
  instanceToken: string,
  message: any,
  kindHint: ChatMessageKind
): Promise<ChatMediaItem[]> {
  const rawId = extractUazDownloadMessageId(message);
  if (!rawId) return [];
  const norm = normalizeIdForUazDownload(rawId);
  const idVariants = norm === rawId ? [rawId] : [norm, rawId];
  const uniqueIds = Array.from(new Set(idVariants.filter((x) => x.length > 0)));
  for (const id of uniqueIds) {
    try {
      const dl = (await uazapiService.downloadMessageMedia(instanceToken, {
        id,
        return_link: true,
      })) as AnyObject;
      const items = mediaItemsFromDownloadPayload(dl, kindHint);
      if (items.length > 0) return items;
    } catch {
      continue;
    }
  }
  return [];
}

/**
 * Converte timestamp para Date
 */
function parseTimestamp(timestamp: any): Date | null {
  if (!timestamp) return null;

  // Se já é Date
  if (timestamp instanceof Date) return timestamp;

  // Se é número
  const numeric = Number(timestamp);
  if (!Number.isNaN(numeric)) {
    // Se está em segundos (menor que 1e12), converter para milissegundos
    return new Date(numeric > 1e12 ? numeric : numeric * 1000);
  }

  // Se é string, tentar parse
  if (typeof timestamp === 'string') {
    const parsed = Date.parse(timestamp);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed);
    }
  }

  return null;
}

/**
 * Processa eventos de webhook de forma assíncrona
 * Esta função é chamada após responder ao webhook para não bloquear a resposta
 */
async function processWebhookEvent(instance: ChatInstanceRow, payload: any, event: string) {
  const startTime = Date.now();
  const webhookId = randomUUID();
  const tenantId = await resolveTenantIdForUser(instance.user_id);

  try {
    console.log(`[Webhook ${webhookId}] ===== STARTING EVENT PROCESSING =====`, {
      instanceId: instance.id,
      instanceName: instance.name,
      instanceExternalName: instance.external_instance_name,
      event,
      timestamp: new Date().toISOString(),
      payloadSize: JSON.stringify(payload).length,
      payloadKeys: Object.keys(payload),
      payloadPreview: JSON.stringify(payload).substring(0, 500),
    });

    if (event === 'messages' || payload.message) {
      const extracted = extractMessageData(payload);

      // Ignorar apenas eco da API (evita duplicar o que sendMessage já persistiu).
      // Mensagens fromMe enviadas pelo WhatsApp no celular (sem wasSentByApi) precisam ser processadas.
      if (extracted.message.wasSentByApi) {
        console.log(`[Webhook ${webhookId}] Skipping API-sent message (wasSentByApi)`, {
          messageId: extracted.message.id || extracted.message.messageId,
          direction: extracted.direction,
        });
        return;
      }

      if (!extracted.chatId) {
        console.warn(`[Webhook ${webhookId}] No chatId found in message payload`, {
          payloadKeys: Object.keys(payload),
        });
        return;
      }

      // Extrair informações adicionais do payload
      const data = payload.data || payload.message || payload;
      const message = extracted.message;

      // Muitos provedores (incluindo UazAPI) enviam um objeto de chat separado
      // com campos como wa_contactName, name, image, etc.
      // Damos preferência a essas informações para preencher corretamente
      // o nome e a foto do contato no CRM.
      const baseChat =
        (data && (data.chat || data.contact || data.conversation)) ||
        (message && (message.chat || message.contact || message.conversation)) ||
        {};

      // Preparar dados para conversa, combinando:
      // - dados do chat (nome, imagem, etc.)
      // - dados do payload/data
      // - dados da mensagem
      const chatData = normalizeChatPayload({
        ...baseChat,
          ...data,
          ...message,
        wa_chatid: extracted.chatId,
          wa_lastMsgTimestamp: message.timestamp || message.messageTimestamp,
        wa_lastMsgText: extractMessageBody(message),
        isGroup: extracted.isGroup,
      });

      if (!chatData) {
        console.warn(`[Webhook ${webhookId}] Failed to normalize chat payload`);
        return;
      }

      if (
        !isWhatsappGroupsEnabled() &&
        (extracted.isGroup === true || chatData.externalChatId?.endsWith('@g.us'))
      ) {
        return;
      }

      // Criar ou atualizar conversa
      console.log(`[Webhook ${webhookId}] Attempting to upsert conversation`, {
        chatId: extracted.chatId,
        chatDataKeys: Object.keys(chatData),
        hasExternalChatId: !!chatData.externalChatId,
        hasContactName: !!chatData.contactName,
      });

      const ccId = await syncCommunicationContactFromNormalized(tenantId, chatData);
      const conversation = await upsertConversation(instance, chatData, { communicationContactId: ccId });

      if (!conversation) {
        console.error(`[Webhook ${webhookId}] Failed to upsert conversation`, {
          chatId: extracted.chatId,
          chatData: {
            externalChatId: chatData.externalChatId,
            contactName: chatData.contactName,
            phoneNumber: chatData.phoneNumber,
          },
        });
        return;
      }

      console.log(`[Webhook ${webhookId}] Conversation upserted successfully`, {
        conversationId: conversation.id,
        externalChatId: conversation.external_chat_id,
        contactName: conversation.contact_name,
      });

      // Extrair informações da mensagem
      const messageBody = extractMessageBody(message);
      let media = extractMediaInfo(message);
      const msgKind = inferMessageTypeFromPayload(message);
      const msgBodyPlain = ensurePlainString(messageBody ?? '');
      if (media.length === 0 && msgKind !== 'text' && msgKind !== 'unknown') {
        media = buildPersistentMediaStubForKind(message, msgKind);
      }
      const hasRenderableUrl = mediaItemsHaveRenderableUrl(media);
      const tryMediaDownload =
        !hasRenderableUrl &&
        !msgBodyPlain &&
        instance.instance_token &&
        ((extracted.direction === 'incoming' &&
          (msgKind === 'image' ||
            msgKind === 'video' ||
            msgKind === 'audio' ||
            msgKind === 'document' ||
            msgKind === 'sticker' ||
            msgKind === 'unknown')) ||
          (extracted.direction === 'outgoing' && msgKind === 'unknown'));
      if (tryMediaDownload) {
        const hint: ChatMessageKind = msgKind === 'unknown' ? 'image' : msgKind;
        const fromDl = await fetchIncomingMediaViaDownload(
          instance.instance_token,
          message,
          hint
        );
        if (fromDl.length > 0) {
          media = fromDl;
          console.log(`[Webhook ${webhookId}] Media resolved via /message/download`, {
            kind: hint,
            direction: extracted.direction,
          });
        } else {
          const stubLeft =
            media.length > 0 &&
            media.some(
              (it) =>
                (it as ChatMediaItem & { persistentStub?: boolean }).persistentStub === true ||
                (typeof it.url === 'string' && it.url.startsWith('data:'))
            );
          if (stubLeft) {
            console.warn(`[Webhook ${webhookId}] media_download_failed_preserved_stub`, {
              kind: hint,
              direction: extracted.direction,
            });
          } else if (msgKind !== 'unknown') {
            media = buildPersistentMediaStubForKind(message, msgKind);
            console.warn(`[Webhook ${webhookId}] media_download_failed_preserved_stub rebuilt`, {
              kind: msgKind,
              direction: extracted.direction,
            });
          }
        }
      }

      const sentAt = parseTimestamp(message.timestamp || message.messageTimestamp);
      const messageId =
        message.id ||
        message.messageId ||
        message.messageid ||
        message.key?.id ||
        data.external_message_id ||
        null;

      if (!messageId) {
        console.warn(`[Webhook ${webhookId}] No messageId found`, {
          messageKeys: Object.keys(message),
        });
        // Continuar mesmo sem messageId, mas gerar um
      }

      // Salvar mensagem
      console.log(`[Webhook ${webhookId}] Attempting to save message`, {
        conversationId: conversation.id,
        messageId,
        direction: extracted.direction,
        bodyPreview: messageBody?.substring(0, 50),
        hasMedia: media.length > 0,
      });

      const effectiveMessageId =
        messageId ||
        randomUUID();

      const groupMsgMeta =
        extracted.isGroup || extracted.chatId?.endsWith('@g.us')
          ? extractGroupMessageMetadataForDb(message as Record<string, unknown>)
          : {};
      if (Object.keys(groupMsgMeta).length > 0 && process.env.CHAT_GROUP_DEBUG === '1') {
        console.log('[chat-group-message]', {
          conversationId: conversation.id,
          direction: extracted.direction,
          has_sender_name: typeof groupMsgMeta.sender_name === 'string',
        });
      }
      const saveResult = await saveMessage(conversation.id, extracted.direction, {
        externalMessageId: effectiveMessageId,
        body: messageBody || null,
        media: media.length > 0 ? media : [],
        messageKind: inferMessageTypeFromPayload(message),
        status:
          extracted.direction === 'outgoing'
            ? (pickBestOutgoingStatus('provider_sent', message.status) ?? 'provider_sent')
            : (message.status || null),
        sentAt: sentAt || new Date(),
        metadata: {
          ...(message && typeof message === 'object' ? (message as Record<string, unknown>) : {}),
          ...groupMsgMeta,
          messageType: extracted.messageType,
          isGroup: extracted.isGroup,
          originalPayload: payload,
        },
      });
      const savedRowId = saveResult.rowId;

      console.log(`[Webhook ${webhookId}] Message saved successfully`, {
        conversationId: conversation.id,
        messageId: effectiveMessageId,
        savedRowId,
      });

      // Emitir WebSocket com conversa recalculada (last_message_* após saveMessage)
      try {
        const freshRow = await pool.query(`SELECT * FROM chat_conversations WHERE id = $1`, [conversation.id]);
        const conversationWithInstance = {
          ...(freshRow.rows[0] || conversation),
          instance_name: instance.name,
        };

        console.log(`[Webhook ${webhookId}] Emitting conversation update via WebSocket`, {
          userId: instance.user_id,
          conversationId: conversation.id,
        });
        emitConversationUpdate(instance.user_id, conversationWithInstance);
        if (tenantId) {
          const wProv = (conversationWithInstance as { provider?: string }).provider;
          emitToTenant(
            tenantId,
            'conversation.updated',
            buildConversationUpdatedPayload({
              provider: (wProv as typeof DEFAULT_COMMUNICATION_PROVIDER) ?? DEFAULT_COMMUNICATION_PROVIDER,
              conversation_id: conversation.id,
              last_message_preview: conversationWithInstance.last_message_preview ?? null,
              last_message_at: conversationWithInstance.last_message_at ?? null,
              unread_count: conversationWithInstance.unread_count ?? 0,
              status: conversationWithInstance.status ?? null,
              assigned_user_id: conversationWithInstance.assigned_to_user_id ?? null,
              assigned_team_id: conversationWithInstance.assigned_team_id ?? null,
              display_name: conversationWithInstance.display_name ?? null,
              avatar_url: conversationWithInstance.avatar_url ?? null,
            })
          );
        }

        let wsMessagePayload: Record<string, unknown> = {
          id: effectiveMessageId,
          conversation_id: conversation.id,
          direction: extracted.direction,
          body: messageBody,
          sent_at: sentAt || new Date(),
        };
        if (savedRowId) {
          const msgRow = await pool.query(`SELECT * FROM chat_messages WHERE id = $1`, [savedRowId]);
          const row = msgRow.rows[0];
          if (row) {
            const contract = contractFromDbRow(row);
            wsMessagePayload = {
              id: row.id,
              conversation_id: conversation.id,
              direction: row.direction,
              body: row.body,
              sent_at: row.sent_at,
              status: row.status,
              external_message_id: row.external_message_id,
              media: row.media,
              message_contract: contract,
              reply_to_message_id: row.reply_to_message_id ?? null,
              reply_to_external_message_id: row.reply_to_external_message_id ?? null,
              reply_preview: row.reply_preview ?? null,
              reply_sender_name: row.reply_sender_name ?? null,
              reply_message_type: row.reply_message_type ?? null,
            };
          }
        }

        if (saveResult.inserted) {
          console.log(`[Webhook ${webhookId}] Emitting new message via WebSocket`, {
            userId: instance.user_id,
            conversationId: conversation.id,
            wsId: wsMessagePayload.id,
          });
          emitNewMessage(instance.user_id, wsMessagePayload, conversation.id);
          if (tenantId) {
            const media = Array.isArray((wsMessagePayload as Record<string, unknown>).media)
              ? ((wsMessagePayload as Record<string, unknown>).media as Array<Record<string, unknown>>)
              : [];
            const mediaUrlRawW = media.find((m) => typeof m?.url === 'string' && m.url)?.url;
            const mediaUrl = typeof mediaUrlRawW === 'string' ? mediaUrlRawW : null;
            const convProvW = (conversation as { provider?: string }).provider;
            emitToTenant(
              tenantId,
              'message.created',
              buildMessageCreatedPayload({
                provider: (convProvW as typeof DEFAULT_COMMUNICATION_PROVIDER) ?? DEFAULT_COMMUNICATION_PROVIDER,
                conversation_id: conversation.id,
                message_id:
                  wsMessagePayload.id == null ? null : String(wsMessagePayload.id as string | number),
                direction: String(wsMessagePayload.direction ?? extracted.direction),
                body:
                  (wsMessagePayload.body == null ? null : String(wsMessagePayload.body)) ??
                  messageBody ??
                  null,
                message_type: String(
                  (wsMessagePayload as { message_contract?: { kind?: string } }).message_contract?.kind ??
                    msgKind,
                ),
                media_url: mediaUrl,
                sent_at: (wsMessagePayload.sent_at as Date | string) ?? sentAt ?? new Date().toISOString(),
                provider_message_id: effectiveMessageId,
                reply_to_message_id:
                  (wsMessagePayload as { reply_to_message_id?: unknown }).reply_to_message_id == null
                    ? null
                    : String((wsMessagePayload as { reply_to_message_id?: unknown }).reply_to_message_id),
                reply_preview:
                  (wsMessagePayload as { reply_preview?: unknown }).reply_preview == null
                    ? null
                    : String((wsMessagePayload as { reply_preview?: unknown }).reply_preview),
                reply_sender_name:
                  (wsMessagePayload as { reply_sender_name?: unknown }).reply_sender_name == null
                    ? null
                    : String((wsMessagePayload as { reply_sender_name?: unknown }).reply_sender_name),
                reply_message_type:
                  (wsMessagePayload as { reply_message_type?: unknown }).reply_message_type == null
                    ? null
                    : String((wsMessagePayload as { reply_message_type?: unknown }).reply_message_type),
              })
            );
          }
        }
      } catch (wsError: any) {
        console.error(`[Webhook ${webhookId}] Failed to emit WebSocket events:`, {
          error: wsError.message,
          stack: wsError.stack,
        });
      }

      // Criar notificação para mensagens recebidas (incoming)
      if (extracted.direction === 'incoming' && saveResult.inserted) {
        try {
          await notificationService.notifyNewMessage(instance.user_id, {
            conversationId: conversation.id,
            conversationName: conversation.contact_name || conversation.profile_name || conversation.phone_number,
            phoneNumber: conversation.phone_number ?? undefined,
            messagePreview: ensurePlainString(messageBody),
            messageId: effectiveMessageId,
            isGroup: extracted.isGroup,
          });
        } catch (notifError: any) {
          // Não falhar o processamento se notificação falhar
          console.warn(`[Webhook ${webhookId}] Failed to create notification:`, {
            error: notifError.message,
          });
        }
      }

      console.log(`[Webhook ${webhookId}] Message saved successfully`, {
        conversationId: conversation.id,
        messageId: effectiveMessageId,
        direction: extracted.direction,
        messageType: extracted.messageType,
        isGroup: extracted.isGroup,
        hasMedia: media.length > 0,
        bodyLength: messageBody?.length || 0,
        processingTime: Date.now() - startTime,
      });
    } else if (event === 'messages_update') {
      // Atualizar status de mensagens existentes
      const data = payload.data || payload;
      const mergedUpdate = mergeMessageEnvelope(data);
      const messageUpdate = mergedUpdate && typeof mergedUpdate === 'object' ? mergedUpdate : (data.message || data);

      const rawMessageId =
        messageUpdate?.id ||
        messageUpdate?.messageId ||
        messageUpdate?.messageid ||
        messageUpdate?.key?.id ||
        data.external_message_id ||
        null;

      if (!rawMessageId) {
        console.warn(`[Webhook ${webhookId}] No messageId in messages_update event`);
        return;
      }

      const normalizedId = normalizeIdForUazDownload(String(rawMessageId));
      const idVariants = Array.from(new Set([String(rawMessageId), normalizedId]));

      const readAt = messageUpdate?.readTimestamp
        ? parseTimestamp(messageUpdate.readTimestamp)
        : null;
      const deliveredAt = messageUpdate?.deliveredTimestamp
        ? parseTimestamp(messageUpdate.deliveredTimestamp)
        : null;
      const statusHintRaw =
        readAt ? 'read' : deliveredAt ? 'delivered' : (messageUpdate?.status || messageUpdate?.messageStatus);
      const statusIncoming = pickBestOutgoingStatus(null, statusHintRaw);

      const updateResult = await pool.query(
        `
        UPDATE chat_messages m
        SET
          status = CASE
            WHEN $1::text IS NULL THEN m.status
            ELSE $1::text
          END,
          metadata = COALESCE(m.metadata, '{}'::jsonb) || $2::jsonb
        FROM chat_conversations c
        WHERE
          m.conversation_id = c.id
          AND c.instance_id = $3
          AND (
            m.external_message_id = ANY($4::text[])
            OR COALESCE(m.metadata->>'track_id', '') = COALESCE($5, '__none__')
          )
        RETURNING
          m.id,
          m.conversation_id,
          m.direction,
          m.external_message_id,
          m.status
        `,
        [
          statusIncoming,
          JSON.stringify({
            webhook_messages_update: messageUpdate,
            readAt: readAt?.toISOString(),
            deliveredAt: deliveredAt?.toISOString(),
            updatedAt: new Date().toISOString(),
          }),
          instance.id,
          idVariants,
          (typeof messageUpdate?.track_id === 'string' && messageUpdate.track_id.trim())
            ? messageUpdate.track_id.trim()
            : null,
        ]
      );

      if (updateResult.rowCount === 0) {
        console.warn(`[Webhook ${webhookId}] Message not found for update`, {
          rawMessageId,
          idVariants,
        });
        return;
      }

      for (const updatedMessage of updateResult.rows) {
        const rowRes = await pool.query(`SELECT * FROM chat_messages WHERE id = $1`, [updatedMessage.id]);
        const row = rowRes.rows[0];
        if (row) {
          const contract = contractFromDbRow(row);
          emitMessageUpdated(
            instance.user_id,
            {
              id: row.id,
              conversation_id: row.conversation_id,
              direction: row.direction,
              body: row.body,
              sent_at: row.sent_at,
              status: row.status,
              external_message_id: row.external_message_id,
              media: row.media,
              message_contract: contract,
            },
            row.conversation_id
          );
        }
      }

      console.log(`[Webhook ${webhookId}] Message status updated`, {
        rawMessageId,
        idVariants,
        normalizedStatus: statusIncoming,
        updatedRows: updateResult.rowCount,
        readAt: readAt?.toISOString(),
        deliveredAt: deliveredAt?.toISOString(),
        processingTime: Date.now() - startTime,
      });
    } else if (event === 'chats' || payload.chat) {
      // Atualizar informações da conversa (sem criar mensagem)
      const data = payload.data || payload.chat || payload;
      const chatData = normalizeChatPayload(data);

      if (!chatData) {
        console.warn(`[Webhook ${webhookId}] Failed to normalize chat data in chats event`);
        return;
      }

      if (
        !isWhatsappGroupsEnabled() &&
        deriveConversationTypeFromNormalized(chatData) === 'group'
      ) {
        return;
      }

      const ccIdChats = await syncCommunicationContactFromNormalized(tenantId, chatData);
      const conversation = await upsertConversation(instance, chatData, { communicationContactId: ccIdChats });

      if (conversation) {
        if (tenantId) {
          emitToTenant(
            tenantId,
            'conversation.updated',
            buildConversationUpdatedPayload({
              provider: DEFAULT_COMMUNICATION_PROVIDER,
              conversation_id: String(conversation.id),
              last_message_preview:
                (conversation as { last_message_preview?: string | null }).last_message_preview ?? null,
              last_message_at:
                (conversation as { last_message_at?: Date | string | null }).last_message_at ?? null,
              unread_count: Number((conversation as { unread_count?: number }).unread_count ?? 0),
              status: (conversation as { status?: string | null }).status ?? null,
              assigned_user_id:
                (conversation as { assigned_to_user_id?: string | null }).assigned_to_user_id ?? null,
              assigned_team_id:
                (conversation as { assigned_team_id?: string | null }).assigned_team_id ?? null,
              display_name:
                (conversation as { display_name?: string | null }).display_name ??
                (conversation as { contact_name?: string | null }).contact_name ??
                null,
              avatar_url: (conversation as { avatar_url?: string | null }).avatar_url ?? null,
            }),
          );
        }
        // Verificar se é uma nova conversa (sem mensagens ainda)
        const messageCount = await pool.query(
          'SELECT COUNT(*) as count FROM chat_messages WHERE conversation_id = $1',
          [conversation.id]
        );
        const isNewConversation = parseInt(messageCount.rows[0].count, 10) === 0;

        // Criar notificação para nova conversa
        if (isNewConversation) {
          try {
            await notificationService.notifyNewConversation(instance.user_id, {
              conversationId: conversation.id,
              conversationName: chatData.contactName || chatData.profileName,
              phoneNumber: chatData.phoneNumber ?? undefined,
              isGroup: chatData.externalChatId?.endsWith('@g.us') || false,
            });
          } catch (notifError: any) {
            console.warn(`[Webhook ${webhookId}] Failed to create new conversation notification:`, {
              error: notifError.message,
            });
          }
        }

        console.log(`[Webhook ${webhookId}] Chat updated`, {
          conversationId: conversation.id,
          externalChatId: chatData.externalChatId,
          contactName: chatData.contactName,
          unreadCount: chatData.unreadCount,
          isNewConversation,
          processingTime: Date.now() - startTime,
        });
      } else {
        console.warn(`[Webhook ${webhookId}] Failed to upsert conversation in chats event`);
      }
    } else if (event === 'connection') {
      const data = payload.data || payload;
      const state = data.state || data.status;

      // Buscar estado anterior para detectar mudanças
      const previousState = instance.metadata?.connection?.state || instance.status;

      // Atualizar status da conexão na instância
      await pool.query(
        `
        UPDATE chat_instances
        SET 
          status = CASE 
            WHEN $1 = 'open' OR $1 = 'connected' THEN 'connected'
            WHEN $1 = 'close' OR $1 = 'disconnected' THEN 'disconnected'
            ELSE status
          END,
          metadata = metadata || $2::jsonb, 
          updated_at = now()
        WHERE id = $3
        `,
        [
          state,
          JSON.stringify({
            connection: {
              state,
              lastUpdate: new Date().toISOString(),
            },
          }),
          instance.id,
        ]
      );

      // Se conectou pela primeira vez, configurar webhook automaticamente
      if ((state === 'open' || state === 'connected') && 
          (previousState !== 'open' && previousState !== 'connected')) {
        try {
          // Buscar instância atualizada
          const updatedInstance = await pool.query<ChatInstanceRow>(
            'SELECT * FROM chat_instances WHERE id = $1',
            [instance.id]
          );
          if (updatedInstance.rows[0]) {
            console.log(`[Webhook ${webhookId}] Instance connected, auto-configuring webhook...`);
            await autoConfigureWebhook(updatedInstance.rows[0]);
          }
        } catch (webhookError: any) {
          console.warn(`[Webhook ${webhookId}] Failed to auto-configure webhook:`, {
            error: webhookError.message,
          });
        }
      }

      // Criar notificações para mudanças de conexão
      try {
        if (previousState !== state) {
          if (state === 'open' || state === 'connected') {
            if (previousState === 'close' || previousState === 'disconnected') {
              // Conexão restaurada
              await notificationService.notifyConnectionRestored(instance.user_id, {
                instanceId: instance.id,
                instanceName: instance.name,
              });
            } else {
              // Primeira conexão
              await notificationService.notifyInstanceConnected(instance.user_id, {
                instanceId: instance.id,
                instanceName: instance.name,
              });
            }
          } else if (state === 'close' || state === 'disconnected') {
            // Conexão perdida
            await notificationService.notifyConnectionLost(instance.user_id, {
              instanceId: instance.id,
              instanceName: instance.name,
            });
          }
        }
      } catch (notifError: any) {
        console.warn(`[Webhook ${webhookId}] Failed to create connection notification:`, {
          error: notifError.message,
        });
      }

      console.log(`[Webhook ${webhookId}] Connection status updated`, {
        instanceId: instance.id,
        previousState,
        newState: state,
        processingTime: Date.now() - startTime,
      });
      if (tenantId) {
        emitToTenant(
          tenantId,
          'channel.status_changed',
          buildChannelStatusPayload({
            provider: DEFAULT_COMMUNICATION_PROVIDER,
            channel_id: instance.id,
            status:
              state === 'open' || state === 'connected'
                ? 'connected'
                : state === 'close' || state === 'disconnected'
                  ? 'disconnected'
                  : String(state || instance.status || 'unknown'),
            display_name: instance.name,
            profile_avatar_url: null,
          })
        );
      }
    } else if (event === 'leads') {
      const data = payload.data || payload;
      const keys = data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data) : [];
      console.log(`[Webhook ${webhookId}] Lead event received (keys only)`, {
        dataKeys: keys.slice(0, 20),
        processingTime: Date.now() - startTime,
      });
      // TODO: Implementar processamento de leads quando necessário
    } else {
      console.log(`[Webhook ${webhookId}] Unhandled event type`, {
        event,
        payloadKeys: payload && typeof payload === 'object' ? Object.keys(payload).slice(0, 30) : [],
      });
    }
  } catch (error: any) {
    console.error(`[Webhook ${webhookId}] Error processing event:`, {
      error: error.message,
      stack: error.stack,
      event,
      instance: instance.external_instance_name,
      processingTime: Date.now() - startTime,
    });
    // Não relançar erro para não quebrar o fluxo
  }
}

registerCommunicationEngineDelegates({
  processWhatsappUazapiWebhook: processWebhookEvent,
});

function normalizeIncomingWebhookSecret(raw: unknown): string | undefined {
  const normalizeString = (value: string): string | undefined => {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    // Alguns provedores enviam o secret URL-encoded ou envolto em aspas.
    const unquoted = trimmed.replace(/^['"]+|['"]+$/g, '').trim();
    if (!unquoted) return undefined;
    try {
      const decoded = decodeURIComponent(unquoted);
      return decoded.trim() || undefined;
    } catch {
      return unquoted;
    }
  };
  if (typeof raw === 'string') {
    return normalizeString(raw);
  }
  if (Array.isArray(raw) && typeof raw[0] === 'string') {
    return normalizeString(raw[0]);
  }
      return undefined;
}

const WEBHOOK_SECRET_MIN_LENGTH = 32;

function generateWebhookSecret(): string {
  const candidate = randomBytes(32).toString('base64url');
  return candidate.length >= WEBHOOK_SECRET_MIN_LENGTH ? candidate : `${candidate}${randomBytes(8).toString('hex')}`;
}

function isSecretStrongEnough(secret: string | null | undefined): boolean {
  if (!secret || typeof secret !== 'string') return false;
  return secret.trim().length >= WEBHOOK_SECRET_MIN_LENGTH;
}

function maskSecretForLogs(secret: string | null | undefined): string | null {
  if (!secret || typeof secret !== 'string') return null;
  const t = secret.trim();
  if (!t) return null;
  if (t.length <= 6) return '***';
  return `${t.slice(0, 2)}***${t.slice(-2)}`;
}

/** SHA-256 hex curto para correlacionar logs sem expor o secret. */
function webhookSecretFingerprint(secret: string | null | undefined): string | null {
  const n = normalizeIncomingWebhookSecret(secret);
  if (!n) return null;
  return createHash('sha256').update(n, 'utf8').digest('hex').slice(0, 12);
}

function collectHttpUrlsFromRemote(node: unknown, depth = 0, out?: string[]): string[] {
  const acc = out ?? [];
  if (depth > 14 || node == null) return acc;
  if (typeof node === 'string') {
    const t = node.trim();
    if (/^https?:\/\//i.test(t)) acc.push(t);
    return acc;
  }
  if (Array.isArray(node)) {
    for (const x of node) collectHttpUrlsFromRemote(x, depth + 1, acc);
    return acc;
  }
  if (typeof node === 'object') {
    for (const v of Object.values(node as Record<string, unknown>)) {
      collectHttpUrlsFromRemote(v, depth + 1, acc);
    }
  }
  return acc;
}

function extractWebhookSecretParamsFromUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const urlStr of urls) {
    try {
      const u = new URL(urlStr);
      for (const key of ['secret', 'webhookSecret', 'token']) {
        const raw = u.searchParams.get(key);
        const n = normalizeIncomingWebhookSecret(raw);
        if (n && isSecretStrongEnough(n) && !seen.has(n)) {
          seen.add(n);
          out.push(n);
        }
      }
    } catch {
      /* ignore malformed URLs */
    }
  }
  return out;
}

/** Prefere URL que contenha `instanceId` igual ao nosso registo (fonte de verdade do provedor). */
function pickAuthoritativeSecretFromUazWebhookRemote(
  remote: unknown,
  instanceId: string,
  localSecret: string
): string | undefined {
  const urls = collectHttpUrlsFromRemote(remote);
  const matchInstance = urls.filter((u) => {
    try {
      const x = new URL(u);
      const id = x.searchParams.get('instanceId') ?? x.searchParams.get('instance_id');
      return id === instanceId;
    } catch {
      return false;
    }
  });
  const ordered = matchInstance.length > 0 ? matchInstance : urls;
  for (const urlStr of ordered) {
    try {
      const u = new URL(urlStr);
      const n = normalizeIncomingWebhookSecret(u.searchParams.get('secret'));
      if (n && isSecretStrongEnough(n) && !webhookSecretsEqual(n, localSecret)) return n;
    } catch {
      /* */
    }
  }
  const fromParams = extractWebhookSecretParamsFromUrls(ordered);
  for (const n of fromParams) {
    if (!webhookSecretsEqual(n, localSecret)) return n;
  }
  return undefined;
}

/** Secret na query da URL registada no provedor cuja instanceId coincide com a nossa linha (fonte de verdade na Uaz). */
function extractCanonicalWebhookUrlSecretForInstance(remote: unknown, instanceId: string): string | undefined {
  const urls = collectHttpUrlsFromRemote(remote);
  for (const urlStr of urls) {
    try {
      const u = new URL(urlStr);
      const id = u.searchParams.get('instanceId') ?? u.searchParams.get('instance_id');
      if (id !== instanceId) continue;
      const n = normalizeIncomingWebhookSecret(u.searchParams.get('secret'));
      if (n && isSecretStrongEnough(n)) return n;
    } catch {
      /* */
    }
  }
  return undefined;
}

function dedupeNormalizedSecrets(secrets: (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of secrets) {
    const n = normalizeIncomingWebhookSecret(s);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

function extractMetadataWebhookSecret(metadata: unknown): string | null {
  const m =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : null;
  const direct = normalizeIncomingWebhookSecret(m?.webhook_secret);
  if (direct) return direct;
  const webhook =
    m?.webhook && typeof m.webhook === 'object' && !Array.isArray(m.webhook)
      ? (m.webhook as Record<string, unknown>)
      : null;
  const nested = normalizeIncomingWebhookSecret(webhook?.webhook_secret ?? webhook?.secret);
  return nested ?? null;
}

function extractInstanceIdCandidate(req: Request, payload: Record<string, any>): string | null {
  const raw = req.query?.instanceId ?? req.query?.instance_id ?? payload.instanceId ?? payload.instance_id;
  const id =
    typeof raw === 'string'
      ? raw
      : Array.isArray(raw) && typeof raw[0] === 'string'
        ? raw[0]
        : null;
  const t = id?.trim() || '';
  return t || null;
}

function extractProviderInstanceIdCandidates(payload: Record<string, any>): string[] {
  const detailed = extractProviderInstanceIdCandidatesWithSources(payload);
  return detailed.map((d) => d.value);
}

function extractProviderInstanceIdCandidatesWithSources(
  payload: Record<string, any>,
): { source: string; value: string }[] {
  const out: { source: string; value: string }[] = [];
  const seen = new Set<string>();
  const push = (src: string, v: unknown) => {
    if (typeof v !== 'string') return;
    const t = v.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push({ source: src, value: t });
  };
  push('instance', payload.instance);
  push('instanceName', payload.instanceName);
  push('instance_name', payload.instance_name);
  push('instanceKey', payload.instanceKey);
  push('key', payload.key);
  push('externalInstanceName', payload.externalInstanceName);
  push('data.instance', payload.data?.instance);
  push('data.instanceName', payload.data?.instanceName);
  push('data.instance_name', payload.data?.instance_name);
  push('data.instanceKey', payload.data?.instanceKey);
  push('data.key', payload.data?.key);
  push('data.externalInstanceName', payload.data?.externalInstanceName);
  push('instance.name', payload.instance?.name);
  push('instance.instanceName', payload.instance?.instanceName);
  push('instance.instance_name', payload.instance?.instance_name);
  push('data.instance.name', payload.data?.instance?.name);
  push('data.instance.instanceName', payload.data?.instance?.instanceName);
  push('data.instance.instance_name', payload.data?.instance?.instance_name);
  push('instance_id', payload.instance_id);
  push('data.instance_id', payload.data?.instance_id);
  push('instanceId', payload.instanceId);
  push('data.instanceId', payload.data?.instanceId);
  push('meta.instance', payload.meta?.instance);
  push('connection.instance', payload.connection?.instance);
  push('connection.instanceName', payload.connection?.instanceName);
  return out;
}

async function ensureInstanceWebhookSecret(instance: ChatInstanceRow): Promise<string> {
  const columnSecret = normalizeIncomingWebhookSecret((instance as any).webhook_secret);
  if (columnSecret && isSecretStrongEnough(columnSecret)) return columnSecret;

  const metadataSecret = extractMetadataWebhookSecret(instance.metadata);
  const nextSecret = metadataSecret && isSecretStrongEnough(metadataSecret) ? metadataSecret : generateWebhookSecret();
  await pool.query(
    `UPDATE chat_instances
     SET webhook_secret = $1,
         webhook_secret_created_at = COALESCE(webhook_secret_created_at, now()),
         webhook_secret_version = COALESCE(webhook_secret_version, 1),
         metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
         updated_at = now()
     WHERE id = $3`,
    [nextSecret, JSON.stringify({ webhook_secret: nextSecret }), instance.id]
  );
  return nextSecret;
}

function buildInstanceWebhookUrl(instanceId: string, secret: string): string | null {
  const baseRaw =
    process.env.UAZAPI_WEBHOOK_URL ||
    (process.env.PUBLIC_API_URL ? `${process.env.PUBLIC_API_URL.replace(/\/$/, '')}/api/webhooks/uazapi` : null);
  if (!baseRaw) return null;
  const base = baseRaw.replace(/\/$/, '');
  const token = secret.trim();

  if (useLegacyQueryWebhookUrlRegistration()) {
    let u: URL;
    try {
      u = new URL(base);
    } catch {
      u = new URL(base.startsWith('http') ? base : `https://${base}`);
    }
    u.searchParams.set('instanceId', instanceId);
    u.searchParams.set('secret', token);
    return u.toString();
  }

  return `${base}/v2/${instanceId}/${encodeURIComponent(token)}`;
}

function getConfiguredWebhookSecrets(): string[] {
  const raw = process.env.UAZAPI_WEBHOOK_SECRET;
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of String(raw).split(',')) {
    const normalized = normalizeIncomingWebhookSecret(piece);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
  }
  return out;
}

/** Comparação em tempo constante; espera strings já normalizadas (trim). */
function webhookSecretsEqual(a: string, b: string): boolean {
  const x = a.trim();
  const y = b.trim();
  if (!x.length || x.length !== y.length) return false;
  try {
    return timingSafeEqual(Buffer.from(x, 'utf8'), Buffer.from(y, 'utf8'));
  } catch {
    return false;
  }
}

/**
 * Nome/label de instância no payload Uaz (prioridade: header → query → campos mais específicos do body).
 * Evita usar só o primeiro candidato da lista (ordem variável podia favorecer label antigo/stale).
 */
function extractUazWebhookInstanceExternalKey(payload: Record<string, any>, req: Request): string | null {
  const hdr = req.headers['x-uazapi-instance'];
  if (typeof hdr === 'string' && hdr.trim()) return hdr.trim();

  const qInst =
    (typeof req.query?.instance === 'string' && req.query.instance.trim()) ||
    (typeof req.query?.instanceName === 'string' && req.query.instanceName.trim()) ||
    (typeof req.query?.instance_name === 'string' && req.query.instance_name.trim());
  if (qInst) return qInst;

  const priority: unknown[] = [
    payload.data?.instanceName,
    payload.data?.instance_name,
    payload.instanceName,
    payload.instance_name,
    typeof payload.instance === 'string' ? payload.instance : undefined,
    payload.data?.instance,
    payload.key,
    payload.data?.key,
  ];
  for (const p of priority) {
    if (typeof p === 'string' && p.trim()) return p.trim();
  }

  const rest = extractProviderInstanceIdCandidates(payload);
  for (const r of rest) {
    if (r.trim()) return r.trim();
  }
  return null;
}

/**
 * Várias fontes podem vir no mesmo POST (ex.: query ?secret= da URL + campo `secret` no JSON da Uaz).
 * Antes o body tinha prioridade sobre a query; um valor errado no payload fazia falhar mesmo com URL correta.
 * Aceitamos se qualquer fonte coincidir com UAZAPI_WEBHOOK_SECRET.
 */
function collectWebhookSecretCandidates(req: Request): string[] {
  const authHdr = req.headers['authorization'];
  const bearerSecret =
    typeof authHdr === 'string' && authHdr.toLowerCase().startsWith('bearer ')
      ? authHdr.slice(7).trim()
      : undefined;
  const raw: unknown[] = [
    req.query?.secret,
    req.query?.webhookSecret,
    req.query?.token,
    req.headers['x-uazapi-secret'],
    req.headers['x-webhook-secret'],
    req.headers['x-api-secret'],
    bearerSecret,
    req.body?.secret,
    req.body?.webhookSecret,
    req.body?.signingSecret,
    req.body?.data?.secret,
    req.body?.data?.webhookSecret,
    req.body?.data?.signingSecret,
    req.body?.webhook?.secret,
    req.body?.event?.secret,
    req.body?.payload?.secret,
  ];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const n = normalizeIncomingWebhookSecret(r);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

/** Egress IPv4 observado nos webhooks Uaz (pode mudar; sobrescreva com UAZAPI_WEBHOOK_TRUST_IPS). */
const UAZ_DEFAULT_WEBHOOK_EGRESS_IPV4 = ['116.202.152.37'];

/** Secret(s) que a Uaz passa a usar na entrega — extraído do GET /webhook após configurar. */
function extractWebhookDeliverySecretsFromUazRemote(remote: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (s: string | undefined | null) => {
    const n = normalizeIncomingWebhookSecret(s);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  };
  const visitObject = (obj: unknown) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    const o = obj as Record<string, unknown>;
    for (const key of [
      'secret',
      'webhookSecret',
      'querySecret',
      'signingSecret',
      'deliverySecret',
      'hmacSecret',
      'serverSecret',
    ] as const) {
      if (typeof o[key] === 'string') push(o[key]);
    }
    if (typeof o.url === 'string') {
      try {
        const u = new URL(o.url);
        push(u.searchParams.get('secret'));
      } catch {
        const m = o.url.match(/[?&]secret=([^&]+)/i);
        if (m?.[1]) {
          try {
            push(decodeURIComponent(m[1]));
          } catch {
            push(m[1]);
          }
        }
      }
    }
  };
  const walk = (node: unknown, depth: number) => {
    if (depth > 14 || node == null) return;
    if (Array.isArray(node)) {
      for (const x of node) walk(x, depth + 1);
      return;
    }
    if (typeof node === 'object') {
      visitObject(node);
      for (const v of Object.values(node as Record<string, unknown>)) {
        if (v != null && typeof v === 'object') walk(v, depth + 1);
      }
    }
  };
  walk(remote, 0);
  for (const s of extractWebhookSecretParamsFromUrls(collectHttpUrlsFromRemote(remote))) {
    push(s);
  }
  return out;
}

function collectMetadataWebhookSecretCandidates(metadata: unknown): string[] {
  const m =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : null;
  const wh = m?.webhook;
  if (!wh || typeof wh !== 'object' || Array.isArray(wh)) return [];
  const w = wh as Record<string, unknown>;
  const raw = w.uazDeliverySecrets;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const n = normalizeIncomingWebhookSecret(typeof item === 'string' ? item : undefined);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

function instanceTokenSecretVariants(token: string): string[] {
  const t = token.trim();
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (s: string) => {
    const x = s.trim();
    if (!x || seen.has(x)) return;
    seen.add(x);
    out.push(x);
  };
  push(t);
  const noHyp = t.replace(/-/g, '');
  if (noHyp && noHyp !== t) push(noHyp);
  if (noHyp.length >= 25) {
    push(noHyp.slice(0, 25));
    push(noHyp.slice(-25));
  }
  return out;
}

function secretCandidatesMatchAnyVariantCaseRelaxed(candidates: string[], variants: string[]): boolean {
  if (!variants.length) return false;
  return candidates.some((c) =>
    variants.some(
      (v) => webhookSecretsEqual(c, v) || webhookSecretsEqual(c.toLowerCase(), v.toLowerCase())
    )
  );
}

/**
 * IPs confiáveis para validar webhooks quando o ?secret= não bate com env/token/metadata.
 * Em produção, se a env não estiver definida, usa o egress IPv4 típico da Uaz (evita fricção; a Uaz nem sempre devolve secret no GET /webhook).
 * Desligar: UAZAPI_WEBHOOK_TRUST_IPS=false (ou 0, off, none). Sobrescrever: lista separada por vírgula.
 */
function parseUazWebhookTrustIps(): string[] {
  const raw = process.env.UAZAPI_WEBHOOK_TRUST_IPS;
  if (raw !== undefined && raw !== null) {
    const t = String(raw).trim();
    if (t === '' || /^false$/i.test(t) || t === '0' || /^off$/i.test(t) || /^none$/i.test(t)) {
      return [];
    }
    return t.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  }
  if (process.env.NODE_ENV === 'production') {
    return [...UAZ_DEFAULT_WEBHOOK_EGRESS_IPV4];
  }
  return [];
}

function clientIpForWebhookTrust(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  const fromFwd =
    typeof fwd === 'string'
      ? fwd.split(',')[0]?.trim()
      : Array.isArray(fwd) && typeof fwd[0] === 'string'
        ? fwd[0].split(',')[0]?.trim()
        : '';
  const raw = (fromFwd || req.ip || req.socket?.remoteAddress || '').toString();
  return raw.replace(/^::ffff:/i, '');
}

/** Quando a Uaz envia um secret de entrega que não coincide com token nem env, permite validar por IP fixo do provedor (opt-in). */
function isUazWebhookTrustedProviderIp(req: Request): boolean {
  const allowed = parseUazWebhookTrustIps();
  if (!allowed.length) return false;
  const ip = clientIpForWebhookTrust(req);
  if (!ip) return false;
  return allowed.some((a) => ip === a || ip.endsWith(a));
}

function truncateWebhookDebugLabel(s: string, max = 36): string {
  const t = String(s).trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function instanceTokenFingerprintForLogs(token: string | null | undefined): string | null {
  const t = typeof token === 'string' ? token.trim() : '';
  if (!t) return null;
  const tail = t.length <= 4 ? '****' : `***${t.slice(-4)}`;
  const fp = createHash('sha256').update(t, 'utf8').digest('hex').slice(0, 10);
  return `${tail}|sha256:${fp}`;
}

function evaluateInstanceWebhookSecretMatch(
  instance: ChatInstanceRow,
  secretCandidates: string[],
  configuredSecrets: string[],
  legacyEnvEnabled: boolean,
): {
  matchedSource:
    | 'instance_column'
    | 'metadata'
    | 'metadata_delivery'
    | 'instance_token'
    | 'legacy_env'
    | 'none';
  secretValid: boolean;
} {
  const instanceColumnSecret = normalizeIncomingWebhookSecret((instance as any).webhook_secret);
  const metadataSecret = extractMetadataWebhookSecret(instance.metadata);
  const metadataDeliverySecrets = collectMetadataWebhookSecretCandidates(instance.metadata);
  const instanceTokenVariants = instance.instance_token ? instanceTokenSecretVariants(instance.instance_token) : [];

  const secretMatchesInstanceColumn =
    !!instanceColumnSecret && secretCandidates.some((c) => webhookSecretsEqual(c, instanceColumnSecret));
  const secretMatchesMetadata =
    !!metadataSecret && secretCandidates.some((c) => webhookSecretsEqual(c, metadataSecret));
  const secretMatchesMetadataDelivery =
    metadataDeliverySecrets.length > 0 &&
    secretCandidatesMatchAnyVariantCaseRelaxed(secretCandidates, metadataDeliverySecrets);
  const secretMatchesInstanceToken =
    instanceTokenVariants.length > 0 &&
    secretCandidatesMatchAnyVariantCaseRelaxed(secretCandidates, instanceTokenVariants);
  const secretMatchesLegacyEnv =
    legacyEnvEnabled &&
    configuredSecrets.length > 0 &&
    secretCandidates.some((c) => configuredSecrets.some((cfg) => webhookSecretsEqual(c, cfg)));

  let matchedSource:
    | 'instance_column'
    | 'metadata'
    | 'metadata_delivery'
    | 'instance_token'
    | 'legacy_env'
    | 'none' = 'none';
  if (secretMatchesInstanceColumn) matchedSource = 'instance_column';
  else if (secretMatchesMetadata) matchedSource = 'metadata';
  else if (secretMatchesMetadataDelivery) matchedSource = 'metadata_delivery';
  else if (secretMatchesInstanceToken) matchedSource = 'instance_token';
  else if (secretMatchesLegacyEnv) matchedSource = 'legacy_env';

  return { matchedSource, secretValid: matchedSource !== 'none' };
}

async function tryReconcileWebhookSecretFromProviderOnReceive(
  instance: ChatInstanceRow,
  tenantIdForLog: string | null,
  secretCandidates: string[],
): Promise<boolean> {
  const token = instance.instance_token?.trim();
  if (!token || !secretCandidates.length) return false;

  logUazChat('info', {
    event_type: 'webhook_secret_reconcile_on_receive_attempt',
    instance_id: instance.id,
    tenant_id: tenantIdForLog,
    external_instance_name: instance.external_instance_name,
    candidate_secret_lengths: secretCandidates.map((c) => c.length),
    token_fp: instanceTokenFingerprintForLogs(instance.instance_token),
  });

  try {
    const remote = await uazapiService.getWebhook(token);
    const fromUrls = extractWebhookSecretParamsFromUrls(collectHttpUrlsFromRemote(remote));
    const fromWalk = extractWebhookDeliverySecretsFromUazRemote(remote);
    const canonical = extractCanonicalWebhookUrlSecretForInstance(remote, instance.id);
    const providerSet = dedupeNormalizedSecrets(
      [canonical, ...fromUrls, ...fromWalk].filter(Boolean) as string[],
    );

    for (const cand of secretCandidates) {
      const n = normalizeIncomingWebhookSecret(cand);
      if (!n) continue;
      const ok = providerSet.some((p) => webhookSecretsEqual(n, p));
      if (ok) {
        await pool.query(
          `UPDATE chat_instances
           SET webhook_secret = $1,
               metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
               updated_at = now()
           WHERE id = $3`,
          [
            n,
            JSON.stringify({
              webhook_secret: n,
              webhook: {
                uazDeliverySecrets: providerSet,
                uazDeliverySecretsSyncedAt: new Date().toISOString(),
                reconcileOnReceiveAt: new Date().toISOString(),
              },
            }),
            instance.id,
          ]
        );
        logUazChat('info', {
          event_type: 'webhook_secret_reconcile_on_receive_success',
          instance_id: instance.id,
          tenant_id: tenantIdForLog,
          saved_secret_length: n.length,
          saved_fp: webhookSecretFingerprint(n),
          detail: 'candidate confirmado via GET /webhook do mesmo instance_token',
        });
        return true;
      }
    }

    logUazChat('warn', {
      event_type: 'webhook_secret_reconcile_on_receive_failed',
      instance_id: instance.id,
      tenant_id: tenantIdForLog,
      detail: 'nenhum candidate coincide com secrets devolvidos pelo GET /webhook',
    });
    return false;
  } catch (e: any) {
    logUazChat('warn', {
      event_type: 'webhook_secret_reconcile_on_receive_failed',
      instance_id: instance.id,
      tenant_id: tenantIdForLog,
      detail: e?.message || String(e),
    });
    return false;
  }
}

async function mergeWebhookSecretsFromProviderSkipPath(instance: ChatInstanceRow, tenantId: string | null): Promise<void> {
  try {
    const remote = await uazapiService.getWebhook(instance.instance_token);
    const colRaw = normalizeIncomingWebhookSecret((instance as any).webhook_secret) ?? '';
    logSanitizedUazGetWebhookAudit(
      {
        event_type: 'webhook_get_snapshot_audit',
        tenant_id: tenantId,
        user_id: instance.user_id,
        instance_id: instance.id,
        external_instance_name: instance.external_instance_name,
      },
      remote,
      instance.id,
      instance.external_instance_name,
      colRaw,
    );
    const canonical = extractCanonicalWebhookUrlSecretForInstance(remote, instance.id);
    const col = normalizeIncomingWebhookSecret((instance as any).webhook_secret);
    if (canonical && col && !webhookSecretsEqual(canonical, col)) {
      logUazChat('info', {
        event_type: 'provider_returned_different_secret_ignored',
        tenant_id: tenantId,
        instance_id: instance.id,
        detail: 'skip already_configured: não sobrescrever token local a partir do GET /webhook',
      });
    }

    const merged = dedupeNormalizedSecrets([
      ...(col ? [col] : []),
      ...extractWebhookDeliverySecretsFromUazRemote(remote),
      ...extractWebhookSecretParamsFromUrls(collectHttpUrlsFromRemote(remote)),
    ]);

    await pool.query(
      `UPDATE chat_instances
       SET metadata = jsonb_set(
         COALESCE(metadata, '{}'::jsonb),
         '{webhook}',
         COALESCE(metadata->'webhook', '{}'::jsonb) || $1::jsonb
       ),
       updated_at = now()
       WHERE id = $2`,
      [
        JSON.stringify({
          uazDeliverySecrets: merged,
          uazDeliverySecretsSyncedAt: new Date().toISOString(),
          skipPathVerifiedAt: new Date().toISOString(),
        }),
        instance.id,
      ]
    );

    logUazChat('info', {
      event_type: 'webhook_provider_snapshot_skip_path',
      tenant_id: tenantId,
      instance_id: instance.id,
      external_instance_name: instance.external_instance_name,
      detail: 'already_configured: snapshot GET /webhook aplicado',
    });
  } catch {
    /* não bloquear fluxo already_configured */
  }
}

function logSanitizedUazGetWebhookAudit(
  fields: UazChatLogFields,
  remote: unknown,
  instanceId: string,
  externalName: string | null | undefined,
  effectiveSecret: string,
): void {
  const urls = collectHttpUrlsFromRemote(remote);
  const samples = urls.slice(0, 8).map((u) => {
    try {
      const x = new URL(u);
      const host = x.host;
      const path = truncateWebhookDebugLabel(x.pathname, 48);
      const iid = x.searchParams.get('instanceId') ?? x.searchParams.get('instance_id');
      const sec = x.searchParams.get('secret');
      const secLen = sec?.length ?? 0;
      const secFp = webhookSecretFingerprint(sec);
      const hay = `${host}${path}${u}`;
      const ext = externalName ? String(externalName) : '';
      const mentionsExternal =
        ext.length > 0 && hay.toLowerCase().includes(ext.toLowerCase().slice(0, Math.min(12, ext.length)));
      return {
        host,
        path_hint: path,
        instance_id_in_url: iid === instanceId,
        secret_length: secLen,
        secret_fp: secFp,
        url_mentions_saved_external: Boolean(mentionsExternal),
      };
    } catch {
      return { raw_trunc: truncateWebhookDebugLabel(u, 80) };
    }
  });

  let lengthsMatchHint: boolean | null = null;
  try {
    const matchUrl = urls.find((urlStr) => {
      try {
        const x = new URL(urlStr);
        return (x.searchParams.get('instanceId') ?? x.searchParams.get('instance_id')) === instanceId;
      } catch {
        return false;
      }
    });
    if (matchUrl) {
      const secLen = new URL(matchUrl).searchParams.get('secret')?.length ?? 0;
      lengthsMatchHint = secLen > 0 && secLen === effectiveSecret.trim().length;
    }
  } catch {
    lengthsMatchHint = null;
  }

  logUazChat('info', {
    ...fields,
    event_type: 'webhook_get_snapshot_audit',
    phase: 'webhook_get_snapshot_audit',
    urls_found: urls.length,
    url_audit_samples: samples,
    saved_secret_length: effectiveSecret.trim().length,
    saved_fp: webhookSecretFingerprint(effectiveSecret),
    lengths_match_hint: lengthsMatchHint,
  });
}

/** UUID v4 para segmento :instanceId na rota webhook v2 */
const UAZ_WEBHOOK_V2_INSTANCE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type UazWebhookPipelineOpts = {
  routeVersion: 'v1' | 'v2';
  tenantIdForLog: string | null;
  requestedInstanceId?: string | null;
  externalKeyEarly?: string | null;
  matchedSource?: string;
  v1LogExtras?: {
    secretCandidates: string[];
    configuredSecretLengths: number[];
    instanceColumnSecret: string | undefined;
    metadataSecret: string | null;
  };
};

/**
 * Processamento comum após autenticação (v1 secret ou v2 path token).
 * Não resolve instância pelo payload — `instance` já é a fonte de verdade.
 */
async function runUazWebhookPayloadPipeline(
  req: Request,
  res: Response,
  instance: ChatInstanceRow,
  payload: Record<string, any>,
  webhookId: string,
  startTime: number,
  opts: UazWebhookPipelineOpts
): Promise<void> {
  const webhookVerbose = isUazIntegrationVerboseLogs();
  const { routeVersion, tenantIdForLog, requestedInstanceId, externalKeyEarly } = opts;

  await pool.query(
    `UPDATE chat_instances
     SET webhook_secret_last_seen_at = now(), updated_at = now()
     WHERE id = $1`,
    [instance.id]
  );

  if (opts.routeVersion === 'v1' && opts.v1LogExtras) {
    const x = opts.v1LogExtras;
    if (webhookVerbose) {
      console.log(`[Webhook ${webhookId}] secret_validated`, {
        webhookId,
        instanceId: instance.id,
        matchedSource: opts.matchedSource,
        candidateSecretLengths: x.secretCandidates.map((c) => c.length),
        configuredSecretLengths: x.configuredSecretLengths,
        instanceColumnSecretMask: maskSecretForLogs(x.instanceColumnSecret),
        metadataSecretMask: maskSecretForLogs(x.metadataSecret),
      });
    }
  }

  if (webhookVerbose) {
    console.log(`[Webhook ${webhookId}] received`, {
      webhookRoute: opts.routeVersion,
      method: req.method,
      path: req.path,
      ip: req.ip,
      contentType: req.get('content-type'),
      xUazapiInstance: req.headers['x-uazapi-instance'],
      bodyKeys: req.body ? Object.keys(req.body) : [],
    });
  } else {
    logUazChat('info', {
      event_type: 'webhook_request',
      phase: 'received',
      webhook_route: opts.routeVersion === 'v2' ? 'v2_path' : 'v1_legacy',
      instance_id: instance.id,
      tenant_id: tenantIdForLog,
      detail: `${req.method} ${req.path} webhookId=${webhookId}`,
    });
  }

  if (!payload || Object.keys(payload).length === 0) {
    console.warn(`[Webhook ${webhookId}] Empty payload`, {
      ip: req.ip,
      bodyType: typeof req.body,
    });
    res.status(400).json({ error: 'Empty payload' });
    return;
  }

  if (
    opts.routeVersion === 'v2' &&
    externalKeyEarly &&
    instance.external_instance_name &&
    externalKeyEarly.trim().toLowerCase() !== String(instance.external_instance_name).trim().toLowerCase()
  ) {
    logUazChat('warn', {
      event_type: 'webhook_v2_payload_instance_mismatch',
      webhook_id: webhookId,
      instance_id: instance.id,
      tenant_id: tenantIdForLog,
      payload_label: truncateWebhookDebugLabel(externalKeyEarly, 48),
      db_external_instance_name: instance.external_instance_name,
      detail: 'Ignorado para roteamento — identidade veio da URL v2',
    });
  }

  const externalKey = externalKeyEarly || instance.external_instance_name || requestedInstanceId || instance.id;

  if (webhookVerbose) {
    console.log(`[Webhook ${webhookId}] Instance identification`, {
      resolvedInstanceName: externalKey,
      fromHeader: !!req.headers['x-uazapi-instance'],
      webhookRoute: opts.routeVersion,
    });
  }

  const event = payload.event || req.query.event || payload.type || 'unknown';

  logUazChat('info', {
    event_type: 'webhook_instance_matched',
    instance_id: instance.id,
    external_instance_name: instance.external_instance_name,
    webhook_route_version: opts.routeVersion,
    tenant_id: tenantIdForLog,
    phase: event,
    detail: `receiveTimeMs=${Date.now() - startTime} payloadBytes=${JSON.stringify(payload).length}`,
  });
  if (webhookVerbose) {
    console.log(`[Webhook ${webhookId}] instance matched`, {
      instanceName: externalKey,
      instanceId: instance.id,
      event,
      webhookRoute: opts.routeVersion,
    });
  }

  res.status(200).json({
    received: true,
    webhookId,
    event,
    instance: externalKey,
    webhook_route: opts.routeVersion === 'v2' ? 'v2_path' : 'v1_legacy',
  });

  processProviderWebhook(DEFAULT_COMMUNICATION_PROVIDER, instance, payload, event).catch((error: any) => {
    console.error(`[Webhook ${webhookId}] Async processing error:`, {
      error: error.message,
      stack: error.stack,
      event,
      instance: externalKey,
    });
  });
}

/**
 * Webhook UazAPI v2 — identificação apenas por URL:
 * POST .../api/webhooks/uazapi/v2/:instanceId/:webhookToken
 * O provedor pode acrescentar sufixos (ex.: /messages/text); a rota usa prefix match.
 */
export async function handleWebhookV2(req: Request, res: Response) {
  const startTime = Date.now();
  const webhookId = randomUUID();

  try {
    const instanceIdRaw = req.params.instanceId?.trim() ?? '';
    const tokenRaw = req.params.webhookToken ?? '';
    const tokenDecoded =
      typeof tokenRaw === 'string' ? decodeURIComponent(tokenRaw.trim()) : '';

    logUazChat('info', {
      event_type: 'webhook_v2_received',
      webhook_id: webhookId,
      phase: 'ingress',
      detail: `path=${req.path}`,
    });

    if (!instanceIdRaw || !UAZ_WEBHOOK_V2_INSTANCE_ID_RE.test(instanceIdRaw)) {
      logUazChat('warn', {
        event_type: 'webhook_v2_token_rejected',
        webhook_id: webhookId,
        reason: 'invalid_instance_id_format',
      });
      res.status(400).json({ error: 'Invalid instance id', code: 'webhook_v2_bad_instance_id' });
      return;
    }

    const r = await pool.query<ChatInstanceRow>('SELECT * FROM chat_instances WHERE id = $1 LIMIT 1', [
      instanceIdRaw,
    ]);
    const row = r.rows[0];
    if (!row) {
      logUazChat('warn', {
        event_type: 'webhook_v2_ignored_unknown_instance',
        webhook_id: webhookId,
        instance_id: instanceIdRaw,
        reason: 'instance_not_found',
      });
      res.status(200).json({
        received: true,
        ignored: true,
        reason: 'webhook_v2_ignored_unknown_instance',
        webhookId,
      });
      return;
    }

    const stored = normalizeIncomingWebhookSecret((row as any).webhook_secret);
    const incoming = normalizeIncomingWebhookSecret(tokenDecoded);
    if (!stored || !incoming || !webhookSecretsEqual(incoming, stored)) {
      logUazChat('warn', {
        event_type: 'webhook_v2_token_rejected',
        webhook_id: webhookId,
        instance_id: row.id,
        token_length_incoming: incoming?.length ?? 0,
        token_length_expected: stored?.length ?? 0,
      });
      res.status(401).json({ error: 'Invalid webhook token', code: 'webhook_v2_token_rejected' });
      return;
    }

    const tenantIdForLog = await resolveTenantIdForUser(row.user_id);
    logUazChat('info', {
      event_type: 'webhook_v2_token_valid',
      webhook_id: webhookId,
      instance_id: row.id,
      tenant_id: tenantIdForLog,
      external_instance_name: row.external_instance_name,
      token_fp: webhookSecretFingerprint(incoming),
    });

    const payload: Record<string, any> =
      req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? (req.body as Record<string, any>)
        : {};
    const externalKeyEarly = extractUazWebhookInstanceExternalKey(payload, req);

    await runUazWebhookPayloadPipeline(req, res, row, payload, webhookId, startTime, {
      routeVersion: 'v2',
      tenantIdForLog,
      requestedInstanceId: instanceIdRaw,
      externalKeyEarly: externalKeyEarly ?? undefined,
    });
  } catch (error: any) {
    console.error(`[Webhook ${webhookId}] Error handling webhook v2:`, {
      error: error.message,
      stack: error.stack,
      ip: req.ip,
    });
    if (!res.headersSent) {
      res.status(500).json({
        error: error.message || 'Failed to process webhook',
        webhookId,
      });
    }
  }
}

/**
 * Handler principal para webhooks da UazAPI
 * Responde rapidamente e processa eventos de forma assíncrona
 */
export async function handleWebhook(req: Request, res: Response) {
  const startTime = Date.now();
  const webhookId = randomUUID();
  const webhookVerbose = isUazIntegrationVerboseLogs();

  try {
    // 1) Extrair payload/secret e resolver instância (preferência: query.instanceId)
    const payload: Record<string, any> =
      req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? (req.body as Record<string, any>)
        : {};
    const secretCandidates = collectWebhookSecretCandidates(req);
    const configuredSecrets = getConfiguredWebhookSecrets();
    const legacyEnvEnabled =
      process.env.WEBHOOK_LEGACY_GLOBAL_SECRET_ENABLED === 'true' ||
      process.env.WEBHOOK_LEGACY_GLOBAL_SECRET_ENABLED === '1';
    const instanceSecretRequired =
      process.env.WEBHOOK_INSTANCE_SECRET_REQUIRED !== 'false' &&
      process.env.WEBHOOK_INSTANCE_SECRET_REQUIRED !== '0';
    const requestedInstanceId = extractInstanceIdCandidate(req, payload);
    const externalKeyEarly = extractUazWebhookInstanceExternalKey(payload, req);

    let instanceRows: ChatInstanceRow[] = [];
    let resolutionReason = 'none';
    if (requestedInstanceId) {
      const r = await pool.query<ChatInstanceRow>('SELECT * FROM chat_instances WHERE id = $1 LIMIT 1', [requestedInstanceId]);
      instanceRows = r.rows;
      resolutionReason = 'instance_id';
    }
    if (instanceRows.length === 0 && externalKeyEarly) {
      const r = await pool.query<ChatInstanceRow>(
        `SELECT * FROM chat_instances
         WHERE lower(trim(COALESCE(external_instance_name,''))) = lower(trim($1))`,
        [externalKeyEarly]
      );
      instanceRows = r.rows;
      resolutionReason = 'external_instance_name';
    }
    if (instanceRows.length === 0) {
      const providerCandidates = extractProviderInstanceIdCandidates(payload);
      if (providerCandidates.length > 0) {
        const r = await pool.query<ChatInstanceRow>(
          `SELECT * FROM chat_instances ci
           WHERE EXISTS (
             SELECT 1 FROM unnest($1::text[]) AS pc(val)
             WHERE lower(trim(COALESCE(ci.external_instance_name,''))) = lower(trim(pc.val))
                OR lower(trim(COALESCE(ci.metadata->>'provider_instance_id',''))) = lower(trim(pc.val))
                OR lower(trim(COALESCE(ci.phone_key,''))) = lower(trim(pc.val))
           )`,
          [providerCandidates]
        );
        instanceRows = r.rows;
        resolutionReason = 'provider_payload';
      }
    }

    const instanceMatchCount = instanceRows.length;
    if (instanceMatchCount === 0) {
      const providerCandidates = extractProviderInstanceIdCandidates(payload);
      logUazChat('warn', {
        event_type: 'webhook_ignored_unknown_instance',
        webhook_id: webhookId,
        reason: 'instance_not_registered',
        has_instance_id_param: Boolean(requestedInstanceId),
        has_external_key: Boolean(externalKeyEarly),
        provider_candidates_count: providerCandidates.length,
        provider_candidates_sample: providerCandidates.slice(0, 3).map((s) =>
          typeof s === 'string' && s.length > 24 ? `${s.slice(0, 12)}…` : s,
        ),
      });
      res.status(200).json({
        received: true,
        ignored: true,
        reason: 'webhook_ignored_unknown_instance',
        webhookId,
      });
      return;
    }
    if (instanceMatchCount > 1) {
      console.warn(`[Webhook ${webhookId}] ambiguous_instance_resolution`, {
        webhookId,
        reason: 'ambiguous_instance_resolution',
        hasInstanceId: Boolean(requestedInstanceId),
        resolutionReason,
        matchCount: instanceMatchCount,
      });
      res.status(409).json({ error: 'Ambiguous instance resolution' });
      return;
    }
    let instance = instanceRows[0];
    const tenantIdForLog = await resolveTenantIdForUser(instance.user_id);

    if (isUazWebhookPayloadDebugEnabled()) {
      const detailed = extractProviderInstanceIdCandidatesWithSources(payload);
      logUazChat('info', {
        event_type: 'webhook_payload_debug',
        webhook_id: webhookId,
        tenant_id: tenantIdForLog,
        resolution_reason: resolutionReason,
        query_instance_id: requestedInstanceId ?? null,
        external_key_early: externalKeyEarly ? truncateWebhookDebugLabel(externalKeyEarly, 48) : null,
        provider_candidates: detailed.slice(0, 14).map((d) => ({
          source: d.source,
          value: truncateWebhookDebugLabel(d.value, 44),
        })),
        secret_candidate_lengths: secretCandidates.map((c) => c.length),
        secret_candidate_fps: secretCandidates.map((c) => webhookSecretFingerprint(c)),
        query_secret_length: normalizeIncomingWebhookSecret(req.query?.secret)?.length ?? 0,
        query_secret_fp: webhookSecretFingerprint(normalizeIncomingWebhookSecret(req.query?.secret)),
        payload_event: truncateWebhookDebugLabel(String(payload.event ?? payload.type ?? payload.action ?? ''), 48),
        resolved_local_instance_id: instance.id,
        resolved_external_saved: instance.external_instance_name,
        token_fp: instanceTokenFingerprintForLogs(instance.instance_token),
      });
    }

    if (
      requestedInstanceId &&
      externalKeyEarly &&
      instance.external_instance_name &&
      externalKeyEarly.trim().toLowerCase() !== String(instance.external_instance_name).trim().toLowerCase()
    ) {
      logUazChat('warn', {
        event_type: 'webhook_provider_label_differs_from_db',
        webhook_id: webhookId,
        instance_id: instance.id,
        tenant_id: tenantIdForLog,
        payload_label: truncateWebhookDebugLabel(externalKeyEarly, 48),
        db_external_instance_name: instance.external_instance_name,
        detail: 'Resolução por instanceId na query; label textual do payload pode ser stale/outra instância no provedor.',
      });
    }

    let ev = evaluateInstanceWebhookSecretMatch(instance, secretCandidates, configuredSecrets, legacyEnvEnabled);
    if (!ev.secretValid && secretCandidates.length > 0) {
      const healed = await tryReconcileWebhookSecretFromProviderOnReceive(instance, tenantIdForLog, secretCandidates);
      if (healed) {
        const refetch = await pool.query<ChatInstanceRow>('SELECT * FROM chat_instances WHERE id = $1 LIMIT 1', [
          instance.id,
        ]);
        if (refetch.rows[0]) {
          instance = refetch.rows[0];
          ev = evaluateInstanceWebhookSecretMatch(instance, secretCandidates, configuredSecrets, legacyEnvEnabled);
        }
      }
    }

    const matchedSource = ev.matchedSource;
    const secretValid = ev.secretValid;

    const instanceColumnSecret = normalizeIncomingWebhookSecret((instance as any).webhook_secret);
    const metadataSecret = extractMetadataWebhookSecret(instance.metadata);
    const metadataDeliverySecrets = collectMetadataWebhookSecretCandidates(instance.metadata);
    const instanceTokenVariants = instance.instance_token
      ? instanceTokenSecretVariants(instance.instance_token)
      : [];
    const configuredSecretLengths = [
      ...(instanceColumnSecret ? [instanceColumnSecret.length] : []),
      ...(metadataSecret ? [metadataSecret.length] : []),
      ...metadataDeliverySecrets.map((s) => s.length),
      ...instanceTokenVariants.map((s) => s.length),
      ...configuredSecrets.map((s) => s.length),
    ];

    if (!secretValid || secretCandidates.length === 0) {
      console.warn(`[Webhook ${webhookId}] production_webhook_secret_rejected`, {
        webhookId,
        hasInstanceId: Boolean(requestedInstanceId),
        instanceResolved: true,
        instanceId: instance.id,
        tenantId: tenantIdForLog,
        hasQuerySecret: Boolean(normalizeIncomingWebhookSecret(req.query?.secret) || normalizeIncomingWebhookSecret(req.query?.webhookSecret)),
        hasHeaderSecret: Boolean(normalizeIncomingWebhookSecret(req.headers['x-uazapi-secret'])),
        candidateSecretLengths: secretCandidates.map((c) => c.length),
        configuredSecretLengths,
        matchedSource: 'none',
        reason: secretCandidates.length === 0 ? 'missing_secret' : 'invalid_secret',
      });
      logUazChat('warn', {
        event_type: 'webhook_secret_rejected',
        webhook_id: webhookId,
        instance_id: instance.id,
        tenant_id: tenantIdForLog,
        reason: secretCandidates.length === 0 ? 'missing_secret' : 'invalid_secret',
        candidate_secret_lengths: secretCandidates.map((c) => c.length),
      });
      res.status(401).json({ error: 'Invalid or missing webhook secret', code: 'webhook_secret_rejected' });
      return;
    }
    if (matchedSource === 'legacy_env' && !instanceSecretRequired) {
      // emergência: apenas não bloqueia se feature-flag explicitamente relaxada
    } else if (matchedSource === 'legacy_env' && instanceSecretRequired) {
      // legado permitido apenas com instância resolvida (já resolvida acima)
    }

    await runUazWebhookPayloadPipeline(req, res, instance, payload, webhookId, startTime, {
      routeVersion: 'v1',
      tenantIdForLog,
      requestedInstanceId,
      externalKeyEarly: externalKeyEarly ?? undefined,
      matchedSource,
      v1LogExtras: {
        secretCandidates,
        configuredSecretLengths,
        instanceColumnSecret,
        metadataSecret,
      },
    });
  } catch (error: any) {
    console.error(`[Webhook ${webhookId}] Error handling webhook:`, {
      error: error.message,
      stack: error.stack,
      ip: req.ip,
      processingTime: Date.now() - startTime,
    });

    // Se ainda não respondeu, responder com erro
    if (!res.headersSent) {
      res.status(500).json({
        error: error.message || 'Failed to process webhook',
        webhookId,
      });
    }
  }
}

/**
 * Worker de mensagens agendadas: envia texto na conversa (UazAPI), reutilizando saveMessage + persistência.
 */
export async function executeScheduledChatMessageDelivery(row: {
  id: string;
  tenant_id: string;
  conversation_id: string;
  message_text: string;
}): Promise<{ ok: true; externalId: string | null } | { ok: false; reason: string }> {
  const text = row.message_text.trim();
  if (!text) return { ok: false, reason: 'empty_message' };

  const conversationResult = await pool.query(
    `
    SELECT c.*, i.instance_token, i.status AS instance_status,
           u.tenant_id AS owner_tenant_id
    FROM chat_conversations c
    LEFT JOIN chat_instances i ON i.id = c.instance_id
    INNER JOIN users u ON u.id = c.user_id
    WHERE c.id = $1::uuid AND u.tenant_id = $2::uuid
    `,
    [row.conversation_id, row.tenant_id],
  );
  if (!conversationResult.rowCount) {
    return { ok: false, reason: 'conversation_not_found' };
  }
  const conversation = conversationResult.rows[0] as AnyObject;
  if (String(conversation.owner_tenant_id || '') !== row.tenant_id) {
    return { ok: false, reason: 'tenant_mismatch' };
  }

  const isOfficial =
    String(conversation.provider || '') === 'whatsapp_official' ||
    Boolean(conversation.whatsapp_official_account_id);
  if (isOfficial) {
    return { ok: false, reason: 'whatsapp_official_not_supported' };
  }

  const token = String(conversation.instance_token || '').trim();
  const instStatus = String(conversation.instance_status || '').toLowerCase();
  if (!token || !['connected', 'open'].includes(instStatus)) {
    console.log(
      JSON.stringify({
        event: 'scheduled_message_skipped_instance_unavailable',
        scheduled_message_id: row.id,
        conversation_id: row.conversation_id,
        instance_status: instStatus,
      }),
    );
    return { ok: false, reason: 'instance_unavailable' };
  }

  const ownerUserId = String(conversation.user_id);
  const tenantId = row.tenant_id;
  const localTrackId = `track_sched_${randomUUID()}`;
  const provisionalExternalId = `local:${randomUUID()}`;
  let savedRowId: string | null = null;

  try {
    const saveResult = await saveMessage(conversation.id, 'outgoing', {
      externalMessageId: provisionalExternalId,
      body: text,
      media: [],
      messageKind: 'text',
      status: 'queued',
      sentAt: new Date(),
      metadata: {
        source: 'scheduled_message',
        scheduled_message_id: row.id,
        provisional: true,
      },
    });
    savedRowId = saveResult.rowId;

    const numberTo = toUazRecipientNumber(
      (conversation.canonical_phone as string | null | undefined) || conversation.phone_number,
      conversation.external_chat_id,
    );

    const messageResponse = (await uazapiService.sendTextMessage(token, {
      number: numberTo,
      text,
      track_source: 'painelcrm_scheduled',
      track_id: localTrackId,
    })) as AnyObject;

    const extId = extractUazOutgoingMessageId(messageResponse);

    if (savedRowId) {
      const nextStatus = pickBestOutgoingStatus('queued', 'provider_sent') ?? 'provider_sent';
      await pool.query(
        `
            UPDATE chat_messages
            SET
              external_message_id = COALESCE($1, external_message_id),
              status = $2,
              metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
              sent_at = COALESCE(sent_at, $4::timestamptz)
            WHERE id = $5
            `,
        [extId, nextStatus, JSON.stringify({ ...messageResponse, track_id: localTrackId }), new Date(), savedRowId],
      );
    }

    const savedMessageResult = savedRowId
      ? await pool.query(`SELECT * FROM chat_messages WHERE id = $1`, [savedRowId])
      : { rows: [] as any[] };

    const leadColumnAvailableWs = await hasLeadIdColumn();
    const updatedConversationResult = await pool.query(
      `
          SELECT
            c.id,
            c.user_id,
            c.instance_id,
            c.provider,
            c.external_chat_id,
            c.external_fast_id,
            c.contact_name,
            c.profile_name,
            c.phone_number,
            c.display_name,
            c.avatar_url,
            c.status,
            c.last_message_preview,
            c.last_message_at,
            c.unread_count,
            c.metadata,
            c.created_at,
            c.updated_at,
            c.client_id,
            ${leadColumnAvailableWs ? 'c.lead_id,' : 'NULL::uuid as lead_id,'}
            c.phone_key,
            c.assigned_to_user_id,
            c.assigned_team_id,
            COALESCE(i.name, wa.display_phone_number, wa.verified_name, 'WhatsApp Oficial') as instance_name,
            CASE
              WHEN c.client_id IS NOT NULL THEN 'client_linked'
              WHEN ${leadColumnAvailableWs ? 'c.lead_id IS NOT NULL' : 'false'} THEN 'lead_linked'
              WHEN COALESCE((c.metadata->>'link_confidence'), '') = 'review' THEN 'review_required'
              ELSE 'unlinked'
            END as link_state,
            COALESCE(c.metadata->>'link_source', 'system') as link_source,
            COALESCE(c.metadata->>'link_confidence', 'review') as link_confidence,
            CASE
              WHEN ${leadColumnAvailableWs ? 'c.lead_id IS NOT NULL' : 'false'} THEN (
                SELECT l2.status FROM leads l2 WHERE l2.id = c.lead_id AND l2.user_id = c.user_id LIMIT 1
              )
              ELSE NULL
            END as lead_status
          FROM chat_conversations c
          LEFT JOIN chat_instances i ON i.id = c.instance_id
          LEFT JOIN whatsapp_official_accounts wa ON wa.id = c.whatsapp_official_account_id
          WHERE c.id = $1
        `,
      [row.conversation_id],
    );

    if (updatedConversationResult.rows.length > 0) {
      const updatedConversation = updatedConversationResult.rows[0];
      try {
        emitConversationUpdate(ownerUserId, updatedConversation);
        const rowProv = (updatedConversation as { provider?: string }).provider;
        emitToTenant(
          tenantId,
          'conversation.updated',
          buildConversationUpdatedPayload({
            provider: (rowProv as typeof DEFAULT_COMMUNICATION_PROVIDER) ?? DEFAULT_COMMUNICATION_PROVIDER,
            conversation_id: updatedConversation.id,
            last_message_preview: updatedConversation.last_message_preview ?? null,
            last_message_at: updatedConversation.last_message_at ?? null,
            unread_count: updatedConversation.unread_count ?? 0,
            status: updatedConversation.status ?? null,
            assigned_user_id: updatedConversation.assigned_to_user_id ?? null,
            assigned_team_id: updatedConversation.assigned_team_id ?? null,
            display_name: updatedConversation.display_name ?? null,
            avatar_url: updatedConversation.avatar_url ?? null,
          }),
        );
      } catch (wsError: any) {
        console.warn('[scheduled-send] conversation ws emit failed:', wsError?.message);
      }
    }

    if (savedMessageResult.rows.length > 0) {
      const rrow: any = savedMessageResult.rows[0];
      try {
        const contract = contractFromDbRow(rrow);
        emitNewMessage(
          ownerUserId,
          {
            id: rrow.id,
            conversation_id: conversation.id,
            direction: rrow.direction,
            body: rrow.body,
            sent_at: rrow.sent_at || new Date(),
            status: rrow.status,
            external_message_id: rrow.external_message_id,
            media: rrow.media,
            message_contract: contract,
            reply_to_message_id: rrow.reply_to_message_id ?? null,
            reply_to_external_message_id: rrow.reply_to_external_message_id ?? null,
            reply_preview: rrow.reply_preview ?? null,
            reply_sender_name: rrow.reply_sender_name ?? null,
            reply_message_type: rrow.reply_message_type ?? null,
          },
          conversation.id,
        );
        const media = Array.isArray(rrow.media) ? (rrow.media as Array<Record<string, unknown>>) : [];
        const mediaUrlRaw = media.find((m) => typeof m?.url === 'string' && m.url)?.url;
        const mediaUrl = typeof mediaUrlRaw === 'string' ? mediaUrlRaw : null;
        const convProv = (conversation as { provider?: string }).provider;
        emitToTenant(
          tenantId,
          'message.created',
          buildMessageCreatedPayload({
            provider: (convProv as typeof DEFAULT_COMMUNICATION_PROVIDER) ?? DEFAULT_COMMUNICATION_PROVIDER,
            conversation_id: conversation.id,
            message_id: rrow.id != null ? String(rrow.id) : null,
            direction: String(rrow.direction ?? ''),
            body: rrow.body == null ? null : String(rrow.body),
            message_type: String(contract.kind ?? 'text'),
            media_url: mediaUrl,
            sent_at: rrow.sent_at || new Date(),
            provider_message_id:
              rrow.external_message_id == null ? null : String(rrow.external_message_id),
            reply_to_message_id:
              rrow.reply_to_message_id == null ? null : String(rrow.reply_to_message_id),
            reply_preview: rrow.reply_preview == null ? null : String(rrow.reply_preview),
            reply_sender_name:
              rrow.reply_sender_name == null ? null : String(rrow.reply_sender_name),
            reply_message_type:
              rrow.reply_message_type == null ? null : String(rrow.reply_message_type),
          }),
        );
      } catch (wsError: any) {
        console.warn('[scheduled-send] message ws emit failed:', wsError?.message);
      }
    }

    return { ok: true, externalId: extId };
  } catch (error: any) {
    if (savedRowId) {
      try {
        await pool.query(
          `
          UPDATE chat_messages
          SET status = 'failed',
              metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
          WHERE id = $2
          `,
          [JSON.stringify({ send_error: error?.message || String(error) }), savedRowId],
        );
      } catch {
        /* ignore */
      }
    }
    console.log(
      JSON.stringify({
        event: 'scheduled_message_failed',
        scheduled_message_id: row.id,
        reason: error?.message || String(error),
      }),
    );
    return { ok: false, reason: error?.message || 'send_failed' };
  }
}

