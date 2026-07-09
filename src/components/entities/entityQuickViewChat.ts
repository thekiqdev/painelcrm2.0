import { toast } from "sonner";
import type { QueryClient } from "@tanstack/react-query";
import type { FloatingChatContextValue } from "@/features/floating-chat/floatingChatContext";
import { resolveConversationIdForCrmRecord } from "@/lib/resolveChatConversationForCrm";
import { chatService, type ChatInstance } from "@/services/chat";
import { ensureChatInstances } from "@/features/chat-core/runtime";
import { invalidateFloatingChatAggregates } from "@/features/floating-chat/floatingChatQueries";

export function isConnectedChatInstance(instance: ChatInstance): boolean {
  const status = String(instance.status || "").toLowerCase();
  const enabled = instance.metadata?.enabled_in_chat !== false;
  return enabled && Boolean(instance.can_operate ?? true) && (status === "connected" || status === "open");
}

async function getFirstConnectedInstanceId(): Promise<string | null> {
  const instances = (await ensureChatInstances({ reason: "bootstrap" })).filter(isConnectedChatInstance);
  return instances[0]?.id ?? null;
}

async function createConversationForEntity(params: {
  entityKind: "client" | "lead";
  entityId: string;
  phone?: string | null;
}): Promise<string> {
  const { entityKind, entityId, phone } = params;

  if (!phone?.trim()) {
    throw new Error(
      entityKind === "client"
        ? "Cadastre um telefone WhatsApp no cliente."
        : "Este lead ainda não possui telefone para iniciar conversa.",
    );
  }

  const instanceId = await getFirstConnectedInstanceId();
  if (!instanceId) {
    throw new Error("Conecte uma instância WhatsApp para iniciar conversa.");
  }

  if (entityKind === "client") {
    const prepared = await chatService.resolveConversationForClient({
      client_id: entityId,
      instance_id: instanceId,
    });
    return prepared.conversation.id;
  }

  const prepared = await chatService.prepareLeadConversation({
    lead_id: entityId,
    instance_id: instanceId,
  });
  return prepared.conversation.id;
}

function dispatchFloatingChatOpen(conversationId: string): void {
  window.dispatchEvent(
    new CustomEvent("painelcrm:floating-chat-open", {
      detail: { conversationId, source: "entity_drawer" },
    }),
  );
}

/**
 * Abre o chat lateral/flutuante. Reutiliza conversa existente ou cria automaticamente.
 * Nunca navega para `/chat`.
 */
export async function openEntityWhatsAppFloatingChat(params: {
  entityKind: "client" | "lead";
  entityId: string;
  phone?: string | null;
  floatingChat: FloatingChatContextValue | null;
  queryClient: QueryClient;
  onBeforeOpen?: () => void;
}): Promise<void> {
  const { entityKind, entityId, phone, floatingChat, queryClient, onBeforeOpen } = params;

  try {
    let conversationId: string | null = null;

    if (floatingChat) {
      conversationId = await resolveConversationIdForCrmRecord({
        clientId: entityKind === "client" ? entityId : undefined,
        leadId: entityKind === "lead" ? entityId : undefined,
        instanceIds: floatingChat.instanceIds,
        inboxScope: floatingChat.inboxScope,
      });
    }

    if (!conversationId) {
      conversationId = await createConversationForEntity({ entityKind, entityId, phone });
    }

    onBeforeOpen?.();

    if (floatingChat) {
      floatingChat.openConversationInContext(conversationId);
    } else {
      dispatchFloatingChatOpen(conversationId);
    }

    invalidateFloatingChatAggregates(queryClient);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Não foi possível abrir a conversa.");
  }
}
