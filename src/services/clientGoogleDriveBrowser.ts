import { apiClient } from '@/integrations/api/client';

export type ClientGoogleDriveBrowserItem = {
  id: string;
  type: 'folder' | 'file';
  name: string;
  mime_type?: string;
  size_bytes?: number;
  web_view_link?: string | null;
  created_at?: string;
  modified_at?: string;
};

export type ClientGoogleDriveBrowserBreadcrumb = { name: string; folder_id: string };

export type ClientGoogleDriveBrowserPayload = {
  current_folder_id: string;
  parent_folder_id: string | null;
  breadcrumb: ClientGoogleDriveBrowserBreadcrumb[];
  items: ClientGoogleDriveBrowserItem[];
  drive_folder_view_url: string;
};

export async function getClientGoogleDriveBrowser(
  clientId: string,
  folderId?: string | null,
): Promise<ClientGoogleDriveBrowserPayload> {
  const q =
    folderId && folderId.trim() !== ''
      ? `?folderId=${encodeURIComponent(folderId.trim())}`
      : '';
  const res = await apiClient.get<ClientGoogleDriveBrowserPayload>(
    `/api/clients/${encodeURIComponent(clientId)}/google-drive/browser${q}`,
  );
  if (res.error) {
    const e = new Error(res.error) as Error & { code?: string };
    e.code = res.code;
    throw e;
  }
  if (!res.data) throw new Error('Resposta inválida');
  return res.data;
}

export type CreateClientGoogleDriveFolderResponse = {
  drive_folder_id: string;
  parent_drive_folder_id: string;
  name: string;
};

export async function createClientGoogleDriveUserFolder(
  clientId: string,
  body: { name: string; parent_folder_id?: string | null },
): Promise<CreateClientGoogleDriveFolderResponse> {
  const res = await apiClient.post<CreateClientGoogleDriveFolderResponse>(
    `/api/clients/${encodeURIComponent(clientId)}/google-drive/folders`,
    {
      name: body.name,
      parent_folder_id: body.parent_folder_id ?? null,
    },
  );
  if (res.error) {
    const e = new Error(res.error) as Error & { code?: string };
    e.code = res.code;
    throw e;
  }
  if (!res.data) throw new Error('Resposta inválida');
  return res.data;
}
