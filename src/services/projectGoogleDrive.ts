import { apiClient } from '@/integrations/api/client';

export type EnsureProjectGoogleDriveFoldersResult = {
  project_id: string;
  tenant_id: string;
  client_id: string;
  project_folder_id: string;
  folder_releases_id: string;
  version_folder_id: string | null;
  version_name: string | null;
  browse_folder_id: string;
  created: boolean;
};

export async function ensureProjectGoogleDriveFolders(
  projectId: string,
  data?: { version_name?: string | null },
): Promise<EnsureProjectGoogleDriveFoldersResult> {
  const response = await apiClient.post<EnsureProjectGoogleDriveFoldersResult>(
    `/api/projects/${encodeURIComponent(projectId)}/google-drive/ensure-folders`,
    data ?? {},
  );
  if (response.error) throw new Error(response.error);
  return response.data!;
}
