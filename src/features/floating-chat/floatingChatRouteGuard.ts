/**
 * Esconder o chat flutuante só na central de conversas (lista + thread).
 * Mantém visível em `/chat/kanbam` (Kanban) e rotas fora de `/chat`.
 */
export function shouldHideFloatingChat(pathname: string): boolean {
  if (pathname === '/chat') return true;
  const match = pathname.match(/^\/chat\/([^/]+)/);
  if (!match) return false;
  const seg = match[1].toLowerCase();
  if (seg === 'kanbam' || seg === 'kanban') return false;
  return true;
}
