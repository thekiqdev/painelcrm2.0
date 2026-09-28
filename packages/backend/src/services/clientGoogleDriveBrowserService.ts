import {
  ensureClientGoogleDriveFolderStructure,
  type ClientGoogleDriveFolderRow,
} from './clientGoogleDriveFoldersService.js';
import { resolveProjectGoogleDriveBrowseFolder } from './projectGoogleDriveFoldersService.js';
import { pool } from '../utils/db.js';
import { CLIENT_GOOGLE_DRIVE_SOURCE_MODULE } from './clientGoogleDriveFilesService.js';

function forbiddenBrowseFolderIds(row: ClientGoogleDriveFolderRow): Set<string> {
  return new Set([
    row.client_root_folder_id,
    row.folder_contratos_id,
    row.folder_propostas_id,
    row.folder_faturas_id,
    ...(row.folder_projetos_id ? [row.folder_projetos_id] : []),
  ]);
}

function forbiddenProjetosSiblingIds(row: ClientGoogleDriveFolderRow): Set<string> {
  return new Set([
    row.client_root_folder_id,
    row.folder_arquivos_id,
    row.folder_contratos_id,
    row.folder_propostas_id,
    row.folder_faturas_id,
  ]);
}

export type BrowserBreadcrumbEntry = { name: string; folder_id: string };

export type BrowserItem = {
  id: string;
  type: 'folder' | 'file';
  name: string;
  mime_type?: string;
  size_bytes?: number;
  web_view_link?: string | null;
  created_at?: string;
  modified_at?: string;
  upload_status?: 'uploading' | 'processing' | 'ready' | 'failed';
  upload_error?: string | null;
  drive_file_id?: string | null;
};

export type ClientGoogleDriveBrowserPayload = {
  current_folder_id: string;
  parent_folder_id: string | null;
  breadcrumb: BrowserBreadcrumbEntry[];
  items: BrowserItem[];
  drive_folder_view_url: string;
  /** Quando navegação é escopo de projeto. */
  project_id?: string;
  browse_scope?: 'arquivos' | 'projetos';
};

function driveFolderWebUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
}

type UserFolderMeta = { parent_drive_folder_id: string; name: string };

function buildBreadcrumbFromUserFolders(
  effectiveId: string,
  topRootId: string,
  topRootName: string,
  ufMap: Map<string, UserFolderMeta>,
): BrowserBreadcrumbEntry[] {
  const chain: BrowserBreadcrumbEntry[] = [];
  let cur: string | null = effectiveId;
  for (let i = 0; i < 64; i++) {
    if (!cur) break;
    if (cur === topRootId) {
      chain.unshift({ name: topRootName, folder_id: topRootId });
      break;
    }
    const uf = ufMap.get(cur);
    if (!uf) {
      const err = new Error('Pasta inválida ou sem permissão.');
      (err as Error & { code?: string }).code = 'folder_invalid';
      throw err;
    }
    chain.unshift({ name: uf.name, folder_id: cur });
    cur = uf.parent_drive_folder_id;
  }
  if (chain.length === 0 || chain[0].folder_id !== topRootId) {
    const err = new Error('Pasta fora da área permitida do cliente.');
    (err as Error & { code?: string }).code = 'folder_invalid';
    throw err;
  }
  return chain;
}

async function loadUserFolderMap(tenantId: string, clientId: string): Promise<Map<string, UserFolderMeta>> {
  const ufr = await pool.query<{ drive_folder_id: string; parent_drive_folder_id: string; name: string }>(
    `SELECT drive_folder_id, parent_drive_folder_id, name
     FROM client_google_drive_user_folders
     WHERE tenant_id = $1 AND client_id = $2 AND trashed_at IS NULL`,
    [tenantId, clientId],
  );
  return new Map<string, UserFolderMeta>(
    ufr.rows.map((x) => [x.drive_folder_id, { parent_drive_folder_id: x.parent_drive_folder_id, name: x.name }]),
  );
}

async function assertFolderInUserFolders(
  tenantId: string,
  clientId: string,
  folderId: string,
): Promise<void> {
  const check = await pool.query(
    `SELECT 1 FROM client_google_drive_user_folders
     WHERE tenant_id = $1 AND client_id = $2 AND drive_folder_id = $3 AND trashed_at IS NULL
     LIMIT 1`,
    [tenantId, clientId, folderId],
  );
  if (check.rowCount === 0) {
    const err = new Error('Pasta inválida ou sem permissão.');
    (err as Error & { code?: string }).code = 'folder_invalid';
    throw err;
  }
}

async function listFolderItems(
  tenantId: string,
  clientId: string,
  effectiveId: string,
): Promise<BrowserItem[]> {
  const folderRows = await pool.query<{ drive_folder_id: string; name: string; created_at: string }>(
    `SELECT drive_folder_id, name, created_at::text AS created_at
     FROM client_google_drive_user_folders
     WHERE tenant_id = $1 AND client_id = $2 AND parent_drive_folder_id = $3 AND trashed_at IS NULL
     ORDER BY lower(name) ASC`,
    [tenantId, clientId, effectiveId],
  );

  const fileRows = await pool.query<{
    id: string;
    drive_file_id: string | null;
    name: string;
    mime_type: string;
    size_bytes: string;
    web_view_link: string | null;
    upload_status: string;
    upload_error: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, drive_file_id, name, mime_type, size_bytes::text, web_view_link,
            upload_status, upload_error, created_at::text AS created_at, updated_at::text AS updated_at
     FROM client_google_drive_files
     WHERE tenant_id = $1 AND client_id = $2 AND drive_folder_id = $3
       AND source_module = $4 AND trashed_at IS NULL
     ORDER BY created_at DESC`,
    [tenantId, clientId, effectiveId, CLIENT_GOOGLE_DRIVE_SOURCE_MODULE],
  );

  const folderItems: BrowserItem[] = folderRows.rows.map((f) => ({
    id: f.drive_folder_id,
    type: 'folder' as const,
    name: f.name,
    created_at: f.created_at,
    modified_at: f.created_at,
  }));

  const fileItems: BrowserItem[] = fileRows.rows.map((f) => ({
    id: f.id,
    type: 'file' as const,
    name: f.name,
    mime_type: f.mime_type,
    size_bytes: Number(f.size_bytes),
    web_view_link: f.web_view_link,
    created_at: f.created_at,
    modified_at: f.updated_at,
    upload_status: f.upload_status as BrowserItem['upload_status'],
    upload_error: f.upload_error,
    drive_file_id: f.drive_file_id,
  }));

  return [...folderItems, ...fileItems];
}

async function getArquivosBrowserPayload(params: {
  tenantId: string;
  clientId: string;
  folderId: string | undefined;
  row: ClientGoogleDriveFolderRow;
}): Promise<ClientGoogleDriveBrowserPayload> {
  const arquivosRootId = params.row.folder_arquivos_id;
  const forbidden = forbiddenBrowseFolderIds(params.row);

  const effectiveId = (params.folderId || '').trim() || arquivosRootId;
  if (forbidden.has(effectiveId)) {
    const err = new Error('Esta pasta não está disponível nesta visualização.');
    (err as Error & { code?: string }).code = 'folder_forbidden';
    throw err;
  }

  if (effectiveId !== arquivosRootId) {
    await assertFolderInUserFolders(params.tenantId, params.clientId, effectiveId);
  }

  const ufMap = await loadUserFolderMap(params.tenantId, params.clientId);
  const breadcrumb = buildBreadcrumbFromUserFolders(effectiveId, arquivosRootId, 'Arquivos', ufMap);

  let parent_folder_id: string | null = null;
  if (effectiveId !== arquivosRootId) {
    parent_folder_id = ufMap.get(effectiveId)?.parent_drive_folder_id ?? null;
  }

  const items = await listFolderItems(params.tenantId, params.clientId, effectiveId);

  return {
    current_folder_id: effectiveId,
    parent_folder_id,
    breadcrumb,
    items,
    drive_folder_view_url: driveFolderWebUrl(effectiveId),
    browse_scope: 'arquivos',
  };
}

async function getProjetosBrowserPayload(params: {
  tenantId: string;
  clientId: string;
  projectId: string;
  folderId: string | undefined;
  row: ClientGoogleDriveFolderRow;
}): Promise<ClientGoogleDriveBrowserPayload> {
  const projetosRootId = params.row.folder_projetos_id;
  if (!projetosRootId) {
    const err = new Error('Pasta Projetos do cliente ainda não foi criada.');
    (err as Error & { code?: string }).code = 'folders_unavailable';
    throw err;
  }

  const projectResolved = await resolveProjectGoogleDriveBrowseFolder(params.projectId);
  if (!projectResolved || projectResolved.client_id !== params.clientId) {
    const err = new Error('Estrutura de pastas do projeto não encontrada. Use «Preparar pastas».');
    (err as Error & { code?: string }).code = 'project_folders_missing';
    throw err;
  }

  const forbidden = forbiddenProjetosSiblingIds(params.row);
  const defaultBrowseId = projectResolved.browse_folder_id;
  const effectiveId = (params.folderId || '').trim() || defaultBrowseId;

  if (forbidden.has(effectiveId)) {
    const err = new Error('Esta pasta não está disponível nesta visualização.');
    (err as Error & { code?: string }).code = 'folder_forbidden';
    throw err;
  }

  if (effectiveId !== projetosRootId) {
    await assertFolderInUserFolders(params.tenantId, params.clientId, effectiveId);
  }

  const ufMap = await loadUserFolderMap(params.tenantId, params.clientId);
  const breadcrumb = buildBreadcrumbFromUserFolders(effectiveId, projetosRootId, 'Projetos', ufMap);

  let parent_folder_id: string | null = null;
  if (effectiveId !== projetosRootId) {
    parent_folder_id = ufMap.get(effectiveId)?.parent_drive_folder_id ?? null;
  }

  const items = await listFolderItems(params.tenantId, params.clientId, effectiveId);

  return {
    current_folder_id: effectiveId,
    parent_folder_id,
    breadcrumb,
    items,
    drive_folder_view_url: driveFolderWebUrl(effectiveId),
    project_id: params.projectId,
    browse_scope: 'projetos',
  };
}

export async function getClientGoogleDriveBrowserPayload(params: {
  tenantId: string;
  clientId: string;
  folderId?: string;
  projectId?: string;
}): Promise<ClientGoogleDriveBrowserPayload> {
  const structure = await ensureClientGoogleDriveFolderStructure(params.tenantId, params.clientId);
  const row: ClientGoogleDriveFolderRow = structure;

  if (params.projectId) {
    return getProjetosBrowserPayload({
      tenantId: params.tenantId,
      clientId: params.clientId,
      projectId: params.projectId,
      folderId: params.folderId,
      row,
    });
  }

  return getArquivosBrowserPayload({
    tenantId: params.tenantId,
    clientId: params.clientId,
    folderId: params.folderId,
    row,
  });
}
