import { apiClient } from '@/integrations/api/client';
import type { ClientGoogleDriveBrowserItem } from '@/services/clientGoogleDriveBrowser';

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
  options?: { parentFolderId?: string | null },
): Promise<UploadClientGoogleDriveFileResponse> {
  const form = new FormData();
  form.append('file', file);
  if (options?.parentFolderId && options.parentFolderId.trim() !== '') {
    form.append('parent_folder_id', options.parentFolderId.trim());
  }
  const res = await apiClient.post<UploadClientGoogleDriveFileResponse>(
    `/api/clients/${encodeURIComponent(clientId)}/google-drive/files`,
    form,
  );
  if (res.error) throw new Error(res.error);
  if (!res.data) throw new Error('Resposta inválida');
  return res.data;
}

export async function uploadClientGoogleDriveFileWithProgress(
  clientId: string,
  file: File,
  options: {
    parentFolderId?: string | null;
    onProgress?: (percent: number) => void;
    onUploadBytesFinished?: () => void;
    signal?: AbortSignal;
  },
): Promise<UploadClientGoogleDriveFileResponse> {
  const form = new FormData();
  form.append('file', file);
  if (options.parentFolderId && options.parentFolderId.trim() !== '') {
    form.append('parent_folder_id', options.parentFolderId.trim());
  }
  const res = await apiClient.postFormDataWithProgress<UploadClientGoogleDriveFileResponse>(
    `/api/clients/${encodeURIComponent(clientId)}/google-drive/files`,
    form,
    {
      onUploadProgress: (loaded, total) => {
        if (total > 0) {
          const pct = Math.min(99, Math.round((loaded / total) * 100));
          options.onProgress?.(pct);
        }
      },
      onUploadBytesFinished: options.onUploadBytesFinished,
      signal: options.signal,
    },
  );
  if (res.error) throw new Error(res.error);
  if (!res.data) throw new Error('Resposta inválida');
  return res.data;
}

export function mapUploadResponseToBrowserItem(res: UploadClientGoogleDriveFileResponse): ClientGoogleDriveBrowserItem {
  return {
    id: res.drive_file_id,
    type: 'file',
    name: res.name,
    mime_type: res.mime_type,
    size_bytes: res.size_bytes,
    web_view_link: res.web_view_link,
    created_at: res.created_at,
    modified_at: res.created_at,
  };
}
