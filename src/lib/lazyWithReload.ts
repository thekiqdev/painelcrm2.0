import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const CHUNK_FAIL_RELOAD_KEY = 'vite_chunk_reload_pending';

function isChunkLoadError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('Unable to import module') ||
    msg.includes('Import failed')
  );
}

/**
 * Envolve `React.lazy`: quando o chunk JS não existe mais (novo deploy enquanto o SPA antigo
 * continua aberto), recarrega a página uma vez para alinhar com `index.html` e hashes atuais.
 */
export function lazyWithReload<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const mod = await factory();
      sessionStorage.removeItem(CHUNK_FAIL_RELOAD_KEY);
      return mod;
    } catch (e) {
      if (typeof window !== 'undefined' && isChunkLoadError(e)) {
        if (!sessionStorage.getItem(CHUNK_FAIL_RELOAD_KEY)) {
          sessionStorage.setItem(CHUNK_FAIL_RELOAD_KEY, '1');
          window.location.reload();
          return new Promise(() => {}) as Promise<{ default: T }>;
        }
      }
      throw e;
    }
  });
}
