/**
 * Criação idempotente da árvore Drive por cliente sob a pasta «Clientes» do tenant.
 */
import type { PoolClient } from 'pg';
import { pool } from '../utils/db.js';
import { isGoogleDriveIntegrationEnabled } from '../config/googleDriveEnv.js';
import {
  getDriveIntegrationSecrets,
} from './googleDriveConnectionService.js';
import {
  createDriveFolder,
  refreshDriveTokenIfNeeded,
} from './googleDriveService.js';

const SUBFOLDER_NAMES = ['Arquivos', 'Contratos', 'Propostas', 'Faturas'] as const;

export type ClientGoogleDriveFolderRow = {
  client_id: string;
  client_root_folder_id: string;
  folder_arquivos_id: string;
  folder_contratos_id: string;
  folder_propostas_id: string;
  folder_faturas_id: string;
};

export type EnsureClientGoogleDriveFoldersResult = ClientGoogleDriveFolderRow & {
  created: boolean;
};

export async function getClientGoogleDriveFolders(
  tenantId: string,
  clientId: string,
): Promise<ClientGoogleDriveFolderRow | null> {
  return loadExistingRow(clientId, tenantId);
}

function sanitizeDriveSegment(raw: string): string {
  return raw.replace(/[\\/]/g, ' ').trim().slice(0, 180);
}

/** Nome da pasta do cliente no Drive: nome sanitizado + sufixo curto do id para desambiguar. */
export function buildClientDriveFolderName(clientName: string | null | undefined, clientId: string): string {
  const base = sanitizeDriveSegment(clientName ?? '') || 'Cliente';
  const short = clientId.replace(/-/g, '').slice(0, 8);
  return `${base} (${short})`.slice(0, 200);
}

async function loadTenantClientsFolderId(tenantId: string): Promise<string | null> {
  const r = await pool.query<{ clients_folder_id: string | null; is_connected: boolean }>(
    `SELECT clients_folder_id, is_connected
     FROM tenant_google_drive_integrations
     WHERE tenant_id = $1
     LIMIT 1`,
    [tenantId],
  );
  const row = r.rows[0];
  if (!row?.is_connected || !row.clients_folder_id) return null;
  return row.clients_folder_id;
}

async function loadExistingRow(
  clientId: string,
  tenantId: string,
  db: PoolClient | Pick<typeof pool, 'query'> = pool,
): Promise<ClientGoogleDriveFolderRow | null> {
  const r = await db.query<ClientGoogleDriveFolderRow>(
    `SELECT client_id, client_root_folder_id, folder_arquivos_id, folder_contratos_id,
            folder_propostas_id, folder_faturas_id
     FROM client_google_drive_folders
     WHERE client_id = $1 AND tenant_id = $2
     LIMIT 1`,
    [clientId, tenantId],
  );
  return r.rows[0] ?? null;
}

async function loadClientNameForTenant(clientId: string, tenantId: string): Promise<string | null> {
  const r = await pool.query<{ name: string | null }>(
    `SELECT c.name
     FROM clients c
     INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $2
     WHERE c.id = $1
     LIMIT 1`,
    [clientId, tenantId],
  );
  return r.rows[0]?.name ?? null;
}

export async function ensureClientGoogleDriveFolderStructure(
  tenantId: string,
  clientId: string,
): Promise<EnsureClientGoogleDriveFoldersResult> {
  if (!isGoogleDriveIntegrationEnabled()) {
    const err = new Error('Integração Google Drive desativada neste servidor.');
    (err as Error & { code?: string }).code = 'drive_disabled';
    throw err;
  }

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query(`SELECT pg_advisory_xact_lock(hashtext($1::text))`, [`gdrive:${tenantId}:${clientId}`]);

    const existingAfterLock = await loadExistingRow(clientId, tenantId, db);
    if (existingAfterLock) {
      await db.query('COMMIT');
      return { ...existingAfterLock, created: false };
    }

    const clientsParentId = await loadTenantClientsFolderId(tenantId);
    if (!clientsParentId) {
      await db.query('ROLLBACK');
      const err = new Error(
        'Google Drive não está ligado para esta empresa ou a pasta «Clientes» ainda não existe. Configure em Configurações → Integrações → Google Drive.',
      );
      (err as Error & { code?: string }).code = 'drive_not_connected';
      throw err;
    }

    let conn = await getDriveIntegrationSecrets(tenantId);
    if (!conn) {
      await db.query('ROLLBACK');
      const err = new Error('Google Drive não está ligado para esta empresa.');
      (err as Error & { code?: string }).code = 'drive_not_connected';
      throw err;
    }
    conn = await refreshDriveTokenIfNeeded(conn);

    const clientName = await loadClientNameForTenant(clientId, tenantId);
    const folderLabel = buildClientDriveFolderName(clientName, clientId);

    const clientRootFolderId = await createDriveFolder(conn.accessToken, folderLabel, clientsParentId);

    const arquivosId = await createDriveFolder(conn.accessToken, SUBFOLDER_NAMES[0], clientRootFolderId);
    const contratosId = await createDriveFolder(conn.accessToken, SUBFOLDER_NAMES[1], clientRootFolderId);
    const propostasId = await createDriveFolder(conn.accessToken, SUBFOLDER_NAMES[2], clientRootFolderId);
    const faturasId = await createDriveFolder(conn.accessToken, SUBFOLDER_NAMES[3], clientRootFolderId);

    await db.query(
      `INSERT INTO client_google_drive_folders (
         tenant_id, client_id, client_root_folder_id,
         folder_arquivos_id, folder_contratos_id, folder_propostas_id, folder_faturas_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (client_id) DO UPDATE SET
         client_root_folder_id = EXCLUDED.client_root_folder_id,
         folder_arquivos_id = EXCLUDED.folder_arquivos_id,
         folder_contratos_id = EXCLUDED.folder_contratos_id,
         folder_propostas_id = EXCLUDED.folder_propostas_id,
         folder_faturas_id = EXCLUDED.folder_faturas_id,
         updated_at = now()`,
      [tenantId, clientId, clientRootFolderId, arquivosId, contratosId, propostasId, faturasId],
    );

    await db.query('COMMIT');

    return {
      client_id: clientId,
      client_root_folder_id: clientRootFolderId,
      folder_arquivos_id: arquivosId,
      folder_contratos_id: contratosId,
      folder_propostas_id: propostasId,
      folder_faturas_id: faturasId,
      created: true,
    };
  } catch (e) {
    try {
      await db.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    db.release();
  }
}
