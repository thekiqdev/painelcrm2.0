import { apiClient } from '@/integrations/api/client';

export type LeadPickerRow = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
};

export async function searchLeadsForPicker(q: string): Promise<LeadPickerRow[]> {
  const t = q.trim();
  if (!t) return [];
  const params = new URLSearchParams({ q: t });
  const res = await apiClient.get<LeadPickerRow[]>(`/api/leads?${params.toString()}`);
  if (res.error) throw new Error(res.error);
  return res.data ?? [];
}

export async function getLeadPickerRow(id: string): Promise<LeadPickerRow | null> {
  const res = await apiClient.get<LeadPickerRow>(`/api/leads/${id}`);
  if (res.error) return null;
  return res.data ?? null;
}
