import { useQuery } from "@tanstack/react-query";
import { useFloatingChatOptional } from "@/features/floating-chat/floatingChatContext";
import { resolveConversationIdForCrmRecord } from "@/lib/resolveChatConversationForCrm";
import { chatService } from "@/services/chat";
import { clientsService } from "@/services/clients";
import { ticketsService } from "@/services/tickets";

const CLOSED_TICKET_STATUSES = new Set(["closed", "cancelled"]);

export function formatBrlFromCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

type SeedTicket = { status?: string };

export function useEntityQuickViewMetrics(params: {
  entityKind: "client" | "lead";
  entityId: string;
  canViewFinance: boolean;
  canViewTickets: boolean;
  canViewChat: boolean;
  /** Tickets embutidos no payload do lead (evita listar todos os tickets). */
  seedTickets?: SeedTicket[] | null;
}) {
  const { entityKind, entityId, canViewFinance, canViewTickets, canViewChat, seedTickets } = params;
  const floatingChat = useFloatingChatOptional();

  const financialQuery = useQuery({
    queryKey: ["entity-drawer-financial", entityId],
    queryFn: () => clientsService.getClientFinancialSummary(entityId),
    enabled: entityKind === "client" && canViewFinance && Boolean(entityId),
    staleTime: 30_000,
    retry: 1,
  });

  const ticketsQuery = useQuery({
    queryKey: ["entity-drawer-tickets", entityId],
    queryFn: () => ticketsService.getTickets({ client_id: entityId }),
    enabled: entityKind === "client" && canViewTickets && Boolean(entityId),
    staleTime: 30_000,
    retry: 1,
  });

  const seedTicketRows = seedTickets ?? [];

  const conversationsQuery = useQuery({
    queryKey: [
      "entity-drawer-conversations",
      entityKind,
      entityId,
      floatingChat?.instanceIds,
      floatingChat?.inboxScope,
    ],
    queryFn: async () => {
      if (entityKind === "client" && canViewChat) {
        const res = await chatService.getClientMessages(entityId);
        return res.conversationIds?.length ?? (res.conversationId ? 1 : 0);
      }
      if (entityKind === "lead" && floatingChat && canViewChat) {
        const cid = await resolveConversationIdForCrmRecord({
          leadId: entityId,
          instanceIds: floatingChat.instanceIds,
          inboxScope: floatingChat.inboxScope,
        });
        return cid ? 1 : 0;
      }
      return 0;
    },
    enabled: canViewChat && Boolean(entityId),
    staleTime: 30_000,
    retry: 1,
  });

  const tickets: SeedTicket[] =
    entityKind === "client" ? (ticketsQuery.data ?? []) : seedTicketRows;
  const openTicketsCount = tickets.filter(
    (t) => t.status && !CLOSED_TICKET_STATUSES.has(t.status),
  ).length;
  const financial = financialQuery.data;
  const invoicesCount = financial?.invoices_count ?? 0;
  const totalBilledCents = financial
    ? financial.paid_amount_cents + financial.open_amount_cents + financial.overdue_amount_cents
    : 0;

  const metricsLoading =
    (entityKind === "client" && canViewFinance && financialQuery.isLoading) ||
    (entityKind === "client" && canViewTickets && ticketsQuery.isLoading) ||
    (canViewChat && conversationsQuery.isLoading);

  return {
    metricsLoading,
    totalBilledCents,
    invoicesCount,
    ticketsCount: tickets.length,
    openTicketsCount,
    conversationsCount: conversationsQuery.data ?? 0,
    hasInvoices: invoicesCount > 0,
    hasOpenTicket: openTicketsCount > 0,
  };
}
