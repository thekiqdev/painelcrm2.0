import { apiClient } from '@/integrations/api/client';

export type ClientGoogleDriveFile = {
  id: string;
  tenant_id: string;
  client_id: string;
  drive_file_id: string;
  drive_folder_id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  web_view_link: string | null;
  web_content_link: string | null;
  source_module: 'client_files' | string;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  trashed_at: string | null;
};

export async function listClientGoogleDriveFiles(clientId: string): Promise<ClientGoogleDriveFile[]> {
  const res = await apiClient.get<ClientGoogleDriveFile[]>(
    `/api/clients/${encodeURIComponent(clientId)}/google-drive/files`,
  );
  if (res.error) throw new Error(res.error);
  return res.data ?? [];
}

export type UploadClientGoogleDriveFileResponse = {
  id: string;
  client_id: string;
  source_module: 'client_files';
  drive_file_id: string;
  drive_folder_id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  web_view_link: string | null;
  web_content_link?: string | null;
  created_at: string;
};

export async function uploadClientGoogleDriveFile(
  clientId: string,
  file: File,
): Promise<UploadClientGoogleDriveFileResponse> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiClient.post<UploadClientGoogleDriveFileResponse>(
    `/api/clients/${encodeURIComponent(clientId)}/google-drive/files`,
    form,
  );
  if (res.error) throw new Error(res.error);
  if (!res.data) throw new Error('Resposta inválida');
  return res.data;
}
