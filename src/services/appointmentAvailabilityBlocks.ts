import { apiClient } from "@/integrations/api/client";

export type AvailabilityBlockScope = "tenant" | "user";
export type AvailabilityBlockType =
  | "manual"
  | "holiday"
  | "vacation"
  | "external_meeting"
  | "maintenance"
  | "other";

export type AvailabilityBlock = {
  id: string;
  tenant_id: string;
  user_id: string | null;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  block_scope: AvailabilityBlockScope;
  block_type: AvailabilityBlockType;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
};

export type ListAvailabilityBlocksParams = {
  date_from?: string;
  date_to?: string;
  user_id?: string;
  block_scope?: AvailabilityBlockScope;
  block_type?: AvailabilityBlockType;
};

export async function listAvailabilityBlocks(
  params?: ListAvailabilityBlocksParams,
): Promise<{ blocks: AvailabilityBlock[] }> {
  const sp = new URLSearchParams();
  if (params?.date_from) sp.set("date_from", params.date_from);
  if (params?.date_to) sp.set("date_to", params.date_to);
  if (params?.user_id) sp.set("user_id", params.user_id);
  if (params?.block_scope) sp.set("block_scope", params.block_scope);
  if (params?.block_type) sp.set("block_type", params.block_type);
  const q = sp.toString();
  const res = await apiClient.get<{ blocks: AvailabilityBlock[] }>(
    `/api/appointments/availability-blocks${q ? `?${q}` : ""}`,
  );
  if (res.error || !res.data) throw new Error(res.error || "Erro ao listar bloqueios");
  return res.data;
}

export type CreateAvailabilityBlockBody = {
  title: string;
  description?: string | null;
  starts_at: string;
  ends_at: string;
  all_day?: boolean;
  block_scope: AvailabilityBlockScope;
  user_id?: string | null;
  block_type: AvailabilityBlockType;
};

export async function createAvailabilityBlock(
  body: CreateAvailabilityBlockBody,
): Promise<{ block: AvailabilityBlock }> {
  const res = await apiClient.post<{ block: AvailabilityBlock }>("/api/appointments/availability-blocks", body);
  if (res.error || !res.data) throw new Error(res.error || "Erro ao criar bloqueio");
  return res.data;
}

export type PatchAvailabilityBlockBody = Partial<
  Pick<
    CreateAvailabilityBlockBody,
    "title" | "description" | "starts_at" | "ends_at" | "all_day" | "block_scope" | "user_id" | "block_type"
  >
>;

export async function patchAvailabilityBlock(
  id: string,
  body: PatchAvailabilityBlockBody,
): Promise<{ block: AvailabilityBlock }> {
  const res = await apiClient.patch<{ block: AvailabilityBlock }>(`/api/appointments/availability-blocks/${id}`, body);
  if (res.error || !res.data) throw new Error(res.error || "Erro ao atualizar");
  return res.data;
}

export async function cancelAvailabilityBlock(id: string): Promise<{ block: AvailabilityBlock }> {
  const res = await apiClient.post<{ block: AvailabilityBlock }>(
    `/api/appointments/availability-blocks/${id}/cancel`,
    {},
  );
  if (res.error || !res.data) throw new Error(res.error || "Erro ao cancelar");
  return res.data;
}
