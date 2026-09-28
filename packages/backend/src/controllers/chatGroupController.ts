import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.js';
import { pool } from '../utils/db.js';
import { SQL_CHAT_ACCESS_PREDICATE } from '../utils/chatConversationAccess.js';
import { isWhatsappGroupsEnabled } from '../config/whatsappGroupsEnv.js';
import { uazapiService } from '../services/uazapi.js';
import {
  insertChatGroupAdminAudit,
  type ChatGroupAdminAuditAction,
} from '../services/chatGroupAdminAuditService.js';
import {
  extractUazapiChatImageUrl,
  isUsablePersistedAvatar,
  isWhatsAppCdnAvatarUrl,
} from '../utils/uazapiChatIdentity.js';
import {
  conversationRowForClientApi,
  formatMsisdnForDisplay,
} from '../utils/uazapiIdentityResolve.js';
import { resolveConversationAvatarWithCache } from '../services/whatsappAvatarCacheService.js';
import { emitConversationUpdate } from '../services/websocketService.js';
import { enrichGroupParticipantsWithDirectConversationAvatars } from '../services/chatGroupParticipantAvatarEnrich.js';
import { persistConversationAvatarToCrm } from '../services/conversationAvatarPersistence.js';
import { canChatAction } from '../services/chatAccess.js';

function firstString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function digitsFromJid(jid: string): string {
  return (jid.split('@')[0] || '').replace(/\D/g, '');
}

function normalizeParticipant(raw: Record<string, unknown>) {
  const jid = firstString(raw.JID, raw.jid) ?? '';
  const phoneField = firstString(
    raw.Phone,
    raw.phone,
    raw.Number,
    raw.number,
    raw.PhoneNumber,
    raw.phoneNumber
  );
  const digitsFromField = phoneField ? phoneField.replace(/\D/g, '') : '';
  const digits = digitsFromField || digitsFromJid(jid);
  const displayName = firstString(
    raw.DisplayName,
    raw.displayName,
    raw.PushName,
    raw.pushName,
    raw.VerifiedName,
    raw.verifiedName,
    raw.Name,
    raw.name
  );
  const profilePicUrl = firstString(
    raw.ProfilePicUrl,
    raw.profilePicUrl,
    raw.Image,
    raw.image,
    raw.ImagePreview,
    raw.imagePreview,
    raw.PictureURL,
    raw.pictureUrl
  );
  const phoneDisplay =
    digits.length >= 10 ? formatMsisdnForDisplay(digits) : digits.length > 0 ? `+${digits}` : null;
  return {
    jid,
    lid: firstString(raw.LID, raw.lid),
    phone: digits || null,
    phoneDisplay,
    isAdmin: Boolean(raw.IsAdmin ?? raw.isAdmin),
    isSuperAdmin: Boolean(raw.IsSuperAdmin ?? raw.isSuperAdmin),
    displayName,
    profilePicUrl,
  };
}

export function normalizeUazGroupInfo(raw: unknown) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const nested =
    o.group && typeof o.group === 'object' && !Array.isArray(o.group)
      ? (o.group as Record<string, unknown>)
      : o;
  const participantsRaw = nested.Participants ?? nested.participants;
  const participants = Array.isArray(participantsRaw)
    ? participantsRaw
        .filter((x): x is Record<string, unknown> => x != null && typeof x === 'object' && !Array.isArray(x))
        .map((x) => normalizeParticipant(x))
    : [];
  const participantCount =
    typeof nested.ParticipantCount === 'number'
      ? nested.ParticipantCount
      : typeof nested.participantCount === 'number'
        ? nested.participantCount
        : participants.length;
  return {
    jid: firstString(nested.JID, nested.jid) ?? '',
    name: firstString(nested.Name, nested.name) ?? '',
    topic: firstString(nested.Topic, nested.topic),
    ownerJid: firstString(nested.OwnerJID, nested.ownerJID, nested.ownerJid, nested.Owner, nested.owner),
    profilePicUrl: firstString(
      nested.ProfilePicUrl,
      nested.profilePicUrl,
      nested.PictureUrl,
      nested.pictureUrl
    ),
    isLocked: Boolean(nested.IsLocked ?? nested.isLocked),
    isAnnounce: Boolean(nested.IsAnnounce ?? nested.isAnnounce),
    isJoinApprovalRequired: Boolean(
      nested.IsJoinApprovalRequired ?? nested.isJoinApprovalRequired,
    ),
    memberAddMode: firstString(nested.MemberAddMode, nested.memberAddMode),
    isEphemeral:
      nested.IsEphemeral != null || nested.isEphemeral != null
        ? Boolean(nested.IsEphemeral ?? nested.isEphemeral)
        : null,
    disappearingTimer:
      typeof nested.DisappearingTimer === 'number'
        ? nested.DisappearingTimer
        : typeof nested.disappearingTimer === 'number'
          ? nested.disappearingTimer
          : null,
    ownerIsAdmin: Boolean(nested.OwnerIsAdmin ?? nested.ownerIsAdmin),
    ownerCanSendMessage:
      nested.OwnerCanSendMessage != null || nested.ownerCanSendMessage != null
        ? Boolean(nested.OwnerCanSendMessage ?? nested.ownerCanSendMessage)
        : null,
    inviteLink: firstString(
      nested.InviteLink,
      nested.inviteLink,
      nested.invite_link,
      o.InviteLink,
      o.inviteLink,
      o.invite_link,
    ),
    participantCount,
    participants,
  };
}

export type UazGroupContext = {
  conversationId: string;
  instanceId: string;
  groupJid: string;
  instanceToken: string;
};

export async function loadUazapiGroupContext(
  conversationId: string,
  userId: string,
  res: Response
): Promise<UazGroupContext | null> {
  if (!isWhatsappGroupsEnabled()) {
    res.status(404).json({ error: 'Recurso não disponível' });
    return null;
  }
  const r = await pool.query<{
    id: string;
    instance_id: string;
    external_chat_id: string;
    conversation_type: string;
    provider: string | null;
    instance_token: string;
  }>(
    `
    SELECT c.id, c.instance_id, c.external_chat_id, c.conversation_type, c.provider, i.instance_token
    FROM chat_conversations c
    INNER JOIN chat_instances i ON i.id = c.instance_id
    WHERE c.id = $1::uuid AND ${SQL_CHAT_ACCESS_PREDICATE}
    `,
    [conversationId, userId]
  );
  if (r.rowCount === 0) {
    res.status(404).json({ error: 'Conversa não encontrada' });
    return null;
  }
  const row = r.rows[0];
  const ext = row.external_chat_id?.trim() ?? '';
  const isGroup = row.conversation_type === 'group' || ext.toLowerCase().endsWith('@g.us');
  if (!isGroup) {
    res.status(400).json({ error: 'Esta conversa não é um grupo WhatsApp' });
    return null;
  }
  const prov = (row.provider || '').trim() || 'whatsapp_uazapi';
  if (prov === 'whatsapp_official') {
    res.status(400).json({ error: 'Gestão de grupo não disponível para este canal' });
    return null;
  }
  return {
    conversationId: row.id,
    instanceId: row.instance_id,
    groupJid: ext,
    instanceToken: row.instance_token,
  };
}

async function auditMut(
  ctx: UazGroupContext,
  req: AuthRequest,
  action: ChatGroupAdminAuditAction,
  payload: Record<string, unknown> | null,
  uazapiStatus: number | null,
  errorMessage: string | null
) {
  await insertChatGroupAdminAudit({
    tenantId: req.tenantId ?? null,
    actorUserId: req.userId!,
    conversationId: ctx.conversationId,
    instanceId: ctx.instanceId,
    groupJid: ctx.groupJid,
    action,
    payload,
    uazapiStatus,
    errorMessage,
  });
}

async function persistGroupConversationMetadata(
  ctx: UazGroupContext,
  group: ReturnType<typeof normalizeUazGroupInfo>,
  req: AuthRequest
): Promise<void> {
  const r = await pool.query(`SELECT * FROM chat_conversations WHERE id = $1::uuid LIMIT 1`, [
    ctx.conversationId,
  ]);
  const row = r.rows[0] as Record<string, unknown> | undefined;
  if (!row) return;
  const userId = String(row.user_id ?? '');
  if (!userId) return;

  const nameTrim = typeof group.name === 'string' ? group.name.trim() : '';
  const incomingPic = typeof group.profilePicUrl === 'string' ? group.profilePicUrl.trim() : '';

  const metaBase =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? ({ ...(row.metadata as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  if (incomingPic) {
    metaBase.whatsapp_profile_photo = incomingPic;
  }

  const fromMeta = extractUazapiChatImageUrl(metaBase);
  const rowAvatar =
    typeof row.avatar_url === 'string' && row.avatar_url.trim() ? row.avatar_url.trim() : null;
  const mergedAvatarUrl = incomingPic || fromMeta || rowAvatar;

  const patch = await resolveConversationAvatarWithCache({
    tenantId: req.tenantId ?? null,
    userId,
    mergedAvatarUrl,
    existingAvatarUrl: rowAvatar,
    existingCachedUrl:
      typeof row.avatar_cached_url === 'string' && row.avatar_cached_url.trim()
        ? row.avatar_cached_url.trim()
        : null,
    existingSourceUrl:
      typeof row.avatar_source_url === 'string' && row.avatar_source_url.trim()
        ? row.avatar_source_url.trim()
        : null,
  });

  await pool.query(
    `
    UPDATE chat_conversations SET
      display_name = CASE WHEN LENGTH($2::text) > 0 THEN $2::text ELSE display_name END,
      contact_name = CASE WHEN LENGTH($2::text) > 0 THEN $2::text ELSE contact_name END,
      profile_name = CASE WHEN LENGTH($2::text) > 0 THEN $2::text ELSE profile_name END,
      metadata = $3::jsonb,
      avatar_url = COALESCE($4, avatar_url),
      avatar_cached_url = COALESCE($5, avatar_cached_url),
      avatar_source_url = COALESCE($6, avatar_source_url),
      avatar_cached_at = COALESCE($7::timestamptz, avatar_cached_at),
      avatar_cache_status = COALESCE($8, avatar_cache_status),
      updated_at = now()
    WHERE id = $1::uuid
    `,
    [
      ctx.conversationId,
      nameTrim,
      JSON.stringify(metaBase),
      patch.avatar_url,
      patch.avatar_cached_url,
      patch.avatar_source_url,
      patch.avatar_cached_at,
      patch.avatar_cache_status,
    ],
  );

  const fresh = await pool.query(`SELECT * FROM chat_conversations WHERE id = $1::uuid LIMIT 1`, [
    ctx.conversationId,
  ]);
  if (fresh.rows[0]) {
    emitConversationUpdate(userId, conversationRowForClientApi(fresh.rows[0] as Record<string, unknown>));
  }
}

async function runUazGroupMut(
  req: AuthRequest,
  res: Response,
  conversationId: string,
  action: ChatGroupAdminAuditAction,
  auditPayload: Record<string, unknown> | null,
  fn: (ctx: UazGroupContext) => Promise<unknown>,
  opts?: { leave?: boolean; crmMutKind?: 'settings' | 'participants' }
) {
  const ctx = await loadUazapiGroupContext(conversationId, req.userId!, res);
  if (!ctx) return;

  if (opts?.leave) {
    const canLeave =
      (await canChatAction(req.userId!, 'reply', req)) ||
      (await canChatAction(req.userId!, 'manage_groups', req));
    if (!canLeave) {
      res.status(403).json({ error: 'Sem permissão para sair do grupo no CRM.' });
      return;
    }
  } else {
    const kind = opts?.crmMutKind ?? 'settings';
    const hasManage = await canChatAction(req.userId!, 'manage_groups', req);
    const hasSettings =
      kind === 'settings' && (await canChatAction(req.userId!, 'manage_group_settings', req));
    const hasParticipants =
      kind === 'participants' &&
      (await canChatAction(req.userId!, 'manage_group_participants', req));
    if (!hasManage && !hasSettings && !hasParticipants) {
      res.status(403).json({
        error: 'Sem permissão no CRM para esta ação no grupo.',
      });
      return;
    }
  }

  try {
    await fn(ctx);
    if (opts?.leave) {
      await auditMut(ctx, req, action, auditPayload, 200, null);
      res.json({ ok: true });
      return;
    }
    await auditMut(ctx, req, action, auditPayload, 200, null);
    const fresh = await uazapiService.groupInfo(ctx.instanceToken, {
      groupjid: ctx.groupJid,
      getInviteLink: true,
      getRequestsParticipants: false,
      force: true,
    });
    const group = normalizeUazGroupInfo(fresh);
    group.participants = await enrichGroupParticipantsWithDirectConversationAvatars(group.participants, {
      instanceId: ctx.instanceId,
      userId: req.userId!,
    });
    await persistGroupConversationMetadata(ctx, group, req);
    res.json({ ok: true, group });
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 502;
    let msg = e?.message || 'Falha na integração WhatsApp';
    if (status === 403) {
      msg =
        'Não tem permissão para alterar este grupo no WhatsApp (é necessário ser administrador).';
    }
    await auditMut(ctx, req, action, auditPayload, status, msg);
    res.status(status >= 400 && status < 600 ? status : 502).json({
      error: msg,
      details: e?.payload,
    });
  }
}

const zName = z.object({ name: z.string().min(1).max(25) });
const zDescription = z.object({ description: z.string().max(512) });
const zImage = z.object({ image: z.string().min(1) });
const zParticipants = z.object({
  action: z.enum(['add', 'remove', 'promote', 'demote', 'approve', 'reject']),
  participants: z.array(z.string().min(1)).min(1),
});

const zGroupSettings = z.object({
  sendMessages: z.enum(['all', 'admins_only']),
  editGroupInfo: z.enum(['all', 'admins_only']),
  joinApprovalRequired: z.boolean(),
  addMembers: z.enum(['all', 'admins_only']),
  disappearing: z.enum(['off', '24h', '7d', '90d']),
});

const disappearingSecondsMap = {
  off: 0,
  '24h': 86400,
  '7d': 604800,
  '90d': 7776000,
} as const;

export async function getChatGroupDetails(req: AuthRequest, res: Response) {
  const ctx = await loadUazapiGroupContext(req.params.id, req.userId!, res);
  if (!ctx) return;
  if (!(await canChatAction(req.userId!, 'view', req))) {
    res.status(403).json({ error: 'Sem permissão para ver o chat.' });
    return;
  }
  try {
    const raw = await uazapiService.groupInfo(ctx.instanceToken, {
      groupjid: ctx.groupJid,
      getInviteLink: true,
      getRequestsParticipants: false,
      force: req.query.refresh === '1' || req.query.refresh === 'true',
    });
    const group = normalizeUazGroupInfo(raw);
    group.participants = await enrichGroupParticipantsWithDirectConversationAvatars(group.participants, {
      instanceId: ctx.instanceId,
      userId: req.userId!,
    });
    res.json({ group });
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 502;
    let msg = e?.message || 'Falha ao obter dados do grupo';
    if (status === 403) {
      msg = 'Não tem permissão para ver ou gerir este grupo no WhatsApp.';
    }
    res.status(status >= 400 && status < 600 ? status : 502).json({
      error: msg,
      details: e?.payload,
    });
  }
}

export async function getChatGroupParticipants(req: AuthRequest, res: Response) {
  const ctx = await loadUazapiGroupContext(req.params.id, req.userId!, res);
  if (!ctx) return;
  if (!(await canChatAction(req.userId!, 'view', req))) {
    res.status(403).json({ error: 'Sem permissão para ver o chat.' });
    return;
  }
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  try {
    const raw = await uazapiService.groupInfo(ctx.instanceToken, {
      groupjid: ctx.groupJid,
      getInviteLink: false,
      getRequestsParticipants: false,
      force: req.query.refresh === '1' || req.query.refresh === 'true',
    });
    const g = normalizeUazGroupInfo(raw);
    let list = g.participants;
    if (q) {
      list = list.filter((p) => {
        const hay = `${p.jid} ${p.displayName ?? ''} ${p.phone ?? ''} ${p.phoneDisplay ?? ''}`.toLowerCase();
        return hay.includes(q);
      });
    }
    list = await enrichGroupParticipantsWithDirectConversationAvatars(list, {
      instanceId: ctx.instanceId,
      userId: req.userId!,
    });
    res.json({
      participants: list,
      participantCount: g.participantCount,
      ownerIsAdmin: g.ownerIsAdmin,
    });
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 502;
    let msg = e?.message || 'Falha ao listar participantes';
    if (status === 403) {
      msg = 'Não tem permissão para listar participantes deste grupo.';
    }
    res.status(status >= 400 && status < 600 ? status : 502).json({
      error: msg,
      details: e?.payload,
    });
  }
}

export async function postChatGroupName(req: AuthRequest, res: Response) {
  const parsed = zName.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Nome inválido', details: parsed.error.flatten() });
    return;
  }
  await runUazGroupMut(
    req,
    res,
    req.params.id,
    'group_update_name',
    { name: parsed.data.name },
    (ctx) =>
      uazapiService.groupUpdateName(ctx.instanceToken, {
        groupjid: ctx.groupJid,
        name: parsed.data.name,
      }),
    { crmMutKind: 'settings' }
  );
}

export async function postChatGroupDescription(req: AuthRequest, res: Response) {
  const parsed = zDescription.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Descrição inválida', details: parsed.error.flatten() });
    return;
  }
  await runUazGroupMut(
    req,
    res,
    req.params.id,
    'group_update_description',
    { descriptionLen: parsed.data.description.length },
    (ctx) =>
      uazapiService.groupUpdateDescription(ctx.instanceToken, {
        groupjid: ctx.groupJid,
        description: parsed.data.description,
      }),
    { crmMutKind: 'settings' }
  );
}

export async function postChatGroupImage(req: AuthRequest, res: Response) {
  const parsed = zImage.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Imagem inválida', details: parsed.error.flatten() });
    return;
  }
  await runUazGroupMut(
    req,
    res,
    req.params.id,
    'group_update_image',
    { remove: parsed.data.image === 'remove' || parsed.data.image === 'delete' },
    (ctx) =>
      uazapiService.groupUpdateImage(ctx.instanceToken, {
        groupjid: ctx.groupJid,
        image: parsed.data.image,
      }),
    { crmMutKind: 'settings' }
  );
}

export async function postChatGroupResetInvite(req: AuthRequest, res: Response) {
  await runUazGroupMut(
    req,
    res,
    req.params.id,
    'group_reset_invite',
    {},
    (ctx) =>
      uazapiService.groupResetInviteCode(ctx.instanceToken, {
        groupjid: ctx.groupJid,
      }),
    { crmMutKind: 'settings' }
  );
}

export async function postChatGroupLeave(req: AuthRequest, res: Response) {
  await runUazGroupMut(
    req,
    res,
    req.params.id,
    'group_leave',
    {},
    (ctx) =>
      uazapiService.groupLeave(ctx.instanceToken, {
        groupjid: ctx.groupJid,
      }),
    { leave: true }
  );
}

export async function postChatGroupParticipants(req: AuthRequest, res: Response) {
  const parsed = zParticipants.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
    return;
  }
  await runUazGroupMut(
    req,
    res,
    req.params.id,
    'group_participants',
    { action: parsed.data.action, count: parsed.data.participants.length },
    (ctx) =>
      uazapiService.groupUpdateParticipants(ctx.instanceToken, {
        groupjid: ctx.groupJid,
        action: parsed.data.action,
        participants: parsed.data.participants,
      }),
    { crmMutKind: 'participants' }
  );
}

export async function postChatGroupSettings(req: AuthRequest, res: Response) {
  const parsed = zGroupSettings.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }
  const ctx = await loadUazapiGroupContext(req.params.id, req.userId!, res);
  if (!ctx) return;

  if (
    !(await canChatAction(req.userId!, 'manage_groups', req)) &&
    !(await canChatAction(req.userId!, 'manage_group_settings', req))
  ) {
    res.status(403).json({ error: 'Sem permissão no CRM para alterar as definições do grupo.' });
    return;
  }

  const warnings: string[] = [];
  const disappearingSeconds = disappearingSecondsMap[parsed.data.disappearing];
  const memberAddMode =
    parsed.data.addMembers === 'admins_only' ? 'admin_add' : 'all_member_add';

  const tryOptional = async (labelPt: string, attempts: Array<{ path: string; body: Record<string, unknown> }>) => {
    for (const a of attempts) {
      const r = await uazapiService.groupPostOptional(ctx.instanceToken, a.path, a.body);
      if (r.applied) return;
      if (r.status !== 404) {
        const err = new Error(`${labelPt}: falha na UazAPI`);
        (err as any).status = r.status;
        throw err;
      }
    }
    warnings.push(
      `${labelPt}: esta versão da UazAPI não expõe alteração desta opção (rota em falta). As restantes foram aplicadas quando possível.`
    );
  };

  try {
    await uazapiService.groupUpdateAnnounce(ctx.instanceToken, {
      groupjid: ctx.groupJid,
      announce: parsed.data.sendMessages === 'admins_only',
    });
    await uazapiService.groupUpdateLocked(ctx.instanceToken, {
      groupjid: ctx.groupJid,
      locked: parsed.data.editGroupInfo === 'admins_only',
    });

    await tryOptional('Aprovação para novos membros', [
      {
        path: '/group/updateJoinApproval',
        body: { groupjid: ctx.groupJid, joinApprovalRequired: parsed.data.joinApprovalRequired },
      },
      {
        path: '/group/updateJoinApproval',
        body: { groupjid: ctx.groupJid, JoinApprovalRequired: parsed.data.joinApprovalRequired },
      },
    ]);

    await tryOptional('Quem pode adicionar membros', [
      { path: '/group/updateMemberAddMode', body: { groupjid: ctx.groupJid, memberAddMode } },
      { path: '/group/updateMemberAddMode', body: { groupjid: ctx.groupJid, MemberAddMode: memberAddMode } },
    ]);

    await tryOptional('Mensagens temporárias', [
      { path: '/group/updateEphemeral', body: { groupjid: ctx.groupJid, disappearingTimer: disappearingSeconds } },
      { path: '/group/updateEphemeral', body: { groupjid: ctx.groupJid, DisappearingTimer: disappearingSeconds } },
      { path: '/group/updateDisappearing', body: { groupjid: ctx.groupJid, disappearingTimer: disappearingSeconds } },
      { path: '/group/updateDisappearing', body: { groupjid: ctx.groupJid, DisappearingTimer: disappearingSeconds } },
    ]);

    await insertChatGroupAdminAudit({
      tenantId: req.tenantId ?? null,
      actorUserId: req.userId!,
      conversationId: ctx.conversationId,
      instanceId: ctx.instanceId,
      groupJid: ctx.groupJid,
      action: 'group_update_settings',
      payload: { ...parsed.data, warnings },
      uazapiStatus: 200,
      errorMessage: null,
    });

    const fresh = await uazapiService.groupInfo(ctx.instanceToken, {
      groupjid: ctx.groupJid,
      getInviteLink: true,
      getRequestsParticipants: false,
      force: true,
    });
    const group = normalizeUazGroupInfo(fresh);
    group.participants = await enrichGroupParticipantsWithDirectConversationAvatars(group.participants, {
      instanceId: ctx.instanceId,
      userId: req.userId!,
    });
    await persistGroupConversationMetadata(ctx, group, req);
    res.json({ ok: true, group, warnings });
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 502;
    let msg = e?.message || 'Falha ao aplicar definições do grupo';
    if (status === 403) {
      msg =
        'Não tem permissão para alterar as definições deste grupo (é necessário ser administrador).';
    }
    await insertChatGroupAdminAudit({
      tenantId: req.tenantId ?? null,
      actorUserId: req.userId!,
      conversationId: ctx.conversationId,
      instanceId: ctx.instanceId,
      groupJid: ctx.groupJid,
      action: 'group_update_settings',
      payload: parsed.data as unknown as Record<string, unknown>,
      uazapiStatus: status,
      errorMessage: msg,
    });
    res.status(status >= 400 && status < 600 ? status : 502).json({
      error: msg,
      details: e?.payload,
    });
  }
}

type ParticipantProfileSyncStatus = 'synced' | 'not_found' | 'failed';

type ParticipantProfileSyncResultJson = {
  participantJid: string;
  phone: string | null;
  displayName: string | null;
  participantAvatarUrl: string | null;
  profilePicUrl: string | null;
  directConversationId: string | null;
  status: ParticipantProfileSyncStatus;
  reason?: string | null;
  participant?: ReturnType<typeof toParticipantRow> | null;
};

function digitsOnlyKey(input: string | null | undefined): string {
  return String(input ?? '').replace(/\D/g, '');
}

function decodeParticipantJidParam(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function toParticipantRow(p: {
  jid: string;
  lid: string | null;
  phone: string | null;
  phoneDisplay: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  displayName: string | null;
  profilePicUrl: string | null;
}) {
  return {
    jid: p.jid,
    lid: p.lid,
    phone: p.phone,
    phoneDisplay: p.phoneDisplay,
    isAdmin: p.isAdmin,
    isSuperAdmin: p.isSuperAdmin,
    displayName: p.displayName,
    profilePicUrl: p.profilePicUrl,
  };
}

function findGroupParticipant(
  participants: ReturnType<typeof normalizeParticipant>[],
  paramJid: string
): ReturnType<typeof normalizeParticipant> | null {
  const decoded = decodeParticipantJidParam(paramJid).trim().toLowerCase();
  for (const p of participants) {
    const jl = (p.jid || '').trim().toLowerCase();
    if (jl && jl === decoded) return p;
    const lid = (p.lid || '').trim().toLowerCase();
    if (lid && lid === decoded) return p;
  }
  const digits = decoded.replace(/\D/g, '');
  if (digits.length >= 8) {
    for (const p of participants) {
      const pj = (p.jid || '').trim().toLowerCase();
      if (pj.startsWith(`${digits}@`)) return p;
      const ph = digitsOnlyKey(p.phone);
      if (ph === digits) return p;
    }
  }
  return null;
}

async function loadDirectConversationForParticipant(
  ctx: UazGroupContext,
  userId: string,
  p: { jid: string; lid: string | null; phone: string | null }
): Promise<Record<string, unknown> | null> {
  const keys = new Set<string>();
  const jl = p.jid?.trim().toLowerCase();
  if (jl) keys.add(jl);
  const lid = p.lid?.trim().toLowerCase();
  if (lid) keys.add(lid);
  const d = (p.phone && digitsOnlyKey(p.phone)) || digitsFromJid(p.jid);
  if (d.length >= 8) {
    keys.add(d);
    keys.add(`${d}@s.whatsapp.net`);
    keys.add(`${d}@c.us`);
  }
  const keyArr = [...keys].filter(Boolean);
  if (keyArr.length === 0) return null;
  const r = await pool.query(
    `
    SELECT c.*
    FROM chat_conversations c
    WHERE c.instance_id = $1::uuid
      AND c.conversation_type = 'direct'
      AND COALESCE(c.provider, 'whatsapp_uazapi') <> 'whatsapp_official'
      AND ${SQL_CHAT_ACCESS_PREDICATE}
      AND (
        lower(c.external_chat_id) = ANY($3::text[])
        OR lower(COALESCE(c.canonical_chat_id, '')) = ANY($3::text[])
        OR lower(COALESCE(c.provider_conversation_id, '')) = ANY($3::text[])
        OR NULLIF(regexp_replace(COALESCE(c.phone_number, ''), '[^0-9]', '', 'g'), '')::text = ANY($3::text[])
        OR NULLIF(regexp_replace(COALESCE(c.canonical_phone, ''), '[^0-9]', '', 'g'), '')::text = ANY($3::text[])
      )
    ORDER BY c.updated_at DESC
    LIMIT 1
    `,
    [ctx.instanceId, userId, keyArr]
  );
  return (r.rows[0] as Record<string, unknown>) ?? null;
}

async function applyGroupParticipantProfileToDirectConversation(
  req: AuthRequest,
  p: ReturnType<typeof normalizeParticipant>,
  directRow: Record<string, unknown>
): Promise<void> {
  const convId = String(directRow.id);
  const userId = String(directRow.user_id ?? req.userId!);
  const incomingPic = typeof p.profilePicUrl === 'string' ? p.profilePicUrl.trim() : '';

  const metaBase =
    directRow.metadata && typeof directRow.metadata === 'object' && !Array.isArray(directRow.metadata)
      ? ({ ...(directRow.metadata as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  if (incomingPic) {
    metaBase.whatsapp_profile_photo = incomingPic;
  }

  const fromMeta = extractUazapiChatImageUrl(metaBase);
  const rowAvatar =
    typeof directRow.avatar_url === 'string' && directRow.avatar_url.trim() ? directRow.avatar_url.trim() : null;
  const mergedAvatarUrl = incomingPic || fromMeta || rowAvatar;

  const patch = await resolveConversationAvatarWithCache({
    tenantId: req.tenantId ?? null,
    userId,
    mergedAvatarUrl,
    existingAvatarUrl: rowAvatar,
    existingCachedUrl:
      typeof directRow.avatar_cached_url === 'string' && directRow.avatar_cached_url.trim()
        ? directRow.avatar_cached_url.trim()
        : null,
    existingSourceUrl:
      typeof directRow.avatar_source_url === 'string' && directRow.avatar_source_url.trim()
        ? directRow.avatar_source_url.trim()
        : null,
  });

  await pool.query(
    `
    UPDATE chat_conversations SET
      metadata = $2::jsonb,
      avatar_url = COALESCE($3, avatar_url),
      avatar_cached_url = COALESCE($4, avatar_cached_url),
      avatar_source_url = COALESCE($5, avatar_source_url),
      avatar_cached_at = COALESCE($6::timestamptz, avatar_cached_at),
      avatar_cache_status = COALESCE($7, avatar_cache_status),
      updated_at = now()
    WHERE id = $1::uuid
    `,
    [
      convId,
      JSON.stringify(metaBase),
      patch.avatar_url,
      patch.avatar_cached_url,
      patch.avatar_source_url,
      patch.avatar_cached_at,
      patch.avatar_cache_status,
    ],
  );

  const freshR = await pool.query(`SELECT * FROM chat_conversations WHERE id = $1::uuid LIMIT 1`, [convId]);
  const upserted = freshR.rows[0] as Record<string, unknown>;

  await persistConversationAvatarToCrm(
    userId,
    (upserted.client_id as string | null) ?? null,
    ((upserted as { lead_id?: string | null }).lead_id as string | null) ?? null,
    (upserted.avatar_url as string | null) ?? null,
    {
      cachedUrl: (upserted.avatar_cached_url as string | null) ?? null,
      sourceUrl: (upserted.avatar_source_url as string | null) ?? null,
      cachedAt: (upserted.avatar_cached_at as Date | string | null) ?? null,
      status: (upserted.avatar_cache_status as string | null) ?? null,
    },
  );

  emitConversationUpdate(userId, conversationRowForClientApi(upserted));
}

function participantAvatarFromEnriched(row: ReturnType<typeof normalizeParticipant> | { participantAvatarUrl?: string | null }): string | null {
  if ('participantAvatarUrl' in row && row.participantAvatarUrl != null) {
    return row.participantAvatarUrl;
  }
  return null;
}

async function runSingleParticipantProfileSync(params: {
  ctx: UazGroupContext;
  req: AuthRequest;
  participant: ReturnType<typeof normalizeParticipant>;
}): Promise<ParticipantProfileSyncResultJson> {
  const { ctx, req, participant: p } = params;
  const direct = await loadDirectConversationForParticipant(ctx, req.userId!, p);
  if (!direct) {
    const [enOne] = await enrichGroupParticipantsWithDirectConversationAvatars([p], {
      instanceId: ctx.instanceId,
      userId: req.userId!,
    });
    const row = enOne ?? p;
    return {
      participantJid: p.jid,
      phone: p.phone,
      displayName: p.displayName,
      participantAvatarUrl: participantAvatarFromEnriched(row),
      profilePicUrl: p.profilePicUrl,
      directConversationId: null,
      status: 'not_found',
      reason: 'Não existe conversa directa correspondente neste inbox.',
      participant: toParticipantRow(row),
    };
  }

  try {
    await applyGroupParticipantProfileToDirectConversation(req, p, direct);
  } catch (e: any) {
    return {
      participantJid: p.jid,
      phone: p.phone,
      displayName: p.displayName,
      participantAvatarUrl: null,
      profilePicUrl: p.profilePicUrl,
      directConversationId: String(direct.id),
      status: 'failed',
      reason: e?.message ?? String(e),
      participant: toParticipantRow(p),
    };
  }

  const [enAfter] = await enrichGroupParticipantsWithDirectConversationAvatars([p], {
    instanceId: ctx.instanceId,
    userId: req.userId!,
  });
  const row = enAfter ?? p;

  return {
    participantJid: p.jid,
    phone: p.phone,
    displayName: p.displayName,
    participantAvatarUrl: participantAvatarFromEnriched(row),
    profilePicUrl: p.profilePicUrl,
    directConversationId: String(direct.id),
    status: 'synced',
    reason: null,
    participant: toParticipantRow(row),
  };
}

const zSyncMissingBody = z.object({
  limit: z.number().int().min(1).max(100).optional(),
});

export async function postChatGroupParticipantSyncProfile(req: AuthRequest, res: Response) {
  const ctx = await loadUazapiGroupContext(req.params.id, req.userId!, res);
  if (!ctx) return;
  if (
    !(await canChatAction(req.userId!, 'manage_groups', req)) &&
    !(await canChatAction(req.userId!, 'manage_group_participants', req))
  ) {
    res.status(403).json({ error: 'Sem permissão no CRM para sincronizar participantes.' });
    return;
  }
  try {
    const raw = await uazapiService.groupInfo(ctx.instanceToken, {
      groupjid: ctx.groupJid,
      getInviteLink: false,
      getRequestsParticipants: false,
      force: true,
    });
    const group = normalizeUazGroupInfo(raw);
    const p = findGroupParticipant(group.participants, req.params.participantJid ?? '');
    if (!p) {
      const wanted = decodeParticipantJidParam(req.params.participantJid ?? '').trim();
      res.json({
        participantJid: wanted || (req.params.participantJid ?? ''),
        phone: null,
        displayName: null,
        participantAvatarUrl: null,
        profilePicUrl: null,
        directConversationId: null,
        status: 'not_found' as const,
        reason: 'JID não consta na lista atual de participantes.',
        participant: null,
      });
      return;
    }
    const out = await runSingleParticipantProfileSync({ ctx, req, participant: p });
    res.json(out);
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 502;
    const msg = e?.message || 'Falha ao sincronizar perfil do participante';
    res.status(status >= 400 && status < 600 ? status : 502).json({ error: msg, details: e?.payload });
  }
}

export async function postChatGroupParticipantsSyncMissing(req: AuthRequest, res: Response) {
  const ctx = await loadUazapiGroupContext(req.params.id, req.userId!, res);
  if (!ctx) return;
  if (
    !(await canChatAction(req.userId!, 'manage_groups', req)) &&
    !(await canChatAction(req.userId!, 'manage_group_participants', req))
  ) {
    res.status(403).json({ error: 'Sem permissão no CRM para sincronizar participantes.' });
    return;
  }
  const parsed = zSyncMissingBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
    return;
  }
  const limit = parsed.data.limit ?? 25;
  try {
    const raw = await uazapiService.groupInfo(ctx.instanceToken, {
      groupjid: ctx.groupJid,
      getInviteLink: false,
      getRequestsParticipants: false,
      force: true,
    });
    const group = normalizeUazGroupInfo(raw);
    const enriched = await enrichGroupParticipantsWithDirectConversationAvatars(group.participants, {
      instanceId: ctx.instanceId,
      userId: req.userId!,
    });

    const candidates = enriched
      .filter((p) => {
        const hasPic = Boolean(p.profilePicUrl?.trim());
        if (!hasPic) return false;
        const av = p.participantAvatarUrl;
        if (!av) return true;
        if (isWhatsAppCdnAvatarUrl(av)) return true;
        return !isUsablePersistedAvatar(av);
      })
      .slice(0, limit);

    const results: ParticipantProfileSyncResultJson[] = [];
    for (const row of candidates) {
      const base: ReturnType<typeof normalizeParticipant> = {
        jid: row.jid,
        lid: row.lid,
        phone: row.phone,
        phoneDisplay: row.phoneDisplay,
        isAdmin: row.isAdmin,
        isSuperAdmin: row.isSuperAdmin,
        displayName: row.displayName,
        profilePicUrl: row.profilePicUrl,
      };
      results.push(await runSingleParticipantProfileSync({ ctx, req, participant: base }));
    }

    res.json({ ok: true, processed: results.length, results });
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 502;
    const msg = e?.message || 'Falha ao sincronizar perfis em falta';
    res.status(status >= 400 && status < 600 ? status : 502).json({ error: msg, details: e?.payload });
  }
}
