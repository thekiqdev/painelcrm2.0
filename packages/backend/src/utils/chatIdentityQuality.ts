/**
 * Heurísticas de qualidade para identidade de conversa WhatsApp (UazAPI → CRM).
 * Objetivo: não persistir nem sobrescrever dados bons com payload fraco do provedor.
 */

import { extractUazapiChatImageUrl, mergeAvatarUrlForPersistence } from './uazapiChatIdentity.js';

export function digitsOnlyMsisdn(s: string): string {
  return s.replace(/\D/g, '');
}

/** Nome que é só dígitos (ou quase) — típico fallback de lista pobre, não “nome real”. */
export function isDigitsOnlyDisplayName(name: string): boolean {
  const t = name.trim();
  if (!t) return true;
  const d = digitsOnlyMsisdn(t);
  return d.length >= 10 && d === digitsOnlyMsisdn(t.replace(/\s/g, ''));
}

/**
 * `true` = identificador fraco (não deve substituir nome humano já salvo).
 * - vazio
 * - só dígitos (MSISDN)
 * - igual ao telefone conhecido (normalizado por dígitos)
 * - igual ao usuário local do JID (@s.whatsapp.net / @c.us), quando aplicável
 */
export function isWeakChatDisplayName(
  name: string | null | undefined,
  phoneDigits: string | null | undefined,
  externalChatId: string
): boolean {
  const n = typeof name === 'string' ? name.trim() : '';
  if (!n) return true;
  if (isDigitsOnlyDisplayName(n)) return true;

  const extLower = externalChatId.toLowerCase();
  if (extLower.endsWith('@lid')) {
    const local = externalChatId.split('@')[0] || '';
    if (n === externalChatId || n === local) return true;
  }

  const nameD = digitsOnlyMsisdn(n);
  if (phoneDigits && nameD && nameD === digitsOnlyMsisdn(phoneDigits)) return true;

  const lower = externalChatId.toLowerCase();
  if (lower.endsWith('@s.whatsapp.net') || lower.endsWith('@c.us')) {
    const local = externalChatId.split('@')[0] || '';
    const jidD = digitsOnlyMsisdn(local);
    if (jidD.length >= 10 && nameD && nameD === jidD) return true;
  }

  return false;
}

export function isStrongChatDisplayName(
  name: string | null | undefined,
  phoneDigits: string | null | undefined,
  externalChatId: string
): boolean {
  return !isWeakChatDisplayName(name, phoneDigits, externalChatId);
}

export function isWeakLastMessagePreview(preview: string | null | undefined): boolean {
  if (preview == null) return true;
  const t = String(preview).trim();
  return t.length === 0;
}

/**
 * Mescla metadata vinda da UazAPI sem apagar foto/url útil com strings vazias.
 */
export function mergeChatMetadataForIdentity(
  currentMeta: Record<string, unknown>,
  incomingRaw: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const inc =
    incomingRaw && typeof incomingRaw === 'object' && !Array.isArray(incomingRaw)
      ? { ...incomingRaw }
      : {};
  for (const k of [
    'image',
    'imagePreview',
    'image_preview',
    'profilePicUrl',
    'profilePicture',
    'pictureUrl',
    'whatsapp_profile_photo',
    'profile_pic_url',
  ]) {
    const v = inc[k as keyof typeof inc];
    if (v === '' || v === null) delete inc[k];
  }
  const merged: Record<string, unknown> = { ...currentMeta, ...inc };
  const oldUrl = extractUazapiChatImageUrl(currentMeta);
  const newUrl = extractUazapiChatImageUrl(inc);
  const best = mergeAvatarUrlForPersistence(newUrl, oldUrl);
  if (best) {
    merged.whatsapp_profile_photo = best;
  }
  return merged;
}

/** Nunca sobrescreve nome forte com nome fraco; se ambos fortes, prevalece o incoming (sync mais recente). */
export function mergeContactNameForUpsert(
  existing: string | null | undefined,
  incoming: string | null | undefined,
  phoneDigits: string | null | undefined,
  externalChatId: string
): string | null {
  const ex = typeof existing === 'string' ? existing.trim() : '';
  const inc = typeof incoming === 'string' ? incoming.trim() : '';
  const exS = ex ? isStrongChatDisplayName(ex, phoneDigits, externalChatId) : false;
  const incS = inc ? isStrongChatDisplayName(inc, phoneDigits, externalChatId) : false;
  if (exS && !incS) return ex;
  if (!exS && incS) return inc;
  if (exS && incS) return inc;
  if (!exS && !incS) return ex || null;
  return ex || inc || null;
}

export function mergeProfileNameForUpsert(
  existing: string | null | undefined,
  incoming: string | null | undefined,
  mergedContactName: string | null,
  phoneDigits: string | null | undefined,
  externalChatId: string
): string | null {
  const ex = typeof existing === 'string' ? existing.trim() : '';
  const inc = typeof incoming === 'string' ? incoming.trim() : '';
  const exS = ex ? isStrongChatDisplayName(ex, phoneDigits, externalChatId) : false;
  const incS = inc ? isStrongChatDisplayName(inc, phoneDigits, externalChatId) : false;
  if (mergedContactName && inc === mergedContactName && isWeakChatDisplayName(inc, phoneDigits, externalChatId)) {
    return ex || null;
  }
  if (exS && !incS) return ex;
  if (!exS && incS) return inc;
  if (exS && incS) return inc;
  if (!exS && !incS) return ex || null;
  return ex || inc || null;
}

export function mergePhoneForUpsert(
  existing: string | null | undefined,
  incoming: string | null | undefined
): string | null {
  const inc = incoming?.trim() || null;
  const ex = existing?.trim() || null;
  if (!inc) return ex;
  if (!ex) return inc;
  if (digitsOnlyMsisdn(inc) === digitsOnlyMsisdn(ex)) return ex;
  return inc;
}

export function mergeLastMessageAtForUpsert(
  existingAt: Date | null | undefined,
  incomingAt: Date | null | undefined
): Date | null {
  if (!incomingAt) return existingAt ?? null;
  if (!existingAt) return incomingAt;
  return incomingAt.getTime() >= existingAt.getTime() ? incomingAt : existingAt;
}

export function mergeLastMessagePreviewForUpsert(
  existingPreview: string | null | undefined,
  existingAt: Date | null | undefined,
  incomingPreview: string | null | undefined,
  incomingAt: Date | null | undefined
): string | null {
  const exP = existingPreview?.trim() || null;
  const inP = incomingPreview?.trim() || null;

  if (!incomingAt) {
    return exP || inP || null;
  }
  const inMs = incomingAt.getTime();
  const exMs = existingAt ? existingAt.getTime() : 0;
  if (inMs < exMs) {
    return exP || inP || null;
  }

  if (!isWeakLastMessagePreview(inP)) {
    return inP;
  }
  return exP || inP || null;
}
