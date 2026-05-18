/**
 * Pastas Drive por projeto: Cliente / Projetos / {Projeto} / Releases / {Versão}
 */
import { pool } from '../utils/db.js';
import { isGoogleDriveIntegrationEnabled } from '../config/googleDriveEnv.js';
import { ensureClientGoogleDriveFolderStructure } from './clientGoogleDriveFoldersService.js';
import { getDriveIntegrationSecrets } from './googleDriveConnectionService.js';
import { createDriveFolder, refreshDriveTokenIfNeeded } from './googleDriveService.js';
import { sanitizeUserFolderName } from './clientGoogleDriveUserFoldersService.js';

const RELEASES_FOLDER_NAME = 'Releases';

export type ProjectGoogleDriveFolderRow = {
  project_id: string;
  tenant_id: string;
  client_id: string;
  project_folder_id: string;
  folder_releases_id: string;
  version_folder_id: string | null;
  version_name: string | null;
};

export type EnsureProjectGoogleDriveFoldersResult = ProjectGoogleDriveFolderRow & {
  browse_folder_id: string;
  created: boolean;
};

function sanitizeProjectFolderName(projectName: string): string {
  const parsed = sanitizeUserFolderName(projectName);
  if (parsed.ok) return parsed.name;
  return projectName.replace(/[\\/:*?"<>|]/g, ' ').trim().slice(0, 180) || 'Projeto';
}

async function findUserSubfolder(
  tenantId: string,
  clientId: string,
  parentDriveFolderId: string,
  name: string,
): Promise<string | null> {
  const r = await pool.query<{ drive_folder_id: string }>(
    `SELECT drive_folder_id
     FROM client_google_drive_user_folders
     WHERE tenant_id = $1 AND client_id = $2
       AND parent_drive_folder_id = $3
       AND lower(name) = lower($4)
       AND trashed_at IS NULL
     LIMIT 1`,
    [tenantId, clientId, parentDriveFolderId, name],
  );
  return r.rows[0]?.drive_folder_id ?? null;
}

async function registerUserSubfolder(params: {
  tenantId: string;
  clientId: string;
  userId: string;
  name: string;
  parentDriveFolderId: string;
  driveFolderId: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO client_google_drive_user_folders (
       tenant_id, client_id, drive_folder_id, parent_drive_folder_id, name, created_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tenant_id, client_id, drive_folder_id) DO NOTHING`,
    [
      params.tenantId,
      params.clientId,
      params.driveFolderId,
      params.parentDriveFolderId,
      params.name,
      params.userId,
    ],
  );
}

async function ensureSubfolder(params: {
  tenantId: string;
  clientId: string;
  userId: string;
  parentDriveFolderId: string;
  name: string;
  accessToken: string;
}): Promise<string> {
  const existing = await findUserSubfolder(
    params.tenantId,
    params.clientId,
    params.parentDriveFolderId,
    params.name,
  );
  if (existing) return existing;

  const driveFolderId = await createDriveFolder(
    params.accessToken,
    params.name,
    params.parentDriveFolderId,
  );
  await registerUserSubfolder({
    tenantId: params.tenantId,
    clientId: params.clientId,
    userId: params.userId,
    name: params.name,
    parentDriveFolderId: params.parentDriveFolderId,
    driveFolderId,
  });
  return driveFolderId;
}

async function loadProjectRow(projectId: string, tenantId: string) {
  const r = await pool.query<{
    id: string;
    name: string;
    client_id: string | null;
    user_id: string;
  }>(
    `SELECT p.id, p.name, p.client_id, p.user_id
     FROM projects p
     INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $2
     WHERE p.id = $1`,
    [projectId, tenantId],
  );
  return r.rows[0] ?? null;
}

async function loadExistingProjectFolders(
  projectId: string,
): Promise<ProjectGoogleDriveFolderRow | null> {
  const r = await pool.query<ProjectGoogleDriveFolderRow>(
    `SELECT project_id, tenant_id, client_id, project_folder_id, folder_releases_id,
            version_folder_id, version_name
     FROM project_google_drive_folders
     WHERE project_id = $1`,
    [projectId],
  );
  return r.rows[0] ?? null;
}

export async function ensureProjectGoogleDriveFolderStructure(params: {
  tenantId: string;
  clientId: string;
  projectId: string;
  projectName: string;
  versionName?: string | null;
  userId: string;
}): Promise<EnsureProjectGoogleDriveFoldersResult> {
  if (!isGoogleDriveIntegrationEnabled()) {
    const err = new Error('Integração Google Drive desativada neste servidor.');
    (err as Error & { code?: string }).code = 'drive_disabled';
    throw err;
  }

  const clientFolders = await ensureClientGoogleDriveFolderStructure(params.tenantId, params.clientId);
  const projetosRootId = clientFolders.folder_projetos_id;
  if (!projetosRootId) {
    const err = new Error('Pasta Projetos do cliente indisponível.');
    (err as Error & { code?: string }).code = 'folders_unavailable';
    throw err;
  }

  let conn = await getDriveIntegrationSecrets(params.tenantId);
  if (!conn) {
    const err = new Error('Google Drive não está ligado para esta empresa.');
    (err as Error & { code?: string }).code = 'drive_not_connected';
    throw err;
  }
  conn = await refreshDriveTokenIfNeeded(conn);

  const safeProjectName = sanitizeProjectFolderName(params.projectName);
  let created = false;
  let row = await loadExistingProjectFolders(params.projectId);

  let projectFolderId = row?.project_folder_id ?? null;
  let releasesFolderId = row?.folder_releases_id ?? null;

  if (!projectFolderId || !releasesFolderId) {
    projectFolderId = await ensureSubfolder({
      tenantId: params.tenantId,
      clientId: params.clientId,
      userId: params.userId,
      parentDriveFolderId: projetosRootId,
      name: safeProjectName,
      accessToken: conn.accessToken,
    });
    releasesFolderId = await ensureSubfolder({
      tenantId: params.tenantId,
      clientId: params.clientId,
      userId: params.userId,
      parentDriveFolderId: projectFolderId,
      name: RELEASES_FOLDER_NAME,
      accessToken: conn.accessToken,
    });
    created = true;
  }

  let versionFolderId: string | null = row?.version_folder_id ?? null;
  let versionName: string | null = row?.version_name ?? null;
  const versionLabel = (params.versionName || '').trim();

  if (versionLabel) {
    versionFolderId = await ensureSubfolder({
      tenantId: params.tenantId,
      clientId: params.clientId,
      userId: params.userId,
      parentDriveFolderId: releasesFolderId,
      name: versionLabel,
      accessToken: conn.accessToken,
    });
    versionName = versionLabel;
  }

  await pool.query(
    `INSERT INTO project_google_drive_folders (
       project_id, tenant_id, client_id, project_folder_id, folder_releases_id,
       version_folder_id, version_name
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (project_id) DO UPDATE SET
       project_folder_id = EXCLUDED.project_folder_id,
       folder_releases_id = EXCLUDED.folder_releases_id,
       version_folder_id = EXCLUDED.version_folder_id,
       version_name = EXCLUDED.version_name,
       updated_at = now()`,
    [
      params.projectId,
      params.tenantId,
      params.clientId,
      projectFolderId,
      releasesFolderId,
      versionFolderId,
      versionName,
    ],
  );

  const browse_folder_id = versionFolderId ?? releasesFolderId;

  return {
    project_id: params.projectId,
    tenant_id: params.tenantId,
    client_id: params.clientId,
    project_folder_id: projectFolderId,
    folder_releases_id: releasesFolderId,
    version_folder_id: versionFolderId,
    version_name: versionName,
    browse_folder_id,
    created,
  };
}

export async function resolveProjectGoogleDriveBrowseFolder(
  projectId: string,
): Promise<{ browse_folder_id: string; client_id: string } | null> {
  const row = await loadExistingProjectFolders(projectId);
  if (!row) return null;
  const browse_folder_id = row.version_folder_id ?? row.folder_releases_id;
  return { browse_folder_id, client_id: row.client_id };
}
