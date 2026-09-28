import type { QueryClient } from "@tanstack/react-query";

export type TasksListFilterKey = {
  scope: string;
  origin: string;
  q: string;
  due: string;
  sort: string;
};

export function tasksInfiniteListQueryKey(
  tenantId: string,
  userId: string,
  filters: TasksListFilterKey,
) {
  return ["tasks", "unified", tenantId, userId, "infinite", filters] as const;
}

export function tasksSummaryQueryKey(tenantId: string, userId: string) {
  return ["tasks", "unified", tenantId, userId, "summary"] as const;
}

/** Invalida listagem + resumo para o par tenant/usuário (prefix match). */
export function invalidateTenantUserTasksQueries(
  queryClient: QueryClient,
  tenantId: string,
  userId: string,
) {
  void queryClient.invalidateQueries({ queryKey: ["tasks", "unified", tenantId, userId] });
}
