import { queryClient } from "@/lib/queryClient";
import { dashboardService } from "@/services/dashboard";
import { tasksService } from "@/services/tasks";
import { apiClient } from "@/integrations/api/client";
import { prefetchChatCoreIdle } from "@/lib/chatPrefetch";

const NAV_PREFETCH_STALE_MS = 60_000;

function apiResponseForbidden(res: { details?: { status?: number } }): boolean {
  const status = res.details?.status;
  return status === 403 || status === 401;
}

/** Prefetch de nav — não repete request, não faz retry, ignora 403 silenciosamente. */
function prefetchNavQuery<T>(opts: {
  allowed?: boolean;
  queryKey: readonly unknown[];
  queryFn: () => Promise<T>;
  staleTime?: number;
}): void {
  if (opts.allowed === false) return;
  if (queryClient.getQueryData(opts.queryKey) !== undefined) return;
  void queryClient.prefetchQuery({
    queryKey: opts.queryKey,
    queryFn: opts.queryFn,
    staleTime: opts.staleTime ?? NAV_PREFETCH_STALE_MS,
    retry: false,
  });
}

export function prefetchDashboardOverview(
  tenantId: string,
  userId: string,
  allowed = true,
): void {
  if (!tenantId || !userId) return;
  prefetchNavQuery({
    allowed,
    queryKey: ["dashboard-overview", tenantId, userId, "current_month"],
    queryFn: () => dashboardService.getOverview({ preset: "current_month" }),
  });
}

export function prefetchTasksSummaryNav(
  tenantId: string,
  userId: string,
  allowed = true,
): void {
  if (!tenantId || !userId) return;
  prefetchNavQuery({
    allowed,
    queryKey: ["tasks", "unified", tenantId, userId, "summary"],
    queryFn: () => tasksService.getTasksSummary(),
  });
}

export function prefetchClientsListNav(
  tenantId: string,
  userId: string,
  allowed = true,
): void {
  if (!tenantId || !userId) return;
  prefetchNavQuery({
    allowed,
    queryKey: ["clients", "list", tenantId, userId],
    queryFn: async () => {
      const [groupsRes, clientsRes] = await Promise.all([
        apiClient.get<Array<Record<string, unknown>>>("/api/client-groups"),
        apiClient.get<Array<Record<string, unknown> & { client_groups?: { name?: string } }>>(
          "/api/clients",
        ),
      ]);
      if (apiResponseForbidden(groupsRes) || apiResponseForbidden(clientsRes)) {
        return { clients: [], groups: [] as Array<Record<string, unknown>> };
      }
      if (groupsRes.error) throw new Error(groupsRes.error);
      if (clientsRes.error) throw new Error(clientsRes.error);
      const groups = groupsRes.data || [];
      const formatted = (clientsRes.data || []).map((client) => ({
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
      }));
      return { clients: formatted, groups };
    },
  });
}

export function prefetchLeadsListNav(
  tenantId: string,
  userId: string,
  allowed = true,
): void {
  if (!tenantId || !userId) return;
  prefetchNavQuery({
    allowed,
    queryKey: ["leads", tenantId, userId, "name", "asc", "all"],
    queryFn: async () => {
      const response = await apiClient.get<Record<string, unknown>[]>("/api/leads");
      if (apiResponseForbidden(response)) return [];
      if (response.error) throw new Error(response.error);
      let data = response.data || [];
      data = [...data].sort((a, b) => {
        const aVal = String(a.name ?? "");
        const bVal = String(b.name ?? "");
        return aVal > bVal ? 1 : -1;
      });
      return data;
    },
  });
}

/** Pré-aquece chunk do chat + listas do float (cache React Query, idle). */
export function prefetchChatWarm(tenantId: string, userId: string, hasTenantInbox: boolean): void {
  prefetchChatCoreIdle(tenantId, userId, hasTenantInbox);
}
