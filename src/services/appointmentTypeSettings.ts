import { apiClient } from "@/integrations/api/client";

export type AppointmentTypeSetting = {
  id: string;
  type_key: string;
  label: string;
  description: string | null;
  default_duration_minutes: number;
  color: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export async function listAppointmentTypeSettings(): Promise<{ items: AppointmentTypeSetting[] }> {
  const res = await apiClient.get<{ items: AppointmentTypeSetting[] }>("/api/appointments/type-settings");
  if (res.error || !res.data) throw new Error(res.error || "Erro ao carregar tipos");
  return res.data;
}

export async function createAppointmentTypeSetting(body: {
  type_key: string;
  label: string;
  description?: string | null;
  default_duration_minutes: number;
  color?: string | null;
  sort_order?: number;
}): Promise<{ item: AppointmentTypeSetting }> {
  const res = await apiClient.post<{ item: AppointmentTypeSetting }>("/api/appointments/type-settings", body);
  if (res.error || !res.data) throw new Error(res.error || "Erro ao criar tipo");
  return res.data;
}

export async function patchAppointmentTypeSetting(
  id: string,
  body: Partial<{
    label: string;
    description: string | null;
    default_duration_minutes: number;
    color: string | null;
    is_active: boolean;
    sort_order: number;
  }>,
): Promise<{ item: AppointmentTypeSetting }> {
  const res = await apiClient.patch<{ item: AppointmentTypeSetting }>(`/api/appointments/type-settings/${id}`, body);
  if (res.error || !res.data) throw new Error(res.error || "Erro ao guardar tipo");
  return res.data;
}

export async function disableAppointmentTypeSetting(id: string): Promise<{ item: AppointmentTypeSetting }> {
  const res = await apiClient.post<{ item: AppointmentTypeSetting }>(`/api/appointments/type-settings/${id}/disable`, {});
  if (res.error || !res.data) throw new Error(res.error || "Erro ao desativar tipo");
  return res.data;
}
