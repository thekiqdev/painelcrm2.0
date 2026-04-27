/**
 * Restauro da listagem `/clients` (scroll + URL de retorno segura) ao voltar de ações rápidas.
 */

const SCROLL_STORAGE_KEY = 'painelcrm.clientsList.scroll.v1';
const SCROLL_MAX_AGE_MS = 45 * 60_000;

export function isClientsListHref(href: string): boolean {
  try {
    const u = new URL(href, 'http://localhost');
    const p = u.pathname.replace(/\/$/, '') || '/';
    return p === '/clients';
  } catch {
    return false;
  }
}

/** Valida `return_path` (apenas listagem de clientes, com query opcional). */
export function parseClientsListReturnPath(raw: string | null | undefined): string | null {
  if (raw == null || !String(raw).trim()) return null;
  try {
    const decoded = decodeURIComponent(String(raw).trim());
    const u = new URL(decoded, 'http://localhost');
    const p = u.pathname.replace(/\/$/, '') || '/';
    if (p !== '/clients') return null;
    return u.pathname + (u.search || '');
  } catch {
    return null;
  }
}

/** Anexa `return_path` a um `href` relativo ou absoluto do mesmo origin. */
export function appendClientsListReturnPath(href: string, listHref: string): string {
  if (!isClientsListHref(listHref)) return href;
  const q = `return_path=${encodeURIComponent(listHref)}`;
  if (href.includes('?')) return `${href}&${q}`;
  return `${href}?${q}`;
}

export function saveClientsListScrollPosition(): void {
  if (typeof window === 'undefined') return;
  const pathname = window.location.pathname.replace(/\/$/, '') || '/';
  if (pathname !== '/clients') return;
  const listHref = window.location.pathname + window.location.search;
  const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
  try {
    sessionStorage.setItem(
      SCROLL_STORAGE_KEY,
      JSON.stringify({ scrollY, listHref, savedAt: Date.now() }),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export function consumeClientsListScrollPosition(listHref: string): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SCROLL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { scrollY?: number; listHref?: string; savedAt?: number };
    sessionStorage.removeItem(SCROLL_STORAGE_KEY);
    if (parsed.listHref !== listHref) return null;
    if (typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > SCROLL_MAX_AGE_MS) return null;
    return typeof parsed.scrollY === 'number' && Number.isFinite(parsed.scrollY) ? parsed.scrollY : null;
  } catch {
    try {
      sessionStorage.removeItem(SCROLL_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}
