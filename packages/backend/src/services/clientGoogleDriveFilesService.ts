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
  isFolderUnderClientProjetosTree,
  moveDriveFile,
  refreshDriveTokenIfNeeded,
  trashDriveFile,
  uploadFileToDrive,
} from './googleDriveService.js';

export const CLIENT_GOOGLE_DRIVE_SOURCE_MODULE = 'client_files' as const;

export type UploadStatus = 'uploading' | 'processing' | 'ready' | 'failed';

export type ClientGoogleDriveFileRow = {
  id: string;
  tenant_id: string;
  client_id: string;
  drive_file_id: string | null;
  drive_folder_id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  web_view_link: string | null;
  web_content_link: string | null;
  source_module: string;
  upload_status: UploadStatus;
  upload_error: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  trashed_at: string | null;
};

function isLikelyUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());
}

/** Mensagem segura para o utilizador final (sem detalhes técnicos). */
function sanitizeClientUploadError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();
  if (lower.includes('quota') || lower.includes('storage') || lower.includes('limit exceeded')) {
    return 'Armazenamento do Google Drive cheio ou quota excedida.';
  }
  if (lower.includes('401') || lower.includes('403') || lower.includes('unauthorized') || lower.includes('invalid_grant')) {
    return 'Sessão Google Drive inválida ou expirada. Volte a ligar em Configurações → Integrações.';
  }
  if (lower.includes('network') || lower.includes('econnreset') || lower.includes('timeout')) {
    return 'Erro de rede. Tente novamente dentro de instantes.';
  }
  if (/drive:|googleapis|oauth/i.test(lower)) {
    return 'Não foi possível enviar o ficheiro ao Google Drive. Tente novamente.';
  }
  const cleaned = msg.replace(/\s+/g, ' ').trim().slice(0, 120);
  if (cleaned.length > 100 || /[{[\]}]/.test(cleaned)) {
    return 'Não foi possível enviar o ficheiro. Tente novamente.';
  }
  return cleaned || 'Não foi possível enviar o ficheiro.';
}

export async function listClientGoogleDriveFiles(tenantId: string, clientId: string): Promise<ClientGoogleDriveFileRow[]> {
  const r = await pool.query<ClientGoogleDriveFileRow>(
    `SELECT id, tenant_id, client_id, drive_file_id, drive_folder_id, name, mime_type, size_bytes,
            web_view_link, web_content_link, source_module, upload_status, upload_error, created_by_user_id,
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
    ...(folders.folder_projetos_id ? [folders.folder_projetos_id] : []),
  ]);
}

function moduleFolderIds(folders: ClientGoogleDriveFolderRow): Set<string> {
  return new Set([
    folders.folder_contratos_id,
    folders.folder_propostas_id,
    folders.folder_faturas_id,
    ...(folders.folder_projetos_id ? [folders.folder_projetos_id] : []),
  ]);
}

function projetosSiblingModuleIds(folders: ClientGoogleDriveFolderRow): Set<string> {
  return new Set([
    folders.client_root_folder_id,
    folders.folder_arquivos_id,
    folders.folder_contratos_id,
    folders.folder_propostas_id,
    folders.folder_faturas_id,
  ]);
}

async function isAllowedUploadFolder(
  accessToken: string,
  destFolderId: string,
  folders: ClientGoogleDriveFolderRow,
): Promise<boolean> {
  if (await isFolderUnderClientArquivosTree(
    accessToken,
    destFolderId,
    folders.folder_arquivos_id,
    moduleFolderIds(folders),
  )) {
    return true;
  }
  if (folders.folder_projetos_id) {
    return isFolderUnderClientProjetosTree(
      accessToken,
      destFolderId,
      folders.folder_projetos_id,
      projetosSiblingModuleIds(folders),
    );
  }
  return false;
}

async function loadTrackedClientFileRow(params: {
  tenantId: string;
  clientId: string;
  driveFileId: string;
}): Promise<ClientGoogleDriveFileRow | null> {
  const r = await pool.query<ClientGoogleDriveFileRow>(
    `SELECT id, tenant_id, client_id, drive_file_id, drive_folder_id, name, mime_type, size_bytes,
            web_view_link, web_content_link, source_module, upload_status, upload_error, created_by_user_id,
            created_at::text AS created_at, updated_at::text AS updated_at, trashed_at::text AS trashed_at
     FROM client_google_drive_files
     WHERE tenant_id = $1 AND client_id = $2 AND drive_file_id = $3
       AND source_module = $4 AND trashed_at IS NULL
     LIMIT 1`,
    [params.tenantId, params.clientId, params.driveFileId, CLIENT_GOOGLE_DRIVE_SOURCE_MODULE],
  );
  return r.rows[0] ?? null;
}

/** Resolve por UUID da linha (preferido) ou por drive_file_id legado. */
export async function resolveTrackedClientFileRow(params: {
  tenantId: string;
  clientId: string;
  fileRef: string;
}): Promise<ClientGoogleDriveFileRow | null> {
  const ref = params.fileRef.trim();
  if (!ref) return null;
  if (isLikelyUuid(ref)) {
    const byId = await pool.query<ClientGoogleDriveFileRow>(
      `SELECT id, tenant_id, client_id, drive_file_id, drive_folder_id, name, mime_type, size_bytes,
              web_view_link, web_content_link, source_module, upload_status, upload_error, created_by_user_id,
              created_at::text AS created_at, updated_at::text AS updated_at, trashed_at::text AS trashed_at
       FROM client_google_drive_files
       WHERE id = $1::uuid AND tenant_id = $2 AND client_id = $3
         AND source_module = $4 AND trashed_at IS NULL
       LIMIT 1`,
      [ref, params.tenantId, params.clientId, CLIENT_GOOGLE_DRIVE_SOURCE_MODULE],
    );
    if (byId.rows[0]) return byId.rows[0];
  }
  return loadTrackedClientFileRow({
    tenantId: params.tenantId,
    clientId: params.clientId,
    driveFileId: ref,
  });
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

  const allowed = await isAllowedUploadFolder(conn.accessToken, destFolderId, folders);
  if (!allowed) {
    const err = new Error('Pasta de destino inválida.');
    (err as Error & { code?: string }).code = 'folder_invalid';
    throw err;
  }

  const safeName = normalizeFilename(params.originalName);
  const sizeBytes = params.fileBytes.length;

  const pending = await pool.query<ClientGoogleDriveFileRow>(
    `INSERT INTO client_google_drive_files (
       tenant_id, client_id, drive_file_id, drive_folder_id, name, mime_type, size_bytes,
       web_view_link, web_content_link, source_module, created_by_user_id, upload_status
     ) VALUES ($1, $2, NULL, $3, $4, $5, $6, NULL, NULL, $7, $8, 'uploading')
     RETURNING id, tenant_id, client_id, drive_file_id, drive_folder_id, name, mime_type, size_bytes,
               web_view_link, web_content_link, source_module, upload_status, upload_error, created_by_user_id,
               created_at::text AS created_at, updated_at::text AS updated_at, trashed_at::text AS trashed_at`,
    [
      params.tenantId,
      params.clientId,
      destFolderId,
      safeName,
      params.mimeType,
      sizeBytes,
      CLIENT_GOOGLE_DRIVE_SOURCE_MODULE,
      params.createdByUserId,
    ],
  );

  const rowId = pending.rows[0]!.id;

  try {
    const uploaded = await uploadFileToDrive({
      accessToken: conn.accessToken,
      folderId: destFolderId,
      filename: safeName,
      mimeType: params.mimeType,
      content: params.fileBytes,
    });

    const ur = await pool.query<ClientGoogleDriveFileRow>(
      `UPDATE client_google_drive_files
       SET drive_file_id = $1,
           name = $2,
           mime_type = $3,
           size_bytes = $4,
           web_view_link = $5,
           web_content_link = $6,
           upload_status = 'ready',
           upload_error = NULL,
           updated_at = now()
       WHERE id = $7
       RETURNING id, tenant_id, client_id, drive_file_id, drive_folder_id, name, mime_type, size_bytes,
                 web_view_link, web_content_link, source_module, upload_status, upload_error, created_by_user_id,
                 created_at::text AS created_at, updated_at::text AS updated_at, trashed_at::text AS trashed_at`,
      [
        uploaded.id,
        uploaded.name,
        uploaded.mimeType,
        uploaded.size || sizeBytes,
        uploaded.webViewLink,
        uploaded.webContentLink,
        rowId,
      ],
    );

    return ur.rows[0]!;
  } catch (e) {
    const safeMsg = sanitizeClientUploadError(e);
    await pool.query(
      `UPDATE client_google_drive_files
       SET upload_status = 'failed', upload_error = $1, updated_at = now()
       WHERE id = $2`,
      [safeMsg, rowId],
    );
    throw e;
  }
}

export async function retryFailedClientGoogleDriveUpload(params: {
  tenantId: string;
  clientId: string;
  createdByUserId: string;
  fileRef: string;
  originalName: string;
  mimeType: string;
  fileBytes: Buffer;
}): Promise<ClientGoogleDriveFileRow> {
  const row = await resolveTrackedClientFileRow({
    tenantId: params.tenantId,
    clientId: params.clientId,
    fileRef: params.fileRef,
  });
  if (!row || row.upload_status !== 'failed') {
    const err = new Error('Só é possível repetir envios que falharam.');
    (err as Error & { code?: string }).code = 'retry_invalid';
    throw err;
  }

  await ensureClientGoogleDriveFolderStructure(params.tenantId, params.clientId);
  const folders = await getClientGoogleDriveFolders(params.tenantId, params.clientId);
  if (!folders) {
    const err = new Error('Estrutura de pastas do cliente indisponível.');
    (err as Error & { code?: string }).code = 'folders_unavailable';
    throw err;
  }

  const destFolderId = row.drive_folder_id;
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

  const allowed = await isAllowedUploadFolder(conn.accessToken, destFolderId, folders);
  if (!allowed) {
    const err = new Error('Pasta de destino inválida.');
    (err as Error & { code?: string }).code = 'folder_invalid';
    throw err;
  }

  const safeName = normalizeFilename(params.originalName);
  const sizeBytes = params.fileBytes.length;

  await pool.query(
    `UPDATE client_google_drive_files
     SET drive_file_id = NULL,
         name = $1,
         mime_type = $2,
         size_bytes = $3,
         web_view_link = NULL,
         web_content_link = NULL,
         upload_status = 'uploading',
         upload_error = NULL,
         updated_at = now()
     WHERE id = $4`,
    [safeName, params.mimeType, sizeBytes, row.id],
  );

  try {
    const uploaded = await uploadFileToDrive({
      accessToken: conn.accessToken,
      folderId: destFolderId,
      filename: safeName,
      mimeType: params.mimeType,
      content: params.fileBytes,
    });

    const ur = await pool.query<ClientGoogleDriveFileRow>(
      `UPDATE client_google_drive_files
       SET drive_file_id = $1,
           name = $2,
           mime_type = $3,
           size_bytes = $4,
           web_view_link = $5,
           web_content_link = $6,
           upload_status = 'ready',
           upload_error = NULL,
           updated_at = now()
       WHERE id = $7
       RETURNING id, tenant_id, client_id, drive_file_id, drive_folder_id, name, mime_type, size_bytes,
                 web_view_link, web_content_link, source_module, upload_status, upload_error, created_by_user_id,
                 created_at::text AS created_at, updated_at::text AS updated_at, trashed_at::text AS trashed_at`,
      [
        uploaded.id,
        uploaded.name,
        uploaded.mimeType,
        uploaded.size || sizeBytes,
        uploaded.webViewLink,
        uploaded.webContentLink,
        row.id,
      ],
    );

    return ur.rows[0]!;
  } catch (e) {
    const safeMsg = sanitizeClientUploadError(e);
    await pool.query(
      `UPDATE client_google_drive_files
       SET upload_status = 'failed', upload_error = $1, updated_at = now()
       WHERE id = $2`,
      [safeMsg, row.id],
    );
    throw e;
  }
}

export async function moveClientGoogleDriveFile(params: {
  tenantId: string;
  clientId: string;
  fileRef: string;
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

  const row = await resolveTrackedClientFileRow({
    tenantId: params.tenantId,
    clientId: params.clientId,
    fileRef: params.fileRef,
  });
  if (!row) {
    const err = new Error('Arquivo não encontrado ou não gerido por esta área.');
    (err as Error & { code?: string }).code = 'file_not_tracked';
    throw err;
  }

  if (!row.drive_file_id || row.upload_status !== 'ready') {
    const err = new Error('Aguarde o envio terminar antes de mover este arquivo.');
    (err as Error & { code?: string }).code = 'file_pending';
    throw err;
  }

  let conn = await getDriveIntegrationSecrets(params.tenantId);
  if (!conn) {
    const err = new Error('Google Drive não está ligado para esta empresa.');
    (err as Error & { code?: string }).code = 'drive_not_connected';
    throw err;
  }
  conn = await refreshDriveTokenIfNeeded(conn);

  const allowedDest = await isAllowedUploadFolder(conn.accessToken, dest, folders);
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

  const meta = await getDriveFileMetadata(conn.accessToken, row.drive_file_id);
  const parents = meta.parents;
  const removeParents =
    parents?.length ? parents[0]! : row.drive_folder_id;
  if (removeParents === dest) {
    return row;
  }

  await moveDriveFile(conn.accessToken, row.drive_file_id, removeParents, dest);

  const ur = await pool.query<ClientGoogleDriveFileRow>(
    `UPDATE client_google_drive_files
     SET drive_folder_id = $1, updated_at = now()
     WHERE id = $2
     RETURNING id, tenant_id, client_id, drive_file_id, drive_folder_id, name, mime_type, size_bytes,
               web_view_link, web_content_link, source_module, upload_status, upload_error, created_by_user_id,
               created_at::text AS created_at, updated_at::text AS updated_at, trashed_at::text AS trashed_at`,
    [dest, row.id],
  );
  return ur.rows[0]!;
}

export async function deleteClientGoogleDriveFile(params: {
  tenantId: string;
  clientId: string;
  fileRef: string;
}): Promise<void> {
  const row = await resolveTrackedClientFileRow({
    tenantId: params.tenantId,
    clientId: params.clientId,
    fileRef: params.fileRef,
  });
  if (!row) {
    const err = new Error('Arquivo não encontrado ou não gerido por esta área.');
    (err as Error & { code?: string }).code = 'file_not_tracked';
    throw err;
  }

  if (!row.drive_file_id) {
    await pool.query(
      `UPDATE client_google_drive_files SET trashed_at = now(), updated_at = now() WHERE id = $1`,
      [row.id],
    );
    return;
  }

  let conn = await getDriveIntegrationSecrets(params.tenantId);
  if (!conn) {
    const err = new Error('Google Drive não está ligado para esta empresa.');
    (err as Error & { code?: string }).code = 'drive_not_connected';
    throw err;
  }
  conn = await refreshDriveTokenIfNeeded(conn);

  await trashDriveFile(conn.accessToken, row.drive_file_id);

  await pool.query(
    `UPDATE client_google_drive_files SET trashed_at = now(), updated_at = now() WHERE id = $1`,
    [row.id],
  );
}
