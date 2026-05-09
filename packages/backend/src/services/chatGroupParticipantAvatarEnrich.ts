import { pool } from '../utils/db.js';
import {
  isChatAvatarProxyUrl,
  isPersistentStoredAvatarUrl,
  isUsablePersistedAvatar,
  isWhatsAppCdnAvatarUrl,
} from '../utils/uazapiChatIdentity.js';

/** Limite por pedido — evita arrays gigantes no IN / ANY. */
export const MAX_GROUP_PARTICIPANT_AVATAR_ENRICH = 200;

export type NormalizedGroupParticipant = {
  jid: string;
  lid: string | null;
  phone: string | null;
  phoneDisplay: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  displayName: string | null;
  profilePicUrl: string | null;
};

export type EnrichedGroupParticipant = NormalizedGroupParticipant & {
  participantAvatarUrl: string | null;
};

type ConvAvatarRow = {
  external_chat_id: string;
  canonical_chat_id: string | null;
  provider_conversation_id: string | null;
  phone_number: string | null;
  canonical_phone: string | null;
  avatar_cached_url: string | null;
  avatar_url: string | null;
  avatar_cache_status: string | null;
};

function digitsOnly(input: string | null | undefined): string {
  return String(input ?? '').replace(/\D/g, '');
}

function digitsFromJid(jid: string): string {
  return (jid.split('@')[0] || '').replace(/\D/g, '');
}

function isLocalhostUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === 'localhost' || h === '127.0.0.1';
  } catch {
    return false;
  }
}

/**
 * Escolhe URL de avatar a partir da linha da conversa directa (prioriza cache estável / útil).
 */
export function pickConversationAvatarForParticipantRow(row: ConvAvatarRow): string | null {
  const c = typeof row.avatar_cached_url === 'string' ? row.avatar_cached_url.trim() : '';
  const a = typeof row.avatar_url === 'string' ? row.avatar_url.trim() : '';
  const badStatus = row.avatar_cache_status === 'fetch_failed';

  const scoreUrl = (u: string): number => {
    if (!u || isLocalhostUrl(u)) return -1;
    if (isPersistentStoredAvatarUrl(u)) return 4;
    if (u.includes('/api/media/v1/raw') || u.includes('/api/public/catalog-media/raw')) return 4;
    if (isUsablePersistedAvatar(u)) return 3;
    if (isWhatsAppCdnAvatarUrl(u)) return 1;
    return 0;
  };

  let best: string | null = null;
  let bestScore = -1;
  for (const u of [c, a]) {
    if (!u) continue;
    let s = scoreUrl(u);
    if (badStatus && isWhatsAppCdnAvatarUrl(u) && s <= 1) continue;
    if (s > bestScore) {
      bestScore = s;
      best = u;
    }
  }
  return bestScore >= 0 ? best : null;
}

function mergeConvRows(a: ConvAvatarRow, b: ConvAvatarRow): ConvAvatarRow {
  const pa = pickConversationAvatarForParticipantRow(a);
  const pb = pickConversationAvatarForParticipantRow(b);
  const sa = pa ? (isPersistentStoredAvatarUrl(pa) ? 2 : 1) : 0;
  const sb = pb ? (isPersistentStoredAvatarUrl(pb) ? 2 : 1) : 0;
  return sa >= sb ? a : b;
}

function indexConversationRows(rows: ConvAvatarRow[]): Map<string, ConvAvatarRow> {
  const m = new Map<string, ConvAvatarRow>();
  const put = (key: string, row: ConvAvatarRow) => {
    if (!key) return;
    const cur = m.get(key);
    m.set(key, cur ? mergeConvRows(cur, row) : row);
  };
  for (const r of rows) {
    put(r.external_chat_id.trim().toLowerCase(), r);
    if (r.canonical_chat_id?.trim()) put(r.canonical_chat_id.trim().toLowerCase(), r);
    if (r.provider_conversation_id?.trim()) put(r.provider_conversation_id.trim().toLowerCase(), r);
    const pn = digitsOnly(r.phone_number);
    if (pn.length >= 8) put(pn, r);
    const cp = digitsOnly(r.canonical_phone);
    if (cp.length >= 8) put(cp, r);
  }
  return m;
}

function findRowForParticipant(
  p: NormalizedGroupParticipant,
  m: Map<string, ConvAvatarRow>
): ConvAvatarRow | undefined {
  const jl = p.jid?.trim().toLowerCase() ?? '';
  if (jl && m.has(jl)) return m.get(jl);
  const d = (p.phone && digitsOnly(p.phone)) || digitsFromJid(p.jid);
  if (d.length >= 8) {
    if (m.has(d)) return m.get(d);
    const sj = `${d}@s.whatsapp.net`;
    if (m.has(sj)) return m.get(sj);
    const cj = `${d}@c.us`;
    if (m.has(cj)) return m.get(cj);
  }
  return undefined;
}

/**
 * UazAPI primeiro; se só CDN frágil e existir cache interno estável, preferir interno.
 */
function resolveParticipantAvatarUrl(
  p: NormalizedGroupParticipant,
  row: ConvAvatarRow | undefined
): string | null {
  const internal = row ? pickConversationAvatarForParticipantRow(row) : null;
  const uaz = p.profilePicUrl?.trim() || null;

  if (uaz) {
    if (isPersistentStoredAvatarUrl(uaz) || (!isWhatsAppCdnAvatarUrl(uaz) && !isChatAvatarProxyUrl(uaz))) {
      return uaz;
    }
    if (internal && isPersistentStoredAvatarUrl(internal)) {
      return internal;
    }
    return uaz;
  }
  return internal;
}

/**
 * Enriquece lista de participantes com avatar reaproveitado de conversas directas (mesma instância e inbox).
 * Uma única query SQL + merge em memória.
 */
export async function enrichGroupParticipantsWithDirectConversationAvatars(
  participants: NormalizedGroupParticipant[],
  params: { instanceId: string; userId: string }
): Promise<EnrichedGroupParticipant[]> {
  if (participants.length === 0) return [];

  const slice = participants.slice(0, MAX_GROUP_PARTICIPANT_AVATAR_ENRICH);
  const tail =
    participants.length > MAX_GROUP_PARTICIPANT_AVATAR_ENRICH
      ? participants.slice(MAX_GROUP_PARTICIPANT_AVATAR_ENRICH).map((p) => ({
          ...p,
          participantAvatarUrl: resolveParticipantAvatarUrl(p, undefined),
        }))
      : [];

  const keySet = new Set<string>();
  for (const p of slice) {
    const jl = p.jid?.trim().toLowerCase();
    if (jl) keySet.add(jl);
    const d = (p.phone && digitsOnly(p.phone)) || digitsFromJid(p.jid);
    if (d.length >= 8) {
      keySet.add(d);
      keySet.add(`${d}@s.whatsapp.net`);
      keySet.add(`${d}@c.us`);
    }
  }

  const keys = [...keySet].filter(Boolean);
  if (keys.length === 0) {
    return [
      ...slice.map((p) => ({
        ...p,
        participantAvatarUrl: resolveParticipantAvatarUrl(p, undefined),
      })),
      ...tail,
    ];
  }

  const r = await pool.query<ConvAvatarRow>(
    `
    SELECT
      c.external_chat_id,
      c.canonical_chat_id,
      c.provider_conversation_id,
      c.phone_number,
      c.canonical_phone,
      c.avatar_cached_url,
      c.avatar_url,
      c.avatar_cache_status
    FROM chat_conversations c
    WHERE c.user_id = $1::uuid
      AND c.instance_id = $2::uuid
      AND c.conversation_type = 'direct'
      AND COALESCE(c.provider, 'whatsapp_uazapi') <> 'whatsapp_official'
      AND (
        lower(c.external_chat_id) = ANY($3::text[])
        OR lower(COALESCE(c.canonical_chat_id, '')) = ANY($3::text[])
        OR lower(COALESCE(c.provider_conversation_id, '')) = ANY($3::text[])
        OR regexp_replace(COALESCE(c.phone_number, ''), '[^0-9]', '', 'g') = ANY($3::text[])
        OR regexp_replace(COALESCE(c.canonical_phone, ''), '[^0-9]', '', 'g') = ANY($3::text[])
      )
    `,
    [params.userId, params.instanceId, keys]
  );

  const map = indexConversationRows(r.rows);
  const enrichedSlice = slice.map((p) => {
    const row = findRowForParticipant(p, map);
    return {
      ...p,
      participantAvatarUrl: resolveParticipantAvatarUrl(p, row),
    };
  });

  return [...enrichedSlice, ...tail];
}
