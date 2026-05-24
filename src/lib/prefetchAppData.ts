import { queryClient } from "@/lib/queryClient";
import { dashboardService } from "@/services/dashboard";
import { tasksService } from "@/services/tasks";
import { clientsService } from "@/services/clients";
import { apiClient } from "@/integrations/api/client";
import { chatService } from "@/services/chat";
import { prefetchFloatingChatLists } from "@/features/floating-chat/floatingChatQueries";

export function prefetchDashboardOverview(tenantId: string, userId: string): void {
  if (!tenantId || !userId) return;
  void queryClient.prefetchQuery({
    queryKey: ["dashboard-overview", tenantId, userId, "current_month"],
    queryFn: () => dashboardService.getOverview({ preset: "current_month" }),
    staleTime: 60_000,
  });
}

export function prefetchTasksSummaryNav(tenantId: string, userId: string): void {
  if (!tenantId || !userId) return;
  void queryClient.prefetchQuery({
    queryKey: ["tasks", "unified", tenantId, userId, "summary"],
    queryFn: () => tasksService.getTasksSummary(),
    staleTime: 60_000,
  });
}

export function prefetchClientsListNav(tenantId: string, userId: string): void {
  if (!tenantId || !userId) return;
  void queryClient.prefetchQuery({
    queryKey: ["clients", "list", tenantId, userId],
    queryFn: async () => {
      const [groupsData, clientsData] = await Promise.all([
        clientsService.getClientGroups(),
        clientsService.getClients(),
      ]);
      const groups = groupsData || [];
      const formatted = (clientsData || []).map(
        (client: Record<string, unknown> & { client_groups?: { name?: string } }) => ({
          id: client.id,
          name: client.name,
          company: client.company,
          email: client.email,
          phone: client.phone,
          status: client.status,
          group: client.client_groups?.name || "",
          group_id: client.group_id,
          notes: client.notes,
          cpf_cnpj: client.cpf_cnpj ?? null,
          whatsapp_avatar_url: client.whatsapp_avatar_url ?? null,
        }),
      );
      return { clients: formatted, groups };
    },
    staleTime: 60_000,
  });
}

export function prefetchLeadsListNav(tenantId: string, userId: string): void {
  if (!tenantId || !userId) return;
  void queryClient.prefetchQuery({
    queryKey: ["leads", tenantId, userId, "name", "asc", "all"],
    queryFn: async () => {
      const response = await apiClient.get("/api/leads");
      if (response.error) throw new Error(response.error);
      let data = (response.data || []) as Record<string, unknown>[];
      data = [...data].sort((a, b) => {
        const aVal = String(a.name ?? "");
        const bVal = String(b.name ?? "");
        return aVal > bVal ? 1 : -1;
      });
      return data;
    },
    staleTime: 60_000,
  });
}

/** Pré-aquece chunk do chat + listas do float (cache React Query). */
export function prefetchChatWarm(tenantId: string, userId: string, hasTenantInbox: boolean): void {
  if (!tenantId || !userId) return;
  void import("@/pages/Chat");
  void (async () => {
    try {
      const instances = await chatService.listInstances();
      const ids = instances
        .filter(
          (inst) =>
            (inst.metadata as Record<string, unknown> | null | undefined)?.enabled_in_chat !== false,
        )
        .map((i) => i.id);
      const inboxScope = hasTenantInbox ? ("tenant" as const) : ("owner" as const);
      await prefetchFloatingChatLists(queryClient, ids, inboxScope);
    } catch {
      /* ignore */
    }
  })();
}
