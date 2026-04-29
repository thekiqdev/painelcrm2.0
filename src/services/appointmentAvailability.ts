import { apiClient } from "@/integrations/api/client";

export type AvailabilityForm = {
  timezone: string;
  slot_duration_minutes: number;
  default_meeting_duration_minutes: number;
  min_notice_minutes: number;
  max_days_ahead: number;
  /** Máx. compromissos no mesmo horário (mesmo responsável) na remarcação pública; 1–20. */
  capacity_per_slot: number;
  weekdays: number[];
  work_start_time: string;
  work_end_time: string;
  break_start_time: string | null;
  break_end_time: string | null;
  block_holidays: boolean;
  holiday_country_code: string;
  holiday_state_code: string | null;
  holiday_city: string | null;
};

export async function getTenantAvailabilitySettings(): Promise<{ settings: AvailabilityForm }> {
  const res = await apiClient.get<{ settings: AvailabilityForm }>("/api/appointments/tenant-availability-settings");
  if (res.error || !res.data) throw new Error(res.error || "Erro ao carregar");
  return res.data;
}

export async function patchTenantAvailabilitySettings(
  patch: Partial<AvailabilityForm>,
): Promise<{ settings: AvailabilityForm }> {
  const res = await apiClient.patch<{ settings: AvailabilityForm }>(
    "/api/appointments/tenant-availability-settings",
    patch,
  );
  if (res.error || !res.data) throw new Error(res.error || "Erro ao guardar");
  return res.data;
}

export async function getUserAvailabilitySettings(userId?: string): Promise<{
  target_user_id: string;
  user_settings: (AvailabilityForm & { is_active: boolean }) | null;
  company_defaults: AvailabilityForm;
  effective: AvailabilityForm & { source: string };
}> {
  const q = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
  const res = await apiClient.get<{
    target_user_id: string;
    user_settings: (AvailabilityForm & { is_active: boolean }) | null;
    company_defaults: AvailabilityForm;
    effective: AvailabilityForm & { source: string };
  }>(`/api/appointments/user-availability-settings${q}`);
  if (res.error || !res.data) throw new Error(res.error || "Erro ao carregar");
  return res.data;
}

export async function patchUserAvailabilitySettings(
  body: Partial<AvailabilityForm & { user_id?: string; is_active?: boolean }>,
): Promise<{
  target_user_id: string;
  user_settings: AvailabilityForm & { is_active: boolean };
  effective: AvailabilityForm & { source: string };
}> {
  const res = await apiClient.patch<{
    target_user_id: string;
    user_settings: AvailabilityForm & { is_active: boolean };
    effective: AvailabilityForm & { source: string };
  }>("/api/appointments/user-availability-settings", body);
  if (res.error || !res.data) throw new Error(res.error || "Erro ao guardar");
  return res.data;
}
