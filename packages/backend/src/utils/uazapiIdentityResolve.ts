/**
 * Resolução de JID / identidade exibível alinhada à doc UazAPI:
 * - POST /message/find espera `chatid` no formato internacional (ex.: …@s.whatsapp.net)
 * - GET /contacts e POST /contacts/list trazem agenda com `jid` + nome (fonte forte de identidade)
 * - `wa_chatid` em @lid é ID interno do provedor — não deve ser título na UI nem único caminho para histórico
 */

import {
  digitsOnlyMsisdn,
  isStrongChatDisplayName,
  isWeakChatDisplayName,
} from './chatIdentityQuality.js';
import {
  extractUazapiChatImageUrl,
  mergeAvatarUrlForPersistence,
  resolveFinalConversationAvatarUrl,
} from './uazapiChatIdentity.js';

export type WhatsAppJidClass = 'group' | 'lid' | 's_whatsapp' | 'c_us' | 'other';

export function classifyWhatsAppJid(jid: string | null | undefined): WhatsAppJidClass {
  const s = typeof jid === 'string' ? jid.trim().toLowerCase() : '';
  if (!s) return 'other';
  if (s.endsWith('@g.us')) return 'group';
  if (s.endsWith('@lid')) return 'lid';
  if (s.endsWith('@s.whatsapp.net')) return 's_whatsapp';
  if (s.endsWith('@c.us')) return 'c_us';
  return 'other';
}

export type MessageFindResolution = {
  chatid: string;
  strategy:
    | 'db_canonical_column'
    | 'metadata_uaz_message_find_chatid'
    | 'provider_private_jid'
    | 'provider_group_jid'
    | 'derived_from_phone_number'
    | 'lid_no_pn_resolve_use_raw'
    | 'passthrough';
  jid_class: WhatsAppJidClass;
};

/**
 * Escolhe o `chatid` para POST /message/find.
 * Doc: exemplo oficial usa `5511999999999@s.whatsapp.net` — priorizar JID PN quando @lid tiver telefone ou hint na agenda.
 */
export function resolveMessageFindChatId(args: {
  external_chat_id: string;
  phone_number?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Coluna persistida após fase B — tem precedência sobre heurísticas em metadata. */
  canonical_chat_id?: string | null;
}): MessageFindResolution {
  const ext = String(args.external_chat_id || '').trim();
  const jidClass = classifyWhatsAppJid(ext);
  const meta = args.metadata && typeof args.metadata === 'object' ? args.metadata : {};

  const fromColumn =
    typeof args.canonical_chat_id === 'string' && args.canonical_chat_id.trim()
      ? args.canonical_chat_id.trim()
      : '';
  if (fromColumn) {
    return {
      chatid: fromColumn,
      strategy: 'db_canonical_column',
      jid_class: jidClass,
    };
  }

  const hinted =
    typeof meta.uaz_message_find_chatid === 'string' ? meta.uaz_message_find_chatid.trim() : '';
  if (hinted && hinted.toLowerCase().includes('@s.whatsapp.net')) {
    return {
      chatid: hinted,
      strategy: 'metadata_uaz_message_find_chatid',
      jid_class: jidClass,
    };
  }

  if (ext.endsWith('@g.us')) {
    return { chatid: ext, strategy: 'provider_group_jid', jid_class: 'group' };
  }

  if (ext.endsWith('@s.whatsapp.net') || ext.endsWith('@c.us')) {
    return { chatid: ext, strategy: 'provider_private_jid', jid_class: jidClass };
  }

  const phoneDigits = digitsOnlyMsisdn(String(args.phone_number || ''));
  if (phoneDigits.length >= 10 && phoneDigits.length <= 15) {
    return {
      chatid: `${phoneDigits}@s.whatsapp.net`,
      strategy: 'derived_from_phone_number',
      jid_class: jidClass,
    };
  }

  if (ext.endsWith('@lid')) {
    return {
      chatid: ext,
      strategy: 'lid_no_pn_resolve_use_raw',
      jid_class: 'lid',
    };
  }

  return { chatid: ext, strategy: 'passthrough', jid_class: jidClass };
}

export type UazContactCatalogEntry = {
  jid: string;
  label: string | null;
};

/**
 * Indexa contatos da UazAPI por dígitos do local-part do JID (MSISDN).
 */
/**
 * Decide se vale carregar GET/POST contacts (agenda completa) após `chat/find`.
 * Regra: @lid sem JID PN no metadata precisa da agenda; ou nome ainda fraco com MSISDN conhecido.
 */
export function shouldLoadContactCatalogForIdentityEnrichment(args: {
  externalChatId: string;
  contactName: string | null;
  profileName: string | null;
  phoneNumber: string | null;
  metadata: unknown;
}): boolean {
  const ext = String(args.externalChatId || '').trim();
  const extLower = ext.toLowerCase();
  const meta =
    args.metadata && typeof args.metadata === 'object' && !Array.isArray(args.metadata)
      ? (args.metadata as Record<string, unknown>)
      : {};
  const hinted =
    typeof meta.uaz_message_find_chatid === 'string' ? meta.uaz_message_find_chatid.trim() : '';
  const hasPnHint =
    hinted.length > 0 && hinted.toLowerCase().includes('@s.whatsapp.net');

  if (extLower.endsWith('@lid') && !hasPnHint) {
    return true;
  }

  const digits = digitsOnlyMsisdn(String(args.phoneNumber || ''));
  if (digits.length < 10) {
    return false;
  }

  const weakContact = isWeakChatDisplayName(args.contactName, digits, ext);
  const weakProfile = isWeakChatDisplayName(args.profileName, digits, ext);
  return weakContact && weakProfile;
}

export function indexContactsByMsisdn(
  rows: Array<Record<string, unknown>>
): Map<string, UazContactCatalogEntry> {
  const map = new Map<string, UazContactCatalogEntry>();
  for (const r of rows) {
    const jidRaw = r.jid;
    if (typeof jidRaw !== 'string' || !jidRaw.trim()) continue;
    const jid = jidRaw.trim();
    if (!jid.toLowerCase().endsWith('@s.whatsapp.net')) continue;
    const local = jid.split('@')[0] || '';
    const d = digitsOnlyMsisdn(local);
    if (d.length < 10 || d.length > 15) continue;
    const name =
      (typeof r.contactName === 'string' && r.contactName.trim()
        ? r.contactName.trim()
        : null) ||
      (typeof r.contact_name === 'string' && r.contact_name.trim()
        ? r.contact_name.trim()
        : null) ||
      (typeof r.contact_FirstName === 'string' && r.contact_FirstName.trim()
        ? r.contact_FirstName.trim()
        : null);
    const prev = map.get(d);
    if (!prev || (name && !prev.label)) {
      map.set(d, { jid, label: name });
    }
  }
  return map;
}

type NormalizedChatPayload = {
  externalChatId: string;
  contactName: string | null;
  profileName: string | null;
  phoneNumber: string | null;
  metadata: unknown;
};

/**
 * Enriquece payload já normalizado: agenda (contatos) como fonte primária de nome e de JID PN para histórico em chats @lid.
 */
export function enrichNormalizedChatFromContactCatalog(
  normalized: NormalizedChatPayload,
  catalog: Map<string, UazContactCatalogEntry>
): void {
  const digits = digitsOnlyMsisdn(normalized.phoneNumber || '');
  if (digits.length < 10) return;
  const hit = catalog.get(digits);
  if (!hit) return;

  const ext = normalized.externalChatId;
  const meta =
    normalized.metadata && typeof normalized.metadata === 'object' && !Array.isArray(normalized.metadata)
      ? ({ ...(normalized.metadata as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  if (ext.toLowerCase().endsWith('@lid') && hit.jid.toLowerCase().endsWith('@s.whatsapp.net')) {
    meta.uaz_message_find_chatid = hit.jid;
    meta.uaz_identity_source = 'contacts_api';
    meta.uaz_identity_strength = 'high';
    normalized.metadata = meta;
  }

  if (hit.label && isStrongChatDisplayName(hit.label, digits, hit.jid)) {
    const weakIncoming =
      !normalized.contactName ||
      isWeakChatDisplayName(normalized.contactName, digits, ext);
    if (weakIncoming) {
      normalized.contactName = hit.label;
    }
  }
}

/** Formatação simples para exibição quando não há nome humano (evita mostrar JID cru). */
export function formatMsisdnForDisplay(digits: string): string {
  const d = digitsOnlyMsisdn(digits);
  if (d.length < 10) return d;
  if (d.length === 13 && d.startsWith('55')) {
    const rest = d.slice(4);
    if (rest.length === 9) {
      return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    }
  }
  return `+${d}`;
}

/**
 * Nome seguro para lista/API quando `contact_name` no banco ainda pode refletir payload fraco ou @lid.
 */
export function pickDisplayContactName(row: {
  display_name?: string | null;
  contact_name?: string | null;
  profile_name?: string | null;
  phone_number?: string | null;
  canonical_phone?: string | null;
  external_chat_id?: string | null;
  identity_state?: string | null;
}): string | null {
  if (typeof row.display_name === 'string' && row.display_name.trim()) {
    return row.display_name.trim();
  }
  const ext = String(row.external_chat_id || '');
  const phoneDigits =
    digitsOnlyMsisdn(String(row.phone_number || '')) ||
    digitsOnlyMsisdn(String(row.canonical_phone || ''));

  const tryName = (v: string | null | undefined): string | null => {
    if (typeof v !== 'string' || !v.trim()) return null;
    const t = v.trim();
    if (t.toLowerCase().includes('@lid')) return null;
    if (ext.toLowerCase().endsWith('@lid')) {
      const local = ext.split('@')[0] || '';
      if (t === ext || t === local) return null;
    }
    if (isWeakChatDisplayName(t, phoneDigits || null, ext)) return null;
    return t;
  };

  const fromName = tryName(row.contact_name) || tryName(row.profile_name);
  if (fromName) return fromName;

  if (phoneDigits.length >= 10) return formatMsisdnForDisplay(phoneDigits);

  if (ext.toLowerCase().endsWith('@lid') || row.identity_state === 'unresolved') {
    return 'Contato WhatsApp';
  }

  return null;
}

export function conversationRowForClientApi(row: Record<string, unknown>): Record<string, unknown> {
  const display = pickDisplayContactName({
    display_name: row.display_name as string | null,
    contact_name: row.contact_name as string | null,
    profile_name: row.profile_name as string | null,
    phone_number: row.phone_number as string | null,
    canonical_phone: row.canonical_phone as string | null,
    external_chat_id: row.external_chat_id as string | null,
    identity_state: row.identity_state as string | null,
  });
  const baseMeta =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? { ...(row.metadata as Record<string, unknown>) }
      : {};
  const fromCol =
    typeof row.avatar_url === 'string' && row.avatar_url.trim() ? row.avatar_url.trim() : null;
  const fromMeta = extractUazapiChatImageUrl(baseMeta);
  const layered = resolveFinalConversationAvatarUrl(row);
  const av = layered ?? mergeAvatarUrlForPersistence(fromCol, fromMeta);
  if (av) {
    baseMeta.whatsapp_profile_photo = av;
  }
  return {
    ...row,
    avatar_url: av ?? null,
    final_avatar_url: av ?? null,
    contact_name: display ?? row.contact_name ?? null,
    metadata: Object.keys(baseMeta).length > 0 ? baseMeta : row.metadata ?? null,
  };
}
