/** Disparar depois de abrir um lead para o badge do menu atualizar. */
export const LEADS_UNSEEN_REFRESH_EVENT = 'painelcrm:leads:unseen-refresh';

export function notifyLeadsUnseenChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(LEADS_UNSEEN_REFRESH_EVENT));
}
