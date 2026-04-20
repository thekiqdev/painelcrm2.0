import { apiClient } from '@/integrations/api/client';

export type TenantChatTemplateType = 'internal' | 'whatsapp_official';

export type TenantChatTemplate = {
  id: string;
  tenant_id: string;
  template_type: TenantChatTemplateType;
  name: string;
  slug: string | null;
  category: string | null;
  content: string;
  variables: string[];
  is_active: boolean;
  metadata: Record<string, unknown>;
  provider_template_name: string | null;
  provider_language: string | null;
  provider_category: string | null;
  provider_status: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ListParams = {
  type?: TenantChatTemplateType | '';
  q?: string;
  is_active?: 'true' | 'false' | '';
};

function buildQuery(p: ListParams): string {
  const sp = new URLSearchParams();
  if (p.type === 'internal' || p.type === 'whatsapp_official') sp.set('type', p.type);
  if (p.q?.trim()) sp.set('q', p.q.trim());
  if (p.is_active === 'true' || p.is_active === 'false') sp.set('is_active', p.is_active);
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export async function listTenantChatTemplates(params: ListParams = {}) {
  return apiClient.get<{ items: TenantChatTemplate[] }>(
    `/api/tenant-chat-templates${buildQuery(params)}`,
  );
}

export async function getTenantChatTemplate(id: string) {
  return apiClient.get<TenantChatTemplate>(`/api/tenant-chat-templates/${id}`);
}

export type CreateTenantChatTemplateBody = {
  template_type: TenantChatTemplateType;
  name: string;
  slug?: string | null;
  category?: string | null;
  content: string;
  variables?: string[];
  is_active?: boolean;
  metadata?: Record<string, unknown>;
  provider_template_name?: string | null;
  provider_language?: string | null;
  provider_category?: string | null;
  provider_status?: string | null;
};

export async function createTenantChatTemplate(body: CreateTenantChatTemplateBody) {
  return apiClient.post<TenantChatTemplate>('/api/tenant-chat-templates', body);
}

export type PatchTenantChatTemplateBody = Partial<
  Omit<CreateTenantChatTemplateBody, 'template_type'>
>;

export async function patchTenantChatTemplate(id: string, body: PatchTenantChatTemplateBody) {
  return apiClient.patch<TenantChatTemplate>(`/api/tenant-chat-templates/${id}`, body);
}

export async function deleteTenantChatTemplate(id: string) {
  return apiClient.delete(`/api/tenant-chat-templates/${id}`);
}
