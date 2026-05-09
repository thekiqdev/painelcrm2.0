import type { QueryClient } from '@tanstack/react-query';

/** Após remover instância UazAPI / WhatsApp: limpa caches do chat para não mostrar conversas antigas. */
export function resetWhatsAppIntegrationCaches(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['floating-chat'] });
  void queryClient.removeQueries({ queryKey: ['floating-chat'] });
  void queryClient.invalidateQueries({ queryKey: ['chat'] });
  void queryClient.invalidateQueries({ queryKey: ['chat-runtime-config'] });
  void queryClient.invalidateQueries({ queryKey: ['connections'] });
}
