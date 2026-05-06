import { Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';
import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';
import {
  createClientTimelineEvent,
  listClientTimelineEvents,
  type ClientTimelineEventName,
} from '../services/clientTimelineEventsService.js';
import { ensureClientGoogleDriveFolderStructure } from '../services/clientGoogleDriveFoldersService.js';
import {
  listClientGoogleDriveFiles,
  uploadClientGoogleDriveFile,
  CLIENT_GOOGLE_DRIVE_SOURCE_MODULE,
} from '../services/clientGoogleDriveFilesService.js';

const MODULE_CLIENTS = 'clients';

let hasClientWhatsappAvatarUrlColumnPromise: Promise<boolean> | null = null;
async function hasClientWhatsappAvatarUrlColumn(): Promise<boolean> {
  if (!hasClientWhatsappAvatarUrlColumnPromise) {
    hasClientWhatsappAvatarUrlColumnPromise = (async () => {
      const r = await pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'clients'
           AND column_name = 'whatsapp_avatar_url'`
      );
      return (r.rows[0]?.c ?? '0') === '1';
    })();
  }
  return hasClientWhatsappAvatarUrlColumnPromise;
}

let hasClientWhatsappAvatarCachedUrlColumnPromise: Promise<boolean> | null = null;
async function hasClientWhatsappAvatarCachedUrlColumn(): Promise<boolean> {
  if (!hasClientWhatsappAvatarCachedUrlColumnPromise) {
    hasClientWhatsappAvatarCachedUrlColumnPromise = (async () => {
      const r = await pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'clients'
           AND column_name = 'whatsapp_avatar_cached_url'`
      );
      return (r.rows[0]?.c ?? '0') === '1';
    })();
  }
  return hasClientWhatsappAvatarCachedUrlColumnPromise;
}

async function clientWhatsappAvatarSelectExpr(): Promise<string> {
  const hasUrl = await hasClientWhatsappAvatarUrlColumn();
  const hasCached = await hasClientWhatsappAvatarCachedUrlColumn();
  if (hasUrl && hasCached) {
    return 'COALESCE(c.whatsapp_avatar_cached_url, c.whatsapp_avatar_url, wa.wa_url)';
  }
  if (hasUrl) {
    return 'COALESCE(c.whatsapp_avatar_url, wa.wa_url)';
  }
  return 'wa.wa_url';
}

/** Verifica se o cliente pertence ao tenant (acesso por conta, não por dono). */
async function clientBelongsToTenant(clientId: string, tenantId: string | null): Promise<boolean> {
  if (!tenantId) return false;
  const r = await pool.query(
    `SELECT 1 FROM clients c
     INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1
     WHERE c.id = $2`,
    [tenantId, clientId]
  );
  return r.rows.length > 0;
}

async function clientOwnerForTenant(clientId: string, tenantId: string): Promise<string | null> {
  const r = await pool.query<{ user_id: string }>(
    `SELECT c.user_id
     FROM clients c
     INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $2
     WHERE c.id = $1
     LIMIT 1`,
    [clientId, tenantId],
  );
  return r.rows[0]?.user_id ?? null;
}

/** Grupo existe e pertence ao tenant (via dono do grupo em users). */
async function clientGroupBelongsToTenant(groupId: string, tenantId: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM client_groups cg
     INNER JOIN users u ON u.id = cg.user_id AND u.tenant_id = $2
     WHERE cg.id = $1
     LIMIT 1`,
    [groupId, tenantId]
  );
  return r.rows.length > 0;
}

/** Perfil existe e o owner está no tenant (acesso colaborativo ao perfil do tenant). */
async function userProfileBelongsToTenant(profileId: string, tenantId: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM user_profiles up
     INNER JOIN users u ON u.id = up.owner_id AND u.tenant_id = $2
     WHERE up.id = $1
     LIMIT 1`,
    [profileId, tenantId]
  );
  return r.rows.length > 0;
}

const clientSchema = z.object({
  name: z.string().min(1),
  email: z.any().optional().nullable(),
  phone: z.any().optional().nullable(),
  company: z.any().optional().nullable(),
  status: z.any().optional().nullable(),
  source: z.any().optional().nullable(),
  funnel_stage: z.any().optional().nullable(),
  notes: z.any().optional().nullable(),
  group_id: z.any().optional().nullable(),
  profile_id: z.any().optional().nullable(),
  cpf_cnpj: z.string().optional().nullable(),
});

const timelineEventNameSchema = z.enum([
  'chat_match_client_success',
  'chat_link_manual',
  'chat_link_auto_effective',
  'chat_link_migrated_lead_to_client',
  'chat_invoice_sent',
  'chat_invoice_created',
  'chat_proposal_created',
  'chat_proposal_draft_saved',
  'chat_contract_draft_saved',
  'chat_contract_sent_for_signature',
  'invoice_paid',
  'mercado_pago_checkout_created',
  'mercado_pago_webhook_received',
]);

const createTimelineEventSchema = z.object({
  event_name: timelineEventNameSchema,
  source: z.string().min(1).max(80),
  actor_type: z.enum(['user', 'system', 'integration']).default('user'),
  actor_id: z.string().uuid().optional().nullable(),
  reference_type: z.string().max(80).optional().nullable(),
  reference_id: z.string().uuid().optional().nullable(),
  event_key: z.string().max(255).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** Normaliza CPF/CNPJ: apenas dígitos. Retorna null se vazio ou inválido. */
function normalizeCpfCnpj(value: string | null | undefined): string | null {
  if (value == null || typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  return digits.length === 0 ? null : digits;
}

/** Valida se o CPF/CNPJ normalizado tem 11 (CPF) ou 14 (CNPJ) dígitos. */
function isValidCpfCnpjLength(digits: string): boolean {
  return digits.length === 11 || digits.length === 14;
}

export async function getClients(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.json([]);
      return;
    }
    const { profileId, q } = req.query;

    const waAvatarExpr = await clientWhatsappAvatarSelectExpr();

    let query = `
      SELECT 
        c.*,
        cg.id as group_table_id,
        cg.name as group_table_name,
        ${waAvatarExpr} AS whatsapp_avatar_url
      FROM clients c
      INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1
      LEFT JOIN client_groups cg ON c.group_id = cg.id
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          NULLIF(TRIM(cc.metadata->>'whatsapp_profile_photo'), ''),
          NULLIF(TRIM(cc.metadata->>'image'), ''),
          NULLIF(TRIM(cc.metadata->>'imagePreview'), ''),
          NULLIF(TRIM(cc.metadata->>'image_preview'), '')
        ) AS wa_url
        FROM chat_conversations cc
        INNER JOIN users cu ON cu.id = cc.user_id AND cu.tenant_id = $1
        WHERE cc.client_id = c.id
        ORDER BY COALESCE(cc.last_message_at, cc.created_at) DESC NULLS LAST
        LIMIT 1
      ) wa ON true
      WHERE 1=1
    `;
    const params: unknown[] = [tenantId];
    let p = 2;

    if (profileId && typeof profileId === 'string') {
      query += ` AND c.profile_id = $${p}`;
      params.push(profileId);
      p += 1;
    }

    /** Busca por nome, empresa, e-mail, telefone ou CPF/CNPJ (Fase 2 — B1). */
    if (q && typeof q === 'string') {
      const trimmed = q.trim().slice(0, 120);
      if (trimmed.length > 0) {
        const safe = trimmed.replace(/[%_\\]/g, '');
        const pattern = `%${safe}%`;
        query += ` AND (
          c.name ILIKE $${p}
          OR COALESCE(c.company, '') ILIKE $${p}
          OR COALESCE(c.email, '') ILIKE $${p}
          OR COALESCE(c.phone, '') ILIKE $${p}
          OR COALESCE(c.cpf_cnpj, '') ILIKE $${p}
        )`;
        params.push(pattern);
        p += 1;
        query += ' ORDER BY c.name LIMIT 50';
      } else {
        query += ' ORDER BY c.name';
      }
    } else {
      query += ' ORDER BY c.name';
    }

    const result = await pool.query(query, params);
    
    // Format the response to match frontend expectations
    const formattedClients = result.rows.map((row: any) => {
      const client: any = { ...row };
      // Remove the temporary group fields
      delete client.group_table_id;
      delete client.group_table_name;
      
      // Add client_groups object if group exists
      if (row.group_table_id && row.group_table_name) {
        client.client_groups = {
          id: row.group_table_id,
          name: row.group_table_name
        };
      } else {
        client.client_groups = null;
      }
      
      return client;
    });

    res.json(formattedClients);
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getClientById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const waAvatarExpr = await clientWhatsappAvatarSelectExpr();

    const result = await pool.query(
      `SELECT c.*, ${waAvatarExpr} AS whatsapp_avatar_url
       FROM clients c
       INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       LEFT JOIN LATERAL (
         SELECT COALESCE(
           NULLIF(TRIM(cc.metadata->>'whatsapp_profile_photo'), ''),
           NULLIF(TRIM(cc.metadata->>'image'), ''),
           NULLIF(TRIM(cc.metadata->>'imagePreview'), ''),
           NULLIF(TRIM(cc.metadata->>'image_preview'), '')
         ) AS wa_url
         FROM chat_conversations cc
         INNER JOIN users cu ON cu.id = cc.user_id AND cu.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
         WHERE cc.client_id = c.id
         ORDER BY COALESCE(cc.last_message_at, cc.created_at) DESC NULLS LAST
         LIMIT 1
       ) wa ON true
       WHERE c.id = $1`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching client:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getClientTimeline(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    const { id: clientId } = req.params;
    const limit = Number(req.query.limit ?? 50);
    const offset = Number(req.query.offset ?? 0);
    const belongs = await clientBelongsToTenant(clientId, tenantId);
    if (!belongs) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    const events = await listClientTimelineEvents({ tenantId, clientId, limit, offset });
    res.json(events);
  } catch (error) {
    console.error('Error fetching client timeline:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function ensureClientGoogleDriveFolders(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const tenantId = req.tenantId ?? null;
    const { id: clientId } = req.params;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    await assertModulePermission(userId, MODULE_CLIENTS, 'view', undefined, req);
    const belongs = await clientBelongsToTenant(clientId, tenantId);
    if (!belongs) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    const result = await ensureClientGoogleDriveFolderStructure(tenantId, clientId);
    res.json(result);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    const code = (error as Error & { code?: string }).code;
    const msg = error instanceof Error ? error.message : 'Erro ao preparar pastas no Google Drive';
    if (code === 'drive_disabled' || code === 'drive_not_connected') {
      res.status(400).json({ error: msg, code });
      return;
    }
    console.error('[clients] ensure google drive folders', error);
    res.status(500).json({ error: msg });
  }
}

export async function getClientGoogleDriveFiles(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const tenantId = req.tenantId ?? null;
    const { id: clientId } = req.params;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    await assertModulePermission(userId, MODULE_CLIENTS, 'view', undefined, req);
    const belongs = await clientBelongsToTenant(clientId, tenantId);
    if (!belongs) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    const rows = await listClientGoogleDriveFiles(tenantId, clientId);
    res.json(rows);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('[clients] list google drive files', error);
    res.status(500).json({ error: 'Erro ao listar arquivos do Google Drive' });
  }
}

export async function uploadClientGoogleDriveFileHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const tenantId = req.tenantId ?? null;
    const { id: clientId } = req.params;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    const ownerId = await clientOwnerForTenant(clientId, tenantId);
    if (!ownerId) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    await assertModulePermission(
      userId,
      MODULE_CLIENTS,
      'edit',
      { ownerId, assigneeId: null },
      req,
    );
    if (!req.file || !req.file.buffer) {
      res.status(400).json({ error: 'Arquivo obrigatório (campo: file).' });
      return;
    }
    const saved = await uploadClientGoogleDriveFile({
      tenantId,
      clientId,
      createdByUserId: userId,
      originalName: req.file.originalname || 'arquivo',
      mimeType: req.file.mimetype || 'application/octet-stream',
      fileBytes: req.file.buffer,
    });
    res.status(201).json({
      id: saved.id,
      client_id: saved.client_id,
      source_module: CLIENT_GOOGLE_DRIVE_SOURCE_MODULE,
      drive_file_id: saved.drive_file_id,
      drive_folder_id: saved.drive_folder_id,
      name: saved.name,
      mime_type: saved.mime_type,
      size_bytes: Number(saved.size_bytes),
      web_view_link: saved.web_view_link,
      web_content_link: saved.web_content_link,
      created_at: saved.created_at,
    });
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    const code = (error as Error & { code?: string }).code;
    const msg = error instanceof Error ? error.message : 'Erro ao enviar arquivo';
    if (code === 'drive_disabled' || code === 'drive_not_connected' || code === 'folders_unavailable') {
      res.status(400).json({ error: msg, code });
      return;
    }
    console.error('[clients] upload google drive file', error);
    res.status(500).json({ error: msg });
  }
}

export async function createClientTimeline(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    const userId = req.userId!;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    const { id: clientId } = req.params;
    const belongs = await clientBelongsToTenant(clientId, tenantId);
    if (!belongs) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    const parsed = createTimelineEventSchema.parse(req.body);
    const actorId = parsed.actor_id ?? (parsed.actor_type === 'user' ? userId : null);
    await createClientTimelineEvent({
      tenantId,
      clientId,
      eventName: parsed.event_name as ClientTimelineEventName,
      source: parsed.source,
      actorType: parsed.actor_type,
      actorId,
      referenceType: parsed.reference_type ?? null,
      referenceId: parsed.reference_id ?? null,
      eventKey: parsed.event_key ?? null,
      metadata: parsed.metadata ?? {},
    });
    res.status(201).json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error creating client timeline event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createClient(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    await assertModulePermission(userId, MODULE_CLIENTS, 'create', undefined, req);
    const clientData = clientSchema.parse(req.body);

    // Convert empty strings to null for optional fields
    const cleanData: any = {
      name: clientData.name,
    };
    
    // Only include fields that have values
    if (clientData.email && typeof clientData.email === 'string' && clientData.email.trim()) {
      // Validate email format if provided
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(clientData.email.trim())) {
        res.status(400).json({ error: 'Invalid email format' });
        return;
      }
      cleanData.email = clientData.email.trim();
    } else {
      cleanData.email = null;
    }
    
    if (clientData.phone && typeof clientData.phone === 'string' && clientData.phone.trim()) {
      cleanData.phone = clientData.phone.trim();
    } else {
      cleanData.phone = null;
    }
    
    if (clientData.company && typeof clientData.company === 'string' && clientData.company.trim()) {
      cleanData.company = clientData.company.trim();
    } else {
      cleanData.company = null;
    }
    
    if (clientData.status && typeof clientData.status === 'string' && clientData.status.trim()) {
      cleanData.status = clientData.status.trim();
    } else {
      cleanData.status = null;
    }
    
    if (clientData.source && typeof clientData.source === 'string' && clientData.source.trim()) {
      cleanData.source = clientData.source.trim();
    } else {
      cleanData.source = null;
    }
    
    if (clientData.funnel_stage && typeof clientData.funnel_stage === 'string' && clientData.funnel_stage.trim()) {
      cleanData.funnel_stage = clientData.funnel_stage.trim();
    } else {
      cleanData.funnel_stage = null;
    }
    
    if (clientData.notes && typeof clientData.notes === 'string' && clientData.notes.trim()) {
      cleanData.notes = clientData.notes.trim();
    } else {
      cleanData.notes = null;
    }
    
    if (clientData.group_id && typeof clientData.group_id === 'string' && clientData.group_id.trim()) {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(clientData.group_id.trim())) {
        res.status(400).json({ error: 'Invalid group_id format' });
        return;
      }
      cleanData.group_id = clientData.group_id.trim();
    } else {
      cleanData.group_id = null;
    }
    
    if (clientData.profile_id && typeof clientData.profile_id === 'string' && clientData.profile_id.trim()) {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(clientData.profile_id.trim())) {
        res.status(400).json({ error: 'Invalid profile_id format' });
        return;
      }
      cleanData.profile_id = clientData.profile_id.trim();
    } else {
      cleanData.profile_id = null;
    }

    const rawCpfCnpj = clientData.cpf_cnpj != null && typeof clientData.cpf_cnpj === 'string' ? clientData.cpf_cnpj.trim() : '';
    cleanData.cpf_cnpj = normalizeCpfCnpj(rawCpfCnpj || null);
    if (cleanData.cpf_cnpj !== null && !isValidCpfCnpjLength(cleanData.cpf_cnpj)) {
      res.status(400).json({ error: 'CPF/CNPJ deve ter 11 (CPF) ou 14 (CNPJ) dígitos.' });
      return;
    }

    const tenantId = req.tenantId ?? null;
    if (cleanData.group_id) {
      if (!tenantId) {
        res.status(403).json({
          error: 'INVALID_TENANT',
          message: 'Empresa necessária para associar grupo ao cliente.',
        });
        return;
      }
      const groupOk = await clientGroupBelongsToTenant(cleanData.group_id, tenantId);
      if (!groupOk) {
        res.status(400).json({
          error: 'INVALID_GROUP_FOR_TENANT',
          message: 'Grupo inexistente ou não pertence à empresa.',
        });
        return;
      }
    }
    if (cleanData.profile_id) {
      if (!tenantId) {
        res.status(403).json({
          error: 'INVALID_TENANT',
          message: 'Empresa necessária para associar perfil ao cliente.',
        });
        return;
      }
      const profileOk = await userProfileBelongsToTenant(cleanData.profile_id, tenantId);
      if (!profileOk) {
        res.status(400).json({
          error: 'INVALID_PROFILE_FOR_TENANT',
          message: 'Perfil inexistente ou não pertence à empresa.',
        });
        return;
      }
    }

    const result = await pool.query(
      `INSERT INTO clients (
        user_id, name, email, phone, company, status, source,
        funnel_stage, notes, group_id, profile_id, cpf_cnpj
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        userId, cleanData.name, cleanData.email, cleanData.phone,
        cleanData.company, cleanData.status, cleanData.source,
        cleanData.funnel_stage, cleanData.notes, cleanData.group_id,
        cleanData.profile_id, cleanData.cpf_cnpj
      ]
    );

    // Get group information if group_id exists
    let client = result.rows[0];
    if (client.group_id) {
      const groupResult = await pool.query(
        'SELECT id, name FROM client_groups WHERE id = $1',
        [client.group_id]
      );
      if (groupResult.rows.length > 0) {
        client.client_groups = {
          id: groupResult.rows[0].id,
          name: groupResult.rows[0].name
        };
      }
    } else {
      client.client_groups = null;
    }

    res.status(201).json(client);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error creating client:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateClient(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const existing = await pool.query(
      `SELECT c.user_id FROM clients c
       INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE c.id = $1`,
      [id, userId]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    await assertModulePermission(userId, MODULE_CLIENTS, 'edit', {
      ownerId: existing.rows[0].user_id,
    }, req);
    const clientData = clientSchema.partial().parse(req.body);

    if (clientData.cpf_cnpj !== undefined) {
      const normalizedCpfCnpj = normalizeCpfCnpj(clientData.cpf_cnpj);
      if (normalizedCpfCnpj !== null && !isValidCpfCnpjLength(normalizedCpfCnpj)) {
        res.status(400).json({ error: 'CPF/CNPJ deve ter 11 (CPF) ou 14 (CNPJ) dígitos.' });
        return;
      }
    }

    const tenantIdForRefs = req.tenantId ?? null;
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (clientData.group_id !== undefined && clientData.group_id !== null) {
      const g =
        typeof clientData.group_id === 'string' && clientData.group_id.trim()
          ? clientData.group_id.trim()
          : '';
      if (g && !uuidRegex.test(g)) {
        res.status(400).json({ error: 'Invalid group_id format' });
        return;
      }
      if (g) {
        if (!tenantIdForRefs) {
          res.status(403).json({
            error: 'INVALID_TENANT',
            message: 'Empresa necessária para associar grupo ao cliente.',
          });
          return;
        }
        const groupOk = await clientGroupBelongsToTenant(g, tenantIdForRefs);
        if (!groupOk) {
          res.status(400).json({
            error: 'INVALID_GROUP_FOR_TENANT',
            message: 'Grupo inexistente ou não pertence à empresa.',
          });
          return;
        }
      }
    }

    if (clientData.profile_id !== undefined && clientData.profile_id !== null) {
      const p =
        typeof clientData.profile_id === 'string' && clientData.profile_id.trim()
          ? clientData.profile_id.trim()
          : '';
      if (p && !uuidRegex.test(p)) {
        res.status(400).json({ error: 'Invalid profile_id format' });
        return;
      }
      if (p) {
        if (!tenantIdForRefs) {
          res.status(403).json({
            error: 'INVALID_TENANT',
            message: 'Empresa necessária para associar perfil ao cliente.',
          });
          return;
        }
        const profileOk = await userProfileBelongsToTenant(p, tenantIdForRefs);
        if (!profileOk) {
          res.status(400).json({
            error: 'INVALID_PROFILE_FOR_TENANT',
            message: 'Perfil inexistente ou não pertence à empresa.',
          });
          return;
        }
      }
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(clientData).forEach(([key, value]) => {
      if (value !== undefined) {
        let normalized: unknown = value;
        if (key === 'cpf_cnpj') {
          normalized = normalizeCpfCnpj(value as string);
          if (normalized === null && (value === '' || (typeof value === 'string' && !(value as string).trim()))) {
            normalized = null;
          }
        }
        updates.push(`${key} = $${paramIndex}`);
        values.push(normalized);
        paramIndex++;
      }
    });

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE clients 
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramIndex}
         AND user_id IN (SELECT id FROM users WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = $${paramIndex + 1}))
       RETURNING *`,
      [...values, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error updating client:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteClient(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const existing = await pool.query(
      `SELECT c.user_id FROM clients c
       INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE c.id = $1`,
      [id, userId]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    await assertModulePermission(userId, MODULE_CLIENTS, 'delete', {
      ownerId: existing.rows[0].user_id,
    }, req);
    const result = await pool.query(
      `DELETE FROM clients WHERE id = $1
       AND user_id IN (SELECT id FROM users WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = $2))
       RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    res.json({ message: 'Client deleted successfully' });
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Error deleting client:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Client Tasks endpoints
const clientTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
});

export async function getClientTasks(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const ok = await clientBelongsToTenant(id, req.tenantId ?? null);
    if (!ok) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const result = await pool.query(
      'SELECT * FROM client_tasks WHERE client_id = $1 ORDER BY created_at DESC',
      [id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching client tasks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createClientTask(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const taskData = clientTaskSchema.parse(req.body);
    const { client_id } = req.body;

    if (!client_id) {
      res.status(400).json({ error: 'client_id is required' });
      return;
    }

    const ok = await clientBelongsToTenant(client_id, req.tenantId ?? null);
    if (!ok) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const dueDate = taskData.due_date ? new Date(taskData.due_date) : null;

    const result = await pool.query(
      `INSERT INTO client_tasks (user_id, client_id, title, description, status, due_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        userId,
        client_id,
        taskData.title,
        taskData.description || null,
        taskData.status || 'Pendente',
        dueDate,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error creating client task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateClientTask(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const taskData = clientTaskSchema.partial().parse(req.body);

    const taskRow = await pool.query<{ client_id: string; user_id: string }>(
      'SELECT client_id, user_id FROM client_tasks WHERE id = $1',
      [id]
    );
    if (taskRow.rows.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const ok = await clientBelongsToTenant(taskRow.rows[0].client_id, req.tenantId ?? null);
    if (!ok) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (taskData.title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(taskData.title);
    }
    if (taskData.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(taskData.description || null);
    }
    if (taskData.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(taskData.status || null);
    }
    if (taskData.due_date !== undefined) {
      updates.push(`due_date = $${paramIndex++}`);
      values.push(taskData.due_date ? new Date(taskData.due_date) : null);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE client_tasks
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramIndex}
         AND client_id IN (SELECT c.id FROM clients c INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $${paramIndex + 1}))
       RETURNING *`,
      [...values, userId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error updating client task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteClientTask(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const taskRow = await pool.query<{ client_id: string }>('SELECT client_id FROM client_tasks WHERE id = $1', [id]);
    if (taskRow.rows.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const ok = await clientBelongsToTenant(taskRow.rows[0].client_id, req.tenantId ?? null);
    if (!ok) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const result = await pool.query(
      `DELETE FROM client_tasks WHERE id = $1
       AND client_id IN (SELECT c.id FROM clients c INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2))
       RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting client task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

