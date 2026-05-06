import { pool } from '../utils/db.js';
import { getDriveIntegrationSecrets } from './googleDriveConnectionService.js';
import {
  getClientGoogleDriveFolders,
  ensureClientGoogleDriveFolderStructure,
  type ClientGoogleDriveFolderRow,
} from './clientGoogleDriveFoldersService.js';
import {
  getDriveFileMetadata,
  isFolderUnderClientArquivosTree,
  moveDriveFile,
  refreshDriveTokenIfNeeded,
  trashDriveFile,
  uploadFileToDrive,
} from './googleDriveService.js';

export const CLIENT_GOOGLE_DRIVE_SOURCE_MODULE = 'client_files' as const;

export type ClientGoogleDriveFileRow = {
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
  source_module: string;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  trashed_at: string | null;
};

export async function listClientGoogleDriveFiles(tenantId: string, clientId: string): Promise<ClientGoogleDriveFileRow[]> {
  const r = await pool.query<ClientGoogleDriveFileRow>(
    `SELECT id, tenant_id, client_id, drive_file_id, drive_folder_id, name, mime_type, size_bytes,
            web_view_link, web_content_link, source_module, created_by_user_id,
            created_at::text AS created_at, updated_at::text AS updated_at, trashed_at::text AS trashed_at
     FROM client_google_drive_files
     WHERE tenant_id = $1
       AND client_id = $2
       AND source_module = $3
       AND trashed_at IS NULL
     ORDER BY created_at DESC`,
    [tenantId, clientId, CLIENT_GOOGLE_DRIVE_SOURCE_MODULE],
  );
  return r.rows;
}

function normalizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() || 'arquivo';
  const cleaned = base.replace(/[^\w.\-() ]+/g, '_').trim();
  return cleaned.slice(0, 180) || 'arquivo';
}

function forbiddenUploadParents(folders: ClientGoogleDriveFolderRow): Set<string> {
  return new Set([
    folders.client_root_folder_id,
    folders.folder_contratos_id,
    folders.folder_propostas_id,
    folders.folder_faturas_id,
  ]);
}

function moduleFolderIds(folders: ClientGoogleDriveFolderRow): Set<string> {
  return new Set([folders.folder_contratos_id, folders.folder_propostas_id, folders.folder_faturas_id]);
}

export async function uploadClientGoogleDriveFile(params: {
  tenantId: string;
  clientId: string;
  createdByUserId: string;
  originalName: string;
  mimeType: string;
  fileBytes: Buffer;
  /** Pasta de destino no Drive; omitir = pasta raiz «Arquivos». */
  parentFolderId?: string | null;
}): Promise<ClientGoogleDriveFileRow> {
  await ensureClientGoogleDriveFolderStructure(params.tenantId, params.clientId);
  const folders = await getClientGoogleDriveFolders(params.tenantId, params.clientId);
  if (!folders) {
    const err = new Error('Estrutura de pastas do cliente indisponível.');
    (err as Error & { code?: string }).code = 'folders_unavailable';
    throw err;
  }

  const arquivosRoot = folders.folder_arquivos_id;
  const destFolderId = (params.parentFolderId || '').trim() || arquivosRoot;
  if (forbiddenUploadParents(folders).has(destFolderId)) {
    const err = new Error('Não é possível enviar para esta pasta.');
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
    destFolderId,
    arquivosRoot,
    moduleFolderIds(folders),
  );
  if (!allowed) {
    const err = new Error('Pasta de destino inválida.');
    (err as Error & { code?: string }).code = 'folder_invalid';
    throw err;
  }

  const uploaded = await uploadFileToDrive({
    accessToken: conn.accessToken,
    folderId: destFolderId,
    filename: normalizeFilename(params.originalName),
    mimeType: params.mimeType,
    content: params.fileBytes,
  });

  const r = await pool.query<ClientGoogleDriveFileRow>(
    `INSERT INTO client_google_drive_files (
       tenant_id, client_id, drive_file_id, drive_folder_id, name, mime_type, size_bytes,
       web_view_link, web_content_link, source_module, created_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, tenant_id, client_id, drive_file_id, drive_folder_id, name, mime_type, size_bytes,
               web_view_link, web_content_link, source_module, created_by_user_id,
               created_at::text AS created_at, updated_at::text AS updated_at, trashed_at::text AS trashed_at`,
    [
      params.tenantId,
      params.clientId,
      uploaded.id,
      destFolderId,
      uploaded.name,
      uploaded.mimeType,
      uploaded.size || params.fileBytes.length,
      uploaded.webViewLink,
      uploaded.webContentLink,
      CLIENT_GOOGLE_DRIVE_SOURCE_MODULE,
      params.createdByUserId,
    ],
  );

  return r.rows[0]!;
}

async function loadTrackedClientFileRow(params: {
  tenantId: string;
  clientId: string;
  driveFileId: string;
}): Promise<ClientGoogleDriveFileRow | null> {
  const r = await pool.query<ClientGoogleDriveFileRow>(
    `SELECT id, tenant_id, client_id, drive_file_id, drive_folder_id, name, mime_type, size_bytes,
            web_view_link, web_content_link, source_module, created_by_user_id,
            created_at::text AS created_at, updated_at::text AS updated_at, trashed_at::text AS trashed_at
     FROM client_google_drive_files
     WHERE tenant_id = $1 AND client_id = $2 AND drive_file_id = $3
       AND source_module = $4 AND trashed_at IS NULL
     LIMIT 1`,
    [params.tenantId, params.clientId, params.driveFileId, CLIENT_GOOGLE_DRIVE_SOURCE_MODULE],
  );
  return r.rows[0] ?? null;
}

export async function moveClientGoogleDriveFile(params: {
  tenantId: string;
  clientId: string;
  driveFileId: string;
  destinationFolderId: string;
}): Promise<ClientGoogleDriveFileRow> {
  await ensureClientGoogleDriveFolderStructure(params.tenantId, params.clientId);
  const folders = await getClientGoogleDriveFolders(params.tenantId, params.clientId);
  if (!folders) {
    const err = new Error('Estrutura de pastas do cliente indisponível.');
    (err as Error & { code?: string }).code = 'folders_unavailable';
    throw err;
  }

  const dest = params.destinationFolderId.trim();
  if (!dest) {
    const err = new Error('Pasta de destino inválida.');
    (err as Error & { code?: string }).code = 'folder_invalid';
    throw err;
  }

  if (forbiddenUploadParents(folders).has(dest)) {
    const err = new Error('Não é possível mover para esta pasta.');
    (err as Error & { code?: string }).code = 'folder_forbidden';
    throw err;
  }

  const row = await loadTrackedClientFileRow({
    tenantId: params.tenantId,
    clientId: params.clientId,
    driveFileId: params.driveFileId,
  });
  if (!row) {
    const err = new Error('Arquivo não encontrado ou não gerido por esta área.');
    (err as Error & { code?: string }).code = 'file_not_tracked';
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
  const allowedDest = await isFolderUnderClientArquivosTree(
    conn.accessToken,
    dest,
    arquivosRoot,
    moduleFolderIds(folders),
  );
  if (!allowedDest) {
    const err = new Error('Pasta de destino inválida.');
    (err as Error & { code?: string }).code = 'folder_invalid';
    throw err;
  }

  const destMeta = await getDriveFileMetadata(conn.accessToken, dest);
  if (destMeta.mimeType !== 'application/vnd.google-apps.folder') {
    const err = new Error('O destino não é uma pasta.');
    (err as Error & { code?: string }).code = 'folder_invalid';
    throw err;
  }

  const meta = await getDriveFileMetadata(conn.accessToken, params.driveFileId);
  const parents = meta.parents;
  const removeParents =
    parents?.length ? parents[0]! : row.drive_folder_id;
  if (removeParents === dest) {
    return row;
  }

  await moveDriveFile(conn.accessToken, params.driveFileId, removeParents, dest);

  const ur = await pool.query<ClientGoogleDriveFileRow>(
    `UPDATE client_google_drive_files
     SET drive_folder_id = $1, updated_at = now()
     WHERE id = $2
     RETURNING id, tenant_id, client_id, drive_file_id, drive_folder_id, name, mime_type, size_bytes,
               web_view_link, web_content_link, source_module, created_by_user_id,
               created_at::text AS created_at, updated_at::text AS updated_at, trashed_at::text AS trashed_at`,
    [dest, row.id],
  );
  return ur.rows[0]!;
}

export async function deleteClientGoogleDriveFile(params: {
  tenantId: string;
  clientId: string;
  driveFileId: string;
}): Promise<void> {
  const row = await loadTrackedClientFileRow({
    tenantId: params.tenantId,
    clientId: params.clientId,
    driveFileId: params.driveFileId,
  });
  if (!row) {
    const err = new Error('Arquivo não encontrado ou não gerido por esta área.');
    (err as Error & { code?: string }).code = 'file_not_tracked';
    throw err;
  }

  let conn = await getDriveIntegrationSecrets(params.tenantId);
  if (!conn) {
    const err = new Error('Google Drive não está ligado para esta empresa.');
    (err as Error & { code?: string }).code = 'drive_not_connected';
    throw err;
  }
  conn = await refreshDriveTokenIfNeeded(conn);

  await trashDriveFile(conn.accessToken, params.driveFileId);

  await pool.query(
    `UPDATE client_google_drive_files SET trashed_at = now(), updated_at = now() WHERE id = $1`,
    [row.id],
  );
}
