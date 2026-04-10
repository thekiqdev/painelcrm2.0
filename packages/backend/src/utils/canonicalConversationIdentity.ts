/**
 * Fase B: identidade canônica (JID para histórico + exibição) separada do provider_chat_id (external_chat_id).
 */

import {
  digitsOnlyMsisdn,
  isStrongChatDisplayName,
  isWeakChatDisplayName,
} from './chatIdentityQuality.js';
import { extractUazapiChatImageUrl } from './uazapiChatIdentity.js';
import { classifyWhatsAppJid } from './uazapiIdentityResolve.js';

export type IdentityState = 'resolved' | 'unresolved';
export type IdentityStrength = 'strong' | 'medium' | 'weak';
export type HistorySyncStatus = 'ready' | 'blocked_unresolved' | 'synced' | 'failed';

export type CanonicalIdentityComputed = {
  canonical_chat_id: string | null;
  canonical_phone: string | null;
  display_name: string | null;
  avatar_url: string | null;
  identity_source: string;
  identity_strength: IdentityStrength;
  identity_state: IdentityState;
  history_sync_status: HistorySyncStatus;
  last_history_sync_reason: string | null;
};

function pnJidFromDigits(d: string): string | null {
  const x = digitsOnlyMsisdn(d);
  if (x.length >= 10 && x.length <= 15) return `${x}@s.whatsapp.net`;
  return null;
}

/**
 * Calcula camadas canônicas a partir de um payload de sync (após normalize + enrich de contatos).
 */
export function computeCanonicalIdentityFromChatPayload(params: {
  external_chat_id: string;
  phone_number: string | null;
  contact_name: string | null;
  profile_name: string | null;
  metadata: Record<string, unknown> | null;
}): CanonicalIdentityComputed {
  const ext = String(params.external_chat_id || '').trim();
  const meta = params.metadata || {};
  const hinted =
    typeof meta.uaz_message_find_chatid === 'string' ? meta.uaz_message_find_chatid.trim() : '';

  const phoneDigits = digitsOnlyMsisdn(String(params.phone_number || ''));
  const fromJidDigits =
    ext.toLowerCase().endsWith('@s.whatsapp.net') || ext.toLowerCase().endsWith('@c.us')
      ? digitsOnlyMsisdn(ext.split('@')[0] || '')
      : '';
  const canonical_phone =
    phoneDigits.length >= 10 ? phoneDigits : fromJidDigits.length >= 10 ? fromJidDigits : null;

  let canonical_chat_id: string | null = null;
  let identity_source = 'unresolved';
  let identity_strength: IdentityStrength = 'weak';

  const jidClass = classifyWhatsAppJid(ext);

  if (ext.endsWith('@g.us')) {
    canonical_chat_id = ext;
    identity_source = 'provider_jid';
    identity_strength = 'strong';
  } else if (ext.endsWith('@s.whatsapp.net') || ext.endsWith('@c.us')) {
    canonical_chat_id = ext;
    identity_source = 'provider_jid';
    identity_strength = 'strong';
  } else if (hinted.toLowerCase().includes('@s.whatsapp.net')) {
    canonical_chat_id = hinted;
    identity_source =
      meta.uaz_identity_source === 'contacts_api' ? 'contacts_api' : 'metadata_hint';
    identity_strength = 'strong';
  } else if (canonical_phone && pnJidFromDigits(canonical_phone)) {
    canonical_chat_id = pnJidFromDigits(canonical_phone);
    identity_source = 'phone_derived';
    identity_strength = 'medium';
  } else if (ext.endsWith('@lid')) {
    canonical_chat_id = null;
    identity_source = 'unresolved';
    identity_strength = 'weak';
  } else {
    canonical_chat_id = null;
    identity_source = 'unresolved';
    identity_strength = 'weak';
  }

  const identity_state: IdentityState = canonical_chat_id ? 'resolved' : 'unresolved';
  const history_sync_status: HistorySyncStatus =
    identity_state === 'resolved' ? 'ready' : 'blocked_unresolved';
  const last_history_sync_reason =
    history_sync_status === 'blocked_unresolved'
      ? jidClass === 'lid'
        ? 'unresolved_identity_lid_without_pn_jid'
        : 'unresolved_identity_no_canonical_jid'
      : null;

  const avatar_url = extractUazapiChatImageUrl(meta) || null;

  const displayFromNames = (): string | null => {
    for (const n of [params.contact_name, params.profile_name]) {
      if (typeof n !== 'string' || !n.trim()) continue;
      const t = n.trim();
      if (t.toLowerCase().includes('@lid')) continue;
      if (ext.toLowerCase().endsWith('@lid')) {
        const local = ext.split('@')[0] || '';
        if (t === ext || t === local) continue;
      }
      if (isWeakChatDisplayName(t, canonical_phone, ext)) continue;
      return t;
    }
    return null;
  };

  let display_name = displayFromNames();
  if (!display_name && canonical_phone && canonical_phone.length >= 10) {
    display_name = formatPhoneBr(canonical_phone);
  }
  if (!display_name && ext.toLowerCase().endsWith('@lid')) {
    display_name = 'Contato WhatsApp';
  }

  return {
    canonical_chat_id,
    canonical_phone,
    display_name,
    avatar_url,
    identity_source,
    identity_strength,
    identity_state,
    history_sync_status,
    last_history_sync_reason,
  };
}

function formatPhoneBr(digits: string): string {
  const d = digitsOnlyMsisdn(digits);
  if (d.length === 13 && d.startsWith('55')) {
    const rest = d.slice(4);
    if (rest.length === 9) {
      return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    }
  }
  return d.length >= 10 ? `+${d}` : d;
}

export type CanonicalRowSnapshot = {
  display_name: string | null;
  contact_name: string | null;
  profile_name: string | null;
  phone_number: string | null;
  avatar_url: string | null;
  canonical_chat_id: string | null;
  canonical_phone: string | null;
  identity_source: string | null;
  identity_strength: string | null;
  identity_state: string | null;
  history_sync_status: string | null;
  metadata: Record<string, unknown> | null;
};

/**
 * Regra: forte > médio > fraco; nunca rebaixar nome/telefone/foto/canonical com payload vazio ou fraco.
 */
export function mergeCanonicalIdentityForUpsert(
  external_chat_id: string,
  existing: CanonicalRowSnapshot | null,
  incoming: CanonicalIdentityComputed,
  opts: { incomingMetadataHasEmptyImages: boolean }
): {
  merged: CanonicalIdentityComputed;
  degraded_write_blocked: {
    display_name: boolean;
    avatar_url: boolean;
    phone: boolean;
    canonical: boolean;
  };
  merge_decision: string;
} {
  const degraded_write_blocked = {
    display_name: false,
    avatar_url: false,
    phone: false,
    canonical: false,
  };
  if (!existing) {
    return {
      merged: incoming,
      degraded_write_blocked,
      merge_decision: 'insert_incoming_only',
    };
  }

  const ext = external_chat_id;
  const exDigits = digitsOnlyMsisdn(
    String(existing.phone_number || existing.canonical_phone || '')
  );
  const inDigits = digitsOnlyMsisdn(String(incoming.canonical_phone || ''));
  let mergedDigits = '';
  if (exDigits.length >= 10 && inDigits.length >= 10) {
    mergedDigits = exDigits.length >= inDigits.length ? exDigits : inDigits;
  } else if (exDigits.length >= 10) {
    mergedDigits = exDigits;
  } else if (inDigits.length >= 10) {
    mergedDigits = inDigits;
  }
  const mergedPhone = mergedDigits.length >= 10 ? mergedDigits : null;

  if (exDigits.length >= 10 && inDigits.length === 0) {
    degraded_write_blocked.phone = true;
  }

  let mergedCanonical = incoming.canonical_chat_id ?? existing.canonical_chat_id ?? null;
  if (existing.canonical_chat_id && !incoming.canonical_chat_id) {
    mergedCanonical = existing.canonical_chat_id;
    degraded_write_blocked.canonical = true;
  }
  if (
    existing.canonical_chat_id &&
    incoming.canonical_chat_id &&
    existing.canonical_chat_id !== incoming.canonical_chat_id
  ) {
    mergedCanonical = preferStrongerCanonical(existing.canonical_chat_id, incoming.canonical_chat_id, ext);
  }

  const phoneDigitsForName = mergedPhone || null;

  let mergedDisplay = incoming.display_name;
  const exDisp = existing.display_name?.trim() || existing.contact_name?.trim() || null;
  const incDisp = incoming.display_name?.trim() || null;
  if (exDisp && (!incDisp || isWeakerDisplayName(incDisp, exDisp, phoneDigitsForName, ext))) {
    mergedDisplay = exDisp;
    if (incDisp && incDisp !== exDisp) degraded_write_blocked.display_name = true;
  } else if (!exDisp && incDisp) {
    mergedDisplay = incDisp;
  } else if (exDisp && incDisp) {
    const exS = isStrongChatDisplayName(exDisp, phoneDigitsForName, ext);
    const inS = isStrongChatDisplayName(incDisp, phoneDigitsForName, ext);
    mergedDisplay = exS && !inS ? exDisp : incDisp || exDisp;
    if (exS && !inS) degraded_write_blocked.display_name = true;
  }

  let mergedAvatar = incoming.avatar_url;
  const exAv = existing.avatar_url?.trim() || extractUazapiChatImageUrl(existing.metadata) || null;
  const incAv = incoming.avatar_url?.trim() || null;
  if (exAv && (!incAv || opts.incomingMetadataHasEmptyImages)) {
    mergedAvatar = exAv;
    if (!incAv) degraded_write_blocked.avatar_url = true;
  } else if (!exAv && incAv) {
    mergedAvatar = incAv;
  } else {
    mergedAvatar = incAv || exAv;
  }

  const identity_state: IdentityState = mergedCanonical ? 'resolved' : 'unresolved';
  let history_sync_status: HistorySyncStatus =
    identity_state === 'resolved' ? 'ready' : 'blocked_unresolved';
  let last_history_sync_reason =
    history_sync_status === 'blocked_unresolved'
      ? 'unresolved_identity_no_canonical_jid'
      : null;

  if (existing.history_sync_status === 'synced' && identity_state === 'resolved') {
    history_sync_status = 'synced';
    last_history_sync_reason = null;
  }

  const identity_strength: IdentityStrength =
    identity_state === 'resolved'
      ? existing.identity_strength === 'strong' || incoming.identity_strength === 'strong'
        ? 'strong'
        : 'medium'
      : incoming.identity_strength;

  const identity_source =
    mergedCanonical && incoming.identity_source !== 'unresolved'
      ? incoming.identity_source
      : existing.identity_source || incoming.identity_source;

  return {
    merged: {
      canonical_chat_id: mergedCanonical,
      canonical_phone: mergedPhone ? digitsOnlyMsisdn(mergedPhone) : null,
      display_name: mergedDisplay,
      avatar_url: mergedAvatar,
      identity_source,
      identity_strength,
      identity_state,
      history_sync_status,
      last_history_sync_reason,
    },
    degraded_write_blocked,
    merge_decision: 'merge_preserve_strong',
  };
}

function isWeakerDisplayName(
  inc: string | null,
  ex: string | null,
  phoneDigits: string | null,
  externalChatId: string
): boolean {
  if (!inc) return true;
  if (!ex) return false;
  return isWeakChatDisplayName(inc, phoneDigits, externalChatId) && !isWeakChatDisplayName(ex, phoneDigits, externalChatId);
}

function preferStrongerCanonical(a: string, b: string, _ext: string): string {
  if (a.endsWith('@g.us')) return a;
  if (b.endsWith('@g.us')) return b;
  if (a.toLowerCase().endsWith('@s.whatsapp.net') && b.toLowerCase().endsWith('@lid')) return a;
  if (b.toLowerCase().endsWith('@s.whatsapp.net') && a.toLowerCase().endsWith('@lid')) return b;
  return b;
}

export function incomingChatPayloadHasEmptyProfileImages(meta: Record<string, unknown> | null): boolean {
  if (!meta || typeof meta !== 'object') return true;
  const img = meta.image ?? meta.imagePreview ?? meta.image_preview;
  return img === '' || img == null;
}
