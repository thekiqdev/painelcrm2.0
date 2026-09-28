/** Token JWT após confirmar código WhatsApp — enviado em `X-Profile-Edit-Token` no PUT perfil / POST avatar. */

export const ME_PROFILE_EDIT_TOKEN_STORAGE_KEY = 'painelcrm_me_profile_edit_token';

function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const json = JSON.parse(atob(b64)) as { exp?: number };
    return json && typeof json === 'object' ? json : null;
  } catch {
    return null;
  }
}

export function isMeProfileEditTokenValid(token: string | null | undefined): boolean {
  if (!token?.trim()) return false;
  const payload = decodeJwtPayload(token.trim());
  if (payload?.exp == null || typeof payload.exp !== 'number') return false;
  return payload.exp * 1000 > Date.now() + 5000;
}

export function loadMeProfileEditTokenFromStorage(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const t = sessionStorage.getItem(ME_PROFILE_EDIT_TOKEN_STORAGE_KEY)?.trim();
    if (!t) return null;
    return isMeProfileEditTokenValid(t) ? t : null;
  } catch {
    return null;
  }
}

export function persistMeProfileEditToken(token: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(ME_PROFILE_EDIT_TOKEN_STORAGE_KEY, token.trim());
  } catch {
    /* ignore */
  }
}

export function clearMeProfileEditToken(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(ME_PROFILE_EDIT_TOKEN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
