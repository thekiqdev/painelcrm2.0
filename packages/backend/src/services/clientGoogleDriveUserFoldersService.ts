import { pool } from '../utils/db.js';
import { isGoogleDriveIntegrationEnabled } from '../config/googleDriveEnv.js';
import {
  ensureClientGoogleDriveFolderStructure,
  getClientGoogleDriveFolders,
  type ClientGoogleDriveFolderRow,
} from './clientGoogleDriveFoldersService.js';
import { getDriveIntegrationSecrets } from './googleDriveConnectionService.js';
import { createDriveFolder, isFolderUnderClientArquivosTree, refreshDriveTokenIfNeeded } from './googleDriveService.js';

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
