import { QueryClient } from "@tanstack/react-query";
import { clearActiveChatPersistentCache } from "@/lib/chatPersistentCache";
import { clearChatPageCacheForSession } from "@/lib/chatPageCache";

let lastChatCacheScope: { tenantId: string; userId: string } | null = null;

/** Regista sessão ativa para limpeza no logout (multi-tenant). */
export function registerChatCacheSession(tenantId: string, userId: string): void {
  lastChatCacheScope = { tenantId, userId };
}

/**
 * Instância única do QueryClient para poder limpar cache no logout/troca de conta.
 * Defaults globais conservadores; queries sensíveis devem sobrescrever com tenant/user na key.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 15 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      retry: 1,
      retryDelay: 1000,
    },
  },
});

/** Limpa todo o cache React Query (logout, impersonação, troca de sessão). */
export function clearAllCachedAppData(): void {
  if (lastChatCacheScope) {
    clearChatPageCacheForSession(lastChatCacheScope);
    void clearActiveChatPersistentCache();
    lastChatCacheScope = null;
  }
  queryClient.clear();
}
