import { chatRouteMarkChunkLoaded, chatRouteTime, chatRouteTimeEnd } from '@/lib/chatRouteTiming';

/** Import dinâmico partilhado — App lazy + routePreload usam o mesmo chunk. */
export function loadChatPage(origin: 'lazy' | 'preload' = 'lazy') {
  const startLabel = origin === 'preload' ? 'chunk_preload_start' : 'chunk_download_start';
  chatRouteTime(startLabel);
  return import('./Chat').then((mod) => {
    chatRouteMarkChunkLoaded();
    chatRouteTimeEnd(origin === 'preload' ? 'chunk_preload_done' : 'chunk_download_done');
    return mod;
  });
}

/** Pré-carrega o chunk JS do Chat (hover menu / mount AppLayout). */
export function preloadChatPageChunk(): void {
  void loadChatPage('preload');
}
