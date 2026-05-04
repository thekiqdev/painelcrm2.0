import { apiClient } from '@/integrations/api/client';

const base = '/api/superadmin/leads';
const groupsBase = '/api/superadmin/lead-groups';

export type SuperadminLeadRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string;
  status: string | null;
  import_kind: string;
  assignee_label: string | null;
  active_label: string | null;
  created_at: string;
  group_names: string;
};

export type SuperadminLeadGroupRow = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  member_count: number;
};

export type SuperadminLeadPickerRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
};

export type SuperadminLeadGroupForAnnouncement = {
  id: string;
  name: string;
  reachable_count: number;
};

export const superadminLeadsService = {
  async list(): Promise<SuperadminLeadRow[]> {
    const r = await apiClient.get<SuperadminLeadRow[]>(base);
    if (r.error) throw new Error(r.error);
    return r.data ?? [];
  },
  async create(body: {
    name: string;
    email?: string | null;
    phone?: string | null;
    company?: string | null;
    source?: string | null;
    status?: string | null;
    notes?: string | null;
  }): Promise<{ id: string }> {
    const res = await apiClient.post<{ id: string }>(base, body);
    if (res.error) throw new Error(res.error);
    if (!res.data?.id) throw new Error('Resposta inválida');
    return res.data;
  },
  async patch(
    id: string,
    body: Partial<{
      name: string;
      email: string | null;
      phone: string | null;
      company: string | null;
      source: string | null;
      status: string | null;
      notes: string | null;
    }>,
  ): Promise<void> {
    const res = await apiClient.patch(`${base}/${id}`, body);
    if (res.error) throw new Error(res.error);
  },
  async remove(id: string): Promise<void> {
    const res = await apiClient.delete(`${base}/${id}`);
    if (res.error) throw new Error(res.error);
  },
  async importLeadsCsv(csv_text: string): Promise<{
    inserted: number;
    skipped_count: number;
    skipped_preview: { line: number; reason: string }[];
    warns_preview: unknown[];
  }> {
    const res = await apiClient.post(`${base}/import-leads`, { csv_text });
    if (res.error) throw new Error(res.error);
    return res.data as {
      inserted: number;
      skipped_count: number;
      skipped_preview: { line: number; reason: string }[];
      warns_preview: unknown[];
    };
  },
  async importClientsCsv(csv_text: string): Promise<{
    inserted: number;
    skipped_count: number;
    skipped_preview: { line: number; reason: string }[];
  }> {
    const res = await apiClient.post(`${base}/import-clients`, { csv_text });
    if (res.error) throw new Error(res.error);
    return res.data as {
      inserted: number;
      skipped_count: number;
      skipped_preview: { line: number; reason: string }[];
    };
  },
  async listGroups(): Promise<SuperadminLeadGroupRow[]> {
    const r = await apiClient.get<SuperadminLeadGroupRow[]>(groupsBase);
    if (r.error) throw new Error(r.error);
    return r.data ?? [];
  },
  async createGroup(body: { name: string; description?: string | null; is_active?: boolean }): Promise<{ id: string }> {
    const res = await apiClient.post<{ id: string }>(groupsBase, body);
    if (res.error) throw new Error(res.error);
    if (!res.data?.id) throw new Error('Resposta inválida');
    return res.data;
  },
  async patchGroup(
    id: string,
    body: Partial<{ name: string; description: string | null; is_active: boolean }>,
  ): Promise<void> {
    const res = await apiClient.patch(`${groupsBase}/${id}`, body);
    if (res.error) throw new Error(res.error);
  },
  async getGroupMembers(id: string): Promise<{ lead_ids: string[] }> {
    const r = await apiClient.get<{ lead_ids: string[] }>(`${groupsBase}/${id}/members`);
    if (r.error) throw new Error(r.error);
    return r.data ?? { lead_ids: [] };
  },
  async putGroupMembers(id: string, lead_ids: string[]): Promise<void> {
    const res = await apiClient.put(`${groupsBase}/${id}/members`, { lead_ids });
    if (res.error) throw new Error(res.error);
  },
  async listPicker(): Promise<SuperadminLeadPickerRow[]> {
    const r = await apiClient.get<SuperadminLeadPickerRow[]>(`${base}/picker`);
    if (r.error) throw new Error(r.error);
    return r.data ?? [];
  },
  async listGroupsForAnnouncements(): Promise<SuperadminLeadGroupForAnnouncement[]> {
    const r = await apiClient.get<SuperadminLeadGroupForAnnouncement[]>(`${groupsBase}/for-announcements`);
    if (r.error) throw new Error(r.error);
    return r.data ?? [];
  },
};
