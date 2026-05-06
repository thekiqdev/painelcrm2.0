import { apiClient } from '@/integrations/api/client';

export type GoogleDriveStatusResponse = {
  enabled: boolean;
  connected: boolean;
  google_email: string | null;
  root_folder_id: string | null;
  clients_folder_id: string | null;
  connection_error: string | null;
  connected_at?: string | null;
  encryption_configured?: boolean;
  oauth_configured?: boolean;
};

export async function getGoogleDriveStatus(): Promise<GoogleDriveStatusResponse> {
  const res = await apiClient.get<GoogleDriveStatusResponse>('/api/integrations/google-drive/status');
  if (res.error) throw new Error(res.error);
  return (
    res.data ?? {
      enabled: false,
      connected: false,
      google_email: null,
      root_folder_id: null,
      clients_folder_id: null,
      connection_error: null,
    }
  );
}

export async function getGoogleDriveConnectUrl(): Promise<string> {
  const res = await apiClient.post<{ url: string }>('/api/integrations/google-drive/connect', {});
  if (res.error) throw new Error(res.error);
  if (!res.data?.url) throw new Error('Resposta inválida');
  return res.data.url;
}

export async function disconnectGoogleDrive(): Promise<void> {
  const res = await apiClient.post<{ ok?: boolean }>('/api/integrations/google-drive/disconnect', {});
  if (res.error) throw new Error(res.error);
}
