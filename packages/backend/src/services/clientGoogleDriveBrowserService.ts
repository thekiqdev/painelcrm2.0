import {
  ensureClientGoogleDriveFolderStructure,
  type ClientGoogleDriveFolderRow,
} from './clientGoogleDriveFoldersService.js';
import { getDriveIntegrationSecrets } from './googleDriveConnectionService.js';
import {
  getDriveFileMetadata,
  listDriveFolderChildren,
  isFolderUnderClientArquivosTree,
  refreshDriveTokenIfNeeded,
} from './googleDriveService.js';

function forbiddenBrowseFolderIds(row: ClientGoogleDriveFolderRow): Set<string> {
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
};

export type ClientGoogleDriveBrowserPayload = {
  current_folder_id: string;
  parent_folder_id: string | null;
  breadcrumb: BrowserBreadcrumbEntry[];
  items: BrowserItem[];
  drive_folder_view_url: string;
};

function driveFolderWebUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
}

async function buildBreadcrumb(
  accessToken: string,
  currentFolderId: string,
  arquivosRootId: string,
  modIds: Set<string>,
): Promise<BrowserBreadcrumbEntry[]> {
  const chain: BrowserBreadcrumbEntry[] = [];
  let cur: string | null = currentFolderId;
  for (let i = 0; i < 64; i++) {
    if (!cur) break;
    if (modIds.has(cur)) {
      throw new Error('Pasta não permitida nesta área.');
    }
    const meta = await getDriveFileMetadata(accessToken, cur);
    const name = cur === arquivosRootId ? 'Arquivos' : meta.name || 'Pasta';
    chain.unshift({ name, folder_id: cur });
    if (cur === arquivosRootId) break;
    const parents = meta.parents;
    if (!parents?.length) {
      throw new Error('Estrutura de pastas inválida no Drive.');
    }
    cur = parents[0]!;
  }
  if (chain.length === 0 || chain[0].folder_id !== arquivosRootId) {
    throw new Error('Pasta fora da área Arquivos do cliente.');
  }
  return chain;
}

export async function getClientGoogleDriveBrowserPayload(params: {
  tenantId: string;
  clientId: string;
  folderId: string | undefined;
}): Promise<ClientGoogleDriveBrowserPayload> {
  const structure = await ensureClientGoogleDriveFolderStructure(params.tenantId, params.clientId);
  const row: ClientGoogleDriveFolderRow = structure;
  const arquivosRootId = row.folder_arquivos_id;
  const forbidden = forbiddenBrowseFolderIds(row);
  const modIds = moduleFolderIds(row);

  const effectiveId = (params.folderId || '').trim() || arquivosRootId;
  if (forbidden.has(effectiveId)) {
    const err = new Error('Esta pasta não está disponível nesta visualização.');
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

  const ok = await isFolderUnderClientArquivosTree(
    conn.accessToken,
    effectiveId,
    arquivosRootId,
    modIds,
  );
  if (!ok) {
    const err = new Error('Pasta inválida ou sem permissão.');
    (err as Error & { code?: string }).code = 'folder_invalid';
    throw err;
  }

  const children = await listDriveFolderChildren(conn.accessToken, effectiveId);
  const items: BrowserItem[] = children.map((c) => {
    const isFolder = c.mimeType === 'application/vnd.google-apps.folder';
    return {
      id: c.id,
      type: isFolder ? 'folder' : 'file',
      name: c.name,
      mime_type: c.mimeType,
      size_bytes: isFolder ? undefined : c.size,
      web_view_link: c.webViewLink ?? null,
      created_at: c.createdTime,
      modified_at: c.modifiedTime,
    };
  });

  const breadcrumb = await buildBreadcrumb(conn.accessToken, effectiveId, arquivosRootId, modIds);

  let parent_folder_id: string | null = null;
  if (effectiveId !== arquivosRootId) {
    const meta = await getDriveFileMetadata(conn.accessToken, effectiveId);
    parent_folder_id = meta.parents?.[0] ?? null;
  }

  return {
    current_folder_id: effectiveId,
    parent_folder_id,
    breadcrumb,
    items,
    drive_folder_view_url: driveFolderWebUrl(effectiveId),
  };
}
