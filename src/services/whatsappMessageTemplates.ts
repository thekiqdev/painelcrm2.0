import { apiClient } from '@/integrations/api/client';

export type WhatsappTemplateCategory = {
  id: string;
  tenant_id: string;
  name: string;
  color: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type TemplateMessageType = 'text' | 'image' | 'document';

export type WhatsappTemplateType = 'automatic' | 'model';

export type WhatsappTemplateItem = {
  id?: string;
  template_id?: string;
  position: number;
  message_type: TemplateMessageType;
  content: string | null;
  media_url: string | null;
  storage_provider?: string | null;
  storage_path?: string | null;
  original_filename?: string | null;
  mime_type?: string | null;
  file_size_bytes?: number | null;
  image_width?: number | null;
  image_height?: number | null;
  caption: string | null;
  delay_seconds: number;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type WhatsappMessageTemplateListRow = {
  id: string;
  tenant_id: string;
  category_id: string;
  template_type: WhatsappTemplateType;
  name: string;
  slug: string | null;
  description: string | null;
  is_active: boolean;
  is_system_default: boolean;
  seed_key: string | null;
  metadata: Record<string, unknown>;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  category_name: string;
  message_count: number;
};

export type WhatsappMessageTemplateDetail = WhatsappMessageTemplateListRow & {
  items: WhatsappTemplateItem[];
};

export async function listWhatsappTemplateCategories() {
  return apiClient.get<{ items: WhatsappTemplateCategory[] }>('/api/whatsapp-template-categories');
}

export async function createWhatsappTemplateCategory(body: {
  name: string;
  color?: string | null;
  is_active?: boolean;
}) {
  return apiClient.post<WhatsappTemplateCategory>('/api/whatsapp-template-categories', body);
}

export async function patchWhatsappTemplateCategory(
  id: string,
  body: Partial<{ name: string; color: string | null; is_active: boolean }>,
) {
  return apiClient.patch<WhatsappTemplateCategory>(`/api/whatsapp-template-categories/${id}`, body);
}

export async function deleteWhatsappTemplateCategory(id: string) {
  return apiClient.delete(`/api/whatsapp-template-categories/${id}`);
}

export type ListTemplatesParams = {
  q?: string;
  category_id?: string;
  is_active?: 'true' | 'false' | '';
  template_type?: WhatsappTemplateType | '';
};

function templatesQuery(p: ListTemplatesParams): string {
  const sp = new URLSearchParams();
  if (p.q?.trim()) sp.set('q', p.q.trim());
  if (p.category_id) sp.set('category_id', p.category_id);
  if (p.is_active === 'true' || p.is_active === 'false') sp.set('is_active', p.is_active);
  if (p.template_type === 'automatic' || p.template_type === 'model') sp.set('template_type', p.template_type);
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export async function listWhatsappMessageTemplates(params: ListTemplatesParams = {}) {
  return apiClient.get<{ items: WhatsappMessageTemplateListRow[] }>(
    `/api/whatsapp-message-templates${templatesQuery(params)}`,
  );
}

export async function getWhatsappMessageTemplate(id: string) {
  return apiClient.get<WhatsappMessageTemplateDetail>(`/api/whatsapp-message-templates/${id}`);
}

export type SaveTemplateBody = {
  name: string;
  category_id: string;
  description?: string | null;
  slug?: string | null;
  is_active?: boolean;
  items: Array<{
    message_type: TemplateMessageType;
    content?: string | null;
    media_url?: string | null;
    storage_provider?: string | null;
    storage_path?: string | null;
    original_filename?: string | null;
    mime_type?: string | null;
    file_size_bytes?: number | null;
    image_width?: number | null;
    image_height?: number | null;
    caption?: string | null;
    delay_seconds: number;
  }>;
};

export async function createWhatsappMessageTemplate(body: SaveTemplateBody) {
  return apiClient.post<WhatsappMessageTemplateDetail>('/api/whatsapp-message-templates', body);
}

export async function patchWhatsappMessageTemplate(id: string, body: Partial<SaveTemplateBody>) {
  return apiClient.patch<WhatsappMessageTemplateDetail>(`/api/whatsapp-message-templates/${id}`, body);
}

export async function deleteWhatsappMessageTemplate(id: string) {
  return apiClient.delete(`/api/whatsapp-message-templates/${id}`);
}

/** Envia a sequência do modelo (aba Modelos) na conversa; body alinhado ao backend. */
export async function sendWhatsappMessageTemplateSequence(
  templateId: string,
  body: { conversation_id: string },
) {
  return apiClient.post<{ ok: boolean }>(`/api/whatsapp-message-templates/${templateId}/send-sequence`, body);
}

export type WhatsappTemplateUploadResponse = {
  storage_provider: 'local';
  storage_path: string;
  media_url: string;
  original_filename: string | null;
  mime_type: string | null;
  file_size_bytes: number;
  image_width: number | null;
  image_height: number | null;
};

export async function uploadWhatsappTemplateMedia(file: File, mediaType: 'image' | 'document') {
  const form = new FormData();
  form.append('media_type', mediaType);
  form.append('file', file);
  return apiClient.post<WhatsappTemplateUploadResponse>('/api/whatsapp-message-templates/upload', form);
}
