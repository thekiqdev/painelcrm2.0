import { QueryClient } from "@tanstack/react-query";

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
  queryClient.clear();
}
