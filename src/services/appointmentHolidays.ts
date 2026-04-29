import { apiClient } from "@/integrations/api/client";

export type AppointmentHolidayScope = "global" | "tenant";

export type AppointmentHolidayApi = {
  id: string;
  tenant_id?: string | null;
  name: string;
  holiday_date: string;
  display_date?: string;
  scope: AppointmentHolidayScope;
  country_code: string | null;
  is_recurring_yearly: boolean;
  blocks_availability: boolean;
  source: string;
  is_active: boolean;
  is_system_default?: boolean;
};

export async function listAppointmentHolidays(params: {
  year?: number;
  year_from?: number;
  year_to?: number;
  country_code?: string;
  active?: boolean;
}): Promise<{ holidays: AppointmentHolidayApi[] }> {
  const sp = new URLSearchParams();
  if (params.year_from != null) sp.set("year_from", String(params.year_from));
  if (params.year_to != null) sp.set("year_to", String(params.year_to));
  if (params.year != null && params.year_from == null) sp.set("year", String(params.year));
  if (params.country_code) sp.set("country_code", params.country_code);
  if (params.active !== undefined) sp.set("active", params.active ? "true" : "false");
  const q = sp.toString();
  const res = await apiClient.get<{ holidays: AppointmentHolidayApi[] }>(
    `/api/appointments/holidays${q ? `?${q}` : ""}`,
  );
  if (res.error || !res.data) throw new Error(res.error || "Erro ao listar feriados");
  return res.data;
}

export async function createAppointmentHoliday(body: {
  name: string;
  holiday_date: string;
  is_recurring_yearly?: boolean;
  blocks_availability?: boolean;
}): Promise<{ holiday: AppointmentHolidayApi }> {
  const res = await apiClient.post<{ holiday: AppointmentHolidayApi }>("/api/appointments/holidays", body);
  if (res.error || !res.data) throw new Error(res.error || "Erro ao criar feriado");
  return res.data;
}

export async function patchAppointmentHoliday(
  id: string,
  body: Partial<{
    name: string;
    holiday_date: string;
    is_recurring_yearly: boolean;
    blocks_availability: boolean;
  }>,
): Promise<{ holiday: AppointmentHolidayApi }> {
  const res = await apiClient.patch<{ holiday: AppointmentHolidayApi }>(`/api/appointments/holidays/${id}`, body);
  if (res.error || !res.data) throw new Error(res.error || "Erro ao atualizar");
  return res.data;
}

export async function disableAppointmentHoliday(id: string): Promise<{ holiday: AppointmentHolidayApi }> {
  const res = await apiClient.post<{ holiday: AppointmentHolidayApi }>(
    `/api/appointments/holidays/${id}/disable`,
    {},
  );
  if (res.error || !res.data) throw new Error(res.error || "Erro ao desativar");
  return res.data;
}
