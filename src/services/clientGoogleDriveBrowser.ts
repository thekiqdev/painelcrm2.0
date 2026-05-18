import { apiClient } from '@/integrations/api/client';

/** Upload otimista na grelha (apenas UI local). */
export type ClientDriveOptimisticUploadMeta = {
  temp_id: string;
  phase: 'uploading' | 'processing' | 'error';
  progress: number;
  error_message?: string;
};

export type ClientGoogleDriveUploadStatus = 'uploading' | 'processing' | 'ready' | 'failed';

export type ClientGoogleDriveBrowserItem = {
  id: string;
  type: 'folder' | 'file';
  name: string;
  mime_type?: string;
  size_bytes?: number;
  web_view_link?: string | null;
  created_at?: string;
  modified_at?: string;
  /** Estado persistido no índice local (ficheiros). */
  upload_status?: ClientGoogleDriveUploadStatus;
  upload_error?: string | null;
  /** Presente quando o ficheiro já existe no Drive (abrir link). */
  drive_file_id?: string | null;
  optimistic_upload?: ClientDriveOptimisticUploadMeta;
};

export type ClientGoogleDriveBrowserBreadcrumb = { name: string; folder_id: string };

export type ClientGoogleDriveBrowserPayload = {
  current_folder_id: string;
  parent_folder_id: string | null;
  breadcrumb: ClientGoogleDriveBrowserBreadcrumb[];
  items: ClientGoogleDriveBrowserItem[];
  drive_folder_view_url: string;
  project_id?: string;
  browse_scope?: 'arquivos' | 'projetos';
};

export async function getClientGoogleDriveBrowser(
  clientId: string,
  options?: { folderId?: string | null; projectId?: string | null },
): Promise<ClientGoogleDriveBrowserPayload> {
  const params = new URLSearchParams();
  const folderId = options?.folderId?.trim();
  const projectId = options?.projectId?.trim();
  if (folderId) params.set('folderId', folderId);
  if (projectId) params.set('projectId', projectId);
  const q = params.toString() ? `?${params.toString()}` : '';
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

export async function moveClientGoogleDriveItem(
  clientId: string,
  body: { file_id: string; destination_folder_id: string },
): Promise<void> {
  const res = await apiClient.post<unknown>(
    `/api/clients/${encodeURIComponent(clientId)}/google-drive/move`,
    {
      file_id: body.file_id,
      destination_folder_id: body.destination_folder_id,
    },
  );
  if (res.error) {
    const e = new Error(res.error) as Error & { code?: string };
    e.code = res.code;
    throw e;
  }
}

export async function deleteClientGoogleDriveItem(clientId: string, driveFileId: string): Promise<void> {
  const res = await apiClient.delete(
    `/api/clients/${encodeURIComponent(clientId)}/google-drive/files/${encodeURIComponent(driveFileId)}`,
  );
  if (res.error) {
    const e = new Error(res.error) as Error & { code?: string };
    e.code = res.code;
    throw e;
  }
}

export async function deleteClientGoogleDriveFolder(clientId: string, folderDriveId: string): Promise<void> {
  const res = await apiClient.delete(
    `/api/clients/${encodeURIComponent(clientId)}/google-drive/folders/${encodeURIComponent(folderDriveId)}`,
  );
  if (res.error) {
    const e = new Error(res.error) as Error & { code?: string };
    e.code = res.code;
    throw e;
  }
}
