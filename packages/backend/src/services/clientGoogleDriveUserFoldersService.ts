import { pool } from '../utils/db.js';
import { isGoogleDriveIntegrationEnabled } from '../config/googleDriveEnv.js';
import {
  ensureClientGoogleDriveFolderStructure,
  getClientGoogleDriveFolders,
  type ClientGoogleDriveFolderRow,
} from './clientGoogleDriveFoldersService.js';
import { getDriveIntegrationSecrets } from './googleDriveConnectionService.js';
import {
  createDriveFolder,
  isFolderUnderClientArquivosTree,
  refreshDriveTokenIfNeeded,
  trashDriveFile,
} from './googleDriveService.js';
import { CLIENT_GOOGLE_DRIVE_SOURCE_MODULE } from './clientGoogleDriveFilesService.js';

export function sanitizeUserFolderName(
  raw: string,
): { ok: true; name: string } | { ok: false; error: string } {
  const t = raw.trim();
  if (!t) return { ok: false, error: 'Indique um nome para a pasta.' };
  if (t.length > 200) return { ok: false, error: 'Nome muito longo.' };
  if (/[\u0000-\u001f\\/:*?"<>|]/.test(t)) {
    return { ok: false, error: 'O nome contém caracteres não permitidos.' };
  }
  if (t === '.' || t === '..') return { ok: false, error: 'Nome inválido.' };
  return { ok: true, name: t };
}

function forbiddenParentIds(row: ClientGoogleDriveFolderRow): Set<string> {
  return new Set([
    row.client_root_folder_id,
    row.folder_contratos_id,
    row.folder_propostas_id,
    row.folder_faturas_id,
  ]);
}

function moduleFolderIds(row: ClientGoogleDriveFolderRow): Set<string> {
  return new Set([row.folder_contratos_id, row.folder_propostas_id, row.folder_faturas_id]);
}

async function insertClientGoogleDriveUserFolder(params: {
  tenantId: string;
  clientId: string;
  driveFolderId: string;
  parentDriveFolderId: string;
  name: string;
  createdByUserId: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO client_google_drive_user_folders (
       tenant_id, client_id, drive_folder_id, parent_drive_folder_id, name, created_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      params.tenantId,
      params.clientId,
      params.driveFolderId,
      params.parentDriveFolderId,
      params.name,
      params.createdByUserId,
    ],
  );
}

export async function createClientGoogleDriveUserSubfolder(params: {
  tenantId: string;
  clientId: string;
  userId: string;
  name: string;
  parentFolderId?: string | null;
}): Promise<{ drive_folder_id: string; parent_drive_folder_id: string; name: string }> {
  if (!isGoogleDriveIntegrationEnabled()) {
    const err = new Error('Integração Google Drive desativada neste servidor.');
    (err as Error & { code?: string }).code = 'drive_disabled';
    throw err;
  }
  const parsed = sanitizeUserFolderName(params.name);
  if (!parsed.ok) {
    const err = new Error(parsed.error);
    (err as Error & { code?: string }).code = 'invalid_name';
    throw err;
  }

  await ensureClientGoogleDriveFolderStructure(params.tenantId, params.clientId);
  const folders = await getClientGoogleDriveFolders(params.tenantId, params.clientId);
  if (!folders) {
    const err = new Error('Estrutura de pastas do cliente indisponível.');
    (err as Error & { code?: string }).code = 'folders_unavailable';
    throw err;
  }

  const arquivosRoot = folders.folder_arquivos_id;
  const parentId = (params.parentFolderId || '').trim() || arquivosRoot;
  if (forbiddenParentIds(folders).has(parentId)) {
    const err = new Error('Não é possível criar pastas nesta localização.');
    (err as Error & { code?: string }).code = 'folder_forbidden';
    throw err;
  }

  let conn = await getDriveIntegrationSecrets(params.tenantId);
  if (!conn) {
    const err = new Error('Google Drive não está ligado para esta empresa.');
    (err as Error & { code?: string }).code = 'drive_not_connected';
    throw err;
  }
  conn = await refreshDriveTokenIfNeeded(conn);

  const allowed = await isFolderUnderClientArquivosTree(
    conn.accessToken,
    parentId,
    arquivosRoot,
    moduleFolderIds(folders),
  );
  if (!allowed) {
    const err = new Error('Pasta de destino inválida.');
    (err as Error & { code?: string }).code = 'folder_invalid';
    throw err;
  }

  const driveFolderId = await createDriveFolder(conn.accessToken, parsed.name, parentId);

  await insertClientGoogleDriveUserFolder({
    tenantId: params.tenantId,
    clientId: params.clientId,
    driveFolderId,
    parentDriveFolderId: parentId,
    name: parsed.name,
    createdByUserId: params.userId,
  });

  return { drive_folder_id: driveFolderId, parent_drive_folder_id: parentId, name: parsed.name };
}

export async function deleteClientGoogleDriveUserFolder(params: {
  tenantId: string;
  clientId: string;
  folderDriveId: string;
}): Promise<void> {
  if (!isGoogleDriveIntegrationEnabled()) {
    const err = new Error('Integração Google Drive desativada neste servidor.');
    (err as Error & { code?: string }).code = 'drive_disabled';
    throw err;
  }

  const folderId = params.folderDriveId.trim();
  if (!folderId) {
    const err = new Error('Pasta inválida.');
    (err as Error & { code?: string }).code = 'folder_invalid';
    throw err;
  }

  await ensureClientGoogleDriveFolderStructure(params.tenantId, params.clientId);
  const folders = await getClientGoogleDriveFolders(params.tenantId, params.clientId);
  if (!folders) {
    const err = new Error('Estrutura de pastas do cliente indisponível.');
    (err as Error & { code?: string }).code = 'folders_unavailable';
    throw err;
  }

  if (folderId === folders.folder_arquivos_id || forbiddenParentIds(folders).has(folderId)) {
    const err = new Error('Esta pasta não pode ser eliminada.');
    (err as Error & { code?: string }).code = 'folder_forbidden';
    throw err;
  }

  const uf = await pool.query<{ id: string; drive_folder_id: string }>(
    `SELECT id, drive_folder_id
     FROM client_google_drive_user_folders
     WHERE tenant_id = $1 AND client_id = $2 AND drive_folder_id = $3 AND trashed_at IS NULL
     LIMIT 1`,
    [params.tenantId, params.clientId, folderId],
  );
  if (!uf.rows[0]) {
    const err = new Error('Pasta não encontrada ou já foi removida.');
    (err as Error & { code?: string }).code = 'folder_not_found';
    throw err;
  }

  const childFolders = await pool.query(
    `SELECT 1 FROM client_google_drive_user_folders
     WHERE tenant_id = $1 AND client_id = $2 AND parent_drive_folder_id = $3 AND trashed_at IS NULL
     LIMIT 1`,
    [params.tenantId, params.clientId, folderId],
  );
  if ((childFolders.rowCount ?? 0) > 0) {
    const err = new Error('Só é possível eliminar pastas vazias. Remova primeiro o conteúdo.');
    (err as Error & { code?: string }).code = 'folder_not_empty';
    throw err;
  }

  const indexedFiles = await pool.query(
    `SELECT 1 FROM client_google_drive_files
     WHERE tenant_id = $1 AND client_id = $2 AND drive_folder_id = $3
       AND source_module = $4 AND trashed_at IS NULL
     LIMIT 1`,
    [params.tenantId, params.clientId, folderId, CLIENT_GOOGLE_DRIVE_SOURCE_MODULE],
  );
  if ((indexedFiles.rowCount ?? 0) > 0) {
    const err = new Error('Só é possível eliminar pastas vazias. Remova primeiro os arquivos.');
    (err as Error & { code?: string }).code = 'folder_not_empty';
    throw err;
  }

  let conn = await getDriveIntegrationSecrets(params.tenantId);
  if (!conn) {
    const err = new Error('Google Drive não está ligado para esta empresa.');
    (err as Error & { code?: string }).code = 'drive_not_connected';
    throw err;
  }
  conn = await refreshDriveTokenIfNeeded(conn);

  const arquivosRoot = folders.folder_arquivos_id;
  const allowed = await isFolderUnderClientArquivosTree(
    conn.accessToken,
    folderId,
    arquivosRoot,
    moduleFolderIds(folders),
  );
  if (!allowed) {
    const err = new Error('Pasta de destino inválida.');
    (err as Error & { code?: string }).code = 'folder_invalid';
    throw err;
  }

  await trashDriveFile(conn.accessToken, folderId);

  await pool.query(
    `UPDATE client_google_drive_user_folders
     SET trashed_at = now(), updated_at = now()
     WHERE tenant_id = $1 AND client_id = $2 AND drive_folder_id = $3 AND trashed_at IS NULL`,
    [params.tenantId, params.clientId, folderId],
  );
}
