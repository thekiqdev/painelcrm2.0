/**
 * URL de foto do operador (atendente) para <img> / AvatarImage.
 * Alinhado ao header da app (`normalizeCatalogMediaUrlForBrowser`) + regras do chat.
 */
import { chatAvatarUrlForImgSrc } from '@/lib/chatAvatarUrl';
import { normalizeCatalogMediaUrlForBrowser } from '@/services/catalogMediaUpload';

/** Resolve avatar do atendente a partir de profiles/users.avatar_url (ou assignee_avatar_url da API). */
export function resolveAssigneeAvatarSrc(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;

  let normalized = t;
  try {
    normalized = normalizeCatalogMediaUrlForBrowser(t);
  } catch {
    normalized = t;
  }

  const viaChat = chatAvatarUrlForImgSrc(normalized);
  if (viaChat) return viaChat;

  // Fallback: path relativo que o helper do chat rejeitava no `new URL` sem base.
  if (normalized.startsWith('/')) return normalized;
  return normalized || null;
}
