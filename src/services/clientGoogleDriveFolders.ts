import { apiClient } from '@/integrations/api/client';

export type ClientGoogleDriveFoldersResponse = {
  client_id: string;
  client_root_folder_id: string;
  folder_arquivos_id: string;
  folder_contratos_id: string;
  folder_propostas_id: string;
  folder_faturas_id: string;
  created: boolean;
};

export async function ensureClientGoogleDriveFolders(
  clientId: string,
): Promise<ClientGoogleDriveFoldersResponse> {
  const res = await apiClient.post<ClientGoogleDriveFoldersResponse>(
    `/api/clients/${encodeURIComponent(clientId)}/google-drive/ensure-folders`,
    {},
  );
  if (res.error) throw new Error(res.error);
  if (!res.data) throw new Error('Resposta inválida');
  return res.data;
}
