import { Response } from 'express';
import { pool, withTenantRlsContext } from '../utils/db.js';
import { insertActivePublicViewTokenRow } from '../services/contractPublicViewService.js';
import { bootstrapSignatureInvitesForContract } from '../services/contractInviteBootstrapService.js';
import { AuthRequest } from '../middleware/auth.js';
import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';
import {
  CONTRACT_DELETE_ALLOWED_STATUSES,
  canDeleteContractStatus,
  canTransitionStatus,
  hasMeaningfulDocumentHtml,
  isDocumentFrozen,
  isDraftStatus,
  statusFreezesDocument,
} from '../services/contractLifecycle.js';
import { computeCreationTenancyDates } from '../services/contractTenancyService.js';
import { applyContractMergeFieldsToHtml } from '../utils/contractMergeFields.js';
import { loadContractMergeEnrichment } from '../services/contractMergeContextLoader.js';
import { z } from 'zod';

const contractSchema = z.object({
  title: z.string().min(1),
  client_id: z.string().uuid().optional().nullable(),
  responsible_id: z.string().uuid().optional().nullable(),
  status: z.enum(['DRAFT', 'PENDING_SIGNATURE', 'PARTIALLY_SIGNED', 'ACTIVE', 'INACTIVE', 'EXPIRED', 'CANCELLED']).optional(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  content: z.string().optional().nullable(),
  content_html: z.string().optional().nullable(),
  template_id: z.string().uuid().optional().nullable(),
  variables: z.any().optional(),
  auto_renew: z.boolean().optional(),
  renewal_period: z.number().int().optional().nullable(),
  total_value: z.number().optional().nullable(),
  currency: z.string().optional(),
  linked_proposal_id: z.string().uuid().optional().nullable(),
  linked_invoice_id: z.string().uuid().optional().nullable(),
  signature_settings: z.any().optional(),
});

/** Remove strings vazias em UUIDs opcionais — evita falha de parse Zod e garante persistência do vínculo quando o ID é válido. */
function normalizeContractPayload(body: unknown): unknown {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) return body;
  const o = { ...(body as Record<string, unknown>) };
  for (const key of [
    'client_id',
    'responsible_id',
    'template_id',
    'linked_proposal_id',
    'linked_invoice_id',
  ] as const) {
    const v = o[key];
    if (v === '' || (typeof v === 'string' && v.trim() === '')) {
      delete o[key];
    }
  }
  return o;
}

function formatContractRow(contract: Record<string, unknown>) {
  const tenancy_rules =
    typeof contract.tenancy_rules === 'object' && contract.tenancy_rules !== null
      ? contract.tenancy_rules
      : contract.tenancy_rules
        ? JSON.parse(String(contract.tenancy_rules))
        : null;
  const responsibleName = typeof contract.responsible_name === 'string' ? contract.responsible_name.trim() : '';
  const responsibleEmail = typeof contract.responsible_email === 'string' ? contract.responsible_email.trim() : '';
  const creatorName = typeof contract.creator_name === 'string' ? contract.creator_name.trim() : '';
  const creatorEmail = typeof contract.creator_email === 'string' ? contract.creator_email.trim() : '';
  return {
    ...contract,
    total_value: contract.total_value ? parseFloat(String(contract.total_value)) : null,
    tenancy_rules,
    tags: Array.isArray(contract.tags) ? contract.tags : (contract.tags ? JSON.parse(String(contract.tags)) : []),
    variables:
      typeof contract.variables === 'object' && contract.variables !== null
        ? contract.variables
        : contract.variables
          ? JSON.parse(String(contract.variables))
          : {},
    signature_settings:
      typeof contract.signature_settings === 'object' && contract.signature_settings !== null
        ? contract.signature_settings
        : contract.signature_settings
          ? JSON.parse(String(contract.signature_settings))
          : {},
    client_name: typeof contract.client_name === 'string' ? contract.client_name : null,
    responsible_display_name: responsibleName || responsibleEmail || null,
    creator_display_name: creatorName || creatorEmail || null,
  };
}

// Get contracts with filters
export async function getContracts(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.json([]);
      return;
    }
    const { status, clientId, responsibleId, startDate, endDate, search, sortField, sortDirection } = req.query;

    let query = `SELECT c.*,
              cl.name AS client_name,
              NULLIF(trim(concat_ws(' ', rp.first_name, rp.last_name)), '') AS responsible_name,
              ru.email AS responsible_email,
              NULLIF(trim(concat_ws(' ', cp.first_name, cp.last_name)), '') AS creator_name,
              cu.email AS creator_email
       FROM contracts c
       INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1
       LEFT JOIN clients cl ON cl.id = c.client_id
       LEFT JOIN users ru ON ru.id = c.responsible_id
       LEFT JOIN profiles rp ON rp.id = ru.id
       LEFT JOIN users cu ON cu.id = c.user_id
       LEFT JOIN profiles cp ON cp.id = cu.id
       WHERE 1=1`;
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    if (status && status !== 'all') {
      query += ` AND c.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (clientId) {
      query += ` AND c.client_id = $${paramIndex}`;
      params.push(clientId);
      paramIndex++;
    }

    if (responsibleId) {
      query += ` AND c.responsible_id = $${paramIndex}`;
      params.push(responsibleId);
      paramIndex++;
    }

    if (startDate) {
      query += ` AND c.start_date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND c.end_date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    if (search) {
      query += ` AND (c.title ILIKE $${paramIndex} OR c.contract_number ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    const validSortFields = ['updated_at', 'title', 'contract_number', 'created_at', 'start_date', 'end_date'];
    const sortFieldValue = validSortFields.includes(sortField as string) ? sortField : 'updated_at';
    const sortDirectionValue = sortDirection === 'asc' ? 'ASC' : 'DESC';
    query += ` ORDER BY c.${sortFieldValue} ${sortDirectionValue}`;

    const result = await pool.query(query, params);

    const contracts = result.rows.map((contract) => formatContractRow(contract));

    res.json(contracts);
  } catch (error) {
    console.error('Error fetching contracts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Get contract by ID
export async function getContractById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT c.* FROM contracts c
       INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE c.id = $1`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Contract not found' });
      return;
    }

    const contract = result.rows[0];
    await assertModulePermission(
      userId,
      'contracts',
      'view',
      { ownerId: contract.user_id as string, assigneeId: (contract.responsible_id as string | null) ?? null },
      req
    );
    res.json(formatContractRow(contract));
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Error fetching contract:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Create contract
export async function createContract(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const contractData = contractSchema.parse(normalizeContractPayload(req.body));

    await assertModulePermission(userId, 'contracts', 'create', undefined, req);

    if (contractData.status != null && contractData.status !== 'DRAFT') {
      res.status(400).json({
        error:
          'Novos contratos devem ser criados como rascunho (DRAFT). Salve o rascunho, inclua signatários se necessário e altere o status em uma segunda etapa.',
        code: 'CONTRACT_CREATE_NON_DRAFT',
      });
      return;
    }

    const contractNumber = `CONTRACT-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let insertTitle = contractData.title;
      let insertHtml = (contractData.content_html || '').trim();
      let insertTotal: number | null = contractData.total_value ?? null;
      let insertCurrency =
        contractData.currency != null && String(contractData.currency).trim() !== ''
          ? String(contractData.currency).trim()
          : 'BRL';
      let insertStart: string | null = contractData.start_date ?? null;
      let insertEnd: string | null = contractData.end_date ?? null;
      let tenancyRulesSnapshot: unknown = null;

      if (contractData.template_id) {
        const tr = await client.query<{
          content_html: string;
          default_total_value: string | null;
          default_currency: string | null;
          tenancy_rules: unknown;
        }>(
          `SELECT ct.content_html, ct.default_total_value, ct.default_currency, ct.tenancy_rules
           FROM contract_templates ct
           INNER JOIN users u ON u.id = ct.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
           WHERE ct.id = $1`,
          [contractData.template_id, userId],
        );
        if (tr.rows.length > 0) {
          const t = tr.rows[0];
          tenancyRulesSnapshot = t.tenancy_rules ?? null;
          const tplHtml = String(t.content_html || '');
          if (!insertHtml || insertHtml === '<p></p>' || insertHtml === '<p><br></p>') {
            insertHtml = tplHtml;
          }
          if (insertTotal == null && t.default_total_value != null) {
            const x = parseFloat(String(t.default_total_value));
            insertTotal = Number.isFinite(x) ? x : null;
          }
          const dc = t.default_currency != null ? String(t.default_currency).trim() : '';
          if (dc && (contractData.currency == null || String(contractData.currency).trim() === '')) {
            insertCurrency = dc;
          }
        }
      }

      const manualAnyDate =
        (insertStart != null && String(insertStart).trim() !== '') ||
        (insertEnd != null && String(insertEnd).trim() !== '');

      if (!manualAnyDate && tenancyRulesSnapshot) {
        const d = computeCreationTenancyDates(tenancyRulesSnapshot, new Date());
        if (d) {
          insertStart = d.start;
          insertEnd = d.end;
        }
      }

      const result = await client.query(
        `INSERT INTO contracts (
        user_id, contract_number, title, client_id, responsible_id, status,
        start_date, end_date, tags, content, content_html, template_id,
        variables, auto_renew, renewal_period, total_value, currency,
        linked_proposal_id, linked_invoice_id, signature_settings,
        tenancy_rules,
        content_snapshot_html, document_frozen_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      RETURNING *`,
        [
          userId,
          contractNumber,
          insertTitle,
          contractData.client_id || null,
          contractData.responsible_id || null,
          'DRAFT',
          insertStart,
          insertEnd,
          contractData.tags ? JSON.stringify(contractData.tags) : '[]',
          contractData.content || null,
          insertHtml || null,
          contractData.template_id || null,
          contractData.variables ? JSON.stringify(contractData.variables) : '{}',
          contractData.auto_renew || false,
          contractData.renewal_period || null,
          insertTotal,
          insertCurrency,
          contractData.linked_proposal_id || null,
          contractData.linked_invoice_id || null,
          contractData.signature_settings ? JSON.stringify(contractData.signature_settings) : '{}',
          tenancyRulesSnapshot != null ? JSON.stringify(tenancyRulesSnapshot) : null,
          null,
          null,
        ]
      );

      const created = result.rows[0] as Record<string, unknown>;
      const newId = String(created.id);
      const pv = await insertActivePublicViewTokenRow(client, newId);

      await client.query(
        `INSERT INTO contract_events (contract_id, event_type, description, metadata, created_by)
         VALUES ($1, 'PUBLIC_VIEW_LINK_ISSUED', $2, $3::jsonb, $4)`,
        [
          newId,
          'Link público de visualização criado automaticamente na criação do contrato.',
          JSON.stringify({
            auto_provision: true,
            action: 'AUTO_CREATE',
            expires_at: pv.expires_at,
          }),
          userId,
        ]
      );

      await client.query('COMMIT');

      const base = formatContractRow(created);
      const fe = String(process.env.FRONTEND_URL || '').trim().replace(/\/$/, '');
      const path = `/contract-view/${pv.raw_token}`;
      res.status(201).json({
        ...base,
        public_view: {
          token: pv.raw_token,
          frontend_path: path,
          public_view_url: fe ? `${fe}${path}` : null,
          created_at: pv.created_at,
          expires_at: pv.expires_at,
        },
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error creating contract:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Update contract
export async function updateContract(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const contractData = contractSchema.partial().parse(normalizeContractPayload(req.body));

    const existingResult = await pool.query(
      `SELECT c.* FROM contracts c
       INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE c.id = $1`,
      [id, userId]
    );
    if (existingResult.rows.length === 0) {
      res.status(404).json({ error: 'Contract not found' });
      return;
    }
    const row = existingResult.rows[0] as Record<string, unknown>;
    const rowStatus = String(row.status);

    await assertModulePermission(userId, 'contracts', 'edit', {
      ownerId: row.user_id as string,
      assigneeId: (row.responsible_id as string | null) ?? null,
    }, req);

    const incomingKeys = Object.entries(contractData).filter(([, v]) => v !== undefined).map(([k]) => k);

    if (isDocumentFrozen(rowStatus)) {
      const forbidden = incomingKeys.filter((k) => k !== 'status' && k !== 'tags');
      if (forbidden.length > 0) {
        res.status(409).json({
          error:
            'Contrato congelado: não é possível alterar o documento, modelo, partes ou dados estruturais. Apenas status e tags podem ser atualizados.',
          code: 'CONTRACT_FROZEN',
        });
        return;
      }
      if (contractData.status !== undefined && contractData.status !== rowStatus) {
        if (!canTransitionStatus(rowStatus, contractData.status)) {
          res.status(400).json({ error: 'Transição de status não permitida.', code: 'CONTRACT_INVALID_STATUS' });
          return;
        }
      }
    } else {
      const mergedStatus = contractData.status !== undefined ? contractData.status : rowStatus;
      if (contractData.status !== undefined && contractData.status !== rowStatus) {
        if (!canTransitionStatus(rowStatus, contractData.status)) {
          res.status(400).json({ error: 'Transição de status não permitida.', code: 'CONTRACT_INVALID_STATUS' });
          return;
        }
      }

      const mergedTitle =
        contractData.title !== undefined ? contractData.title : (row.title as string);
      const mergedContentHtml =
        contractData.content_html !== undefined
          ? contractData.content_html
          : (row.content_html as string | null);

      const willFreezeSnapshot =
        isDraftStatus(rowStatus) && mergedStatus !== 'DRAFT' && statusFreezesDocument(mergedStatus);

      if (willFreezeSnapshot) {
        if (!mergedTitle?.trim()) {
          res.status(400).json({ error: 'Título obrigatório para enviar ou ativar o contrato.', code: 'CONTRACT_TITLE_REQUIRED' });
          return;
        }
        if (!hasMeaningfulDocumentHtml(mergedContentHtml)) {
          res.status(400).json({
            error: 'Conteúdo do contrato é obrigatório e deve ter texto antes de enviar ou ativar.',
            code: 'CONTRACT_BODY_REQUIRED',
          });
          return;
        }
        if (mergedStatus === 'PENDING_SIGNATURE') {
          const cr = await pool.query(`SELECT COUNT(*)::int AS n FROM contract_signers WHERE contract_id = $1`, [id]);
          if ((cr.rows[0]?.n ?? 0) < 1) {
            res.status(400).json({
              error: 'Inclua pelo menos um signatário antes de enviar para assinatura.',
              code: 'CONTRACT_SIGNERS_REQUIRED',
            });
            return;
          }
        }
      }
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    Object.entries(contractData).forEach(([key, value]) => {
      if (value === undefined) return;
      if (isDocumentFrozen(rowStatus) && key !== 'status' && key !== 'tags') return;

      if (key === 'tags' || key === 'variables' || key === 'signature_settings') {
        updates.push(`${key} = $${paramIndex}`);
        values.push(JSON.stringify(value));
      } else {
        updates.push(`${key} = $${paramIndex}`);
        values.push(value);
      }
      paramIndex++;
    });

    const mergedStatusForFreeze =
      contractData.status !== undefined ? contractData.status : rowStatus;
    const mergedContentForFreeze =
      contractData.content_html !== undefined
        ? contractData.content_html
        : (row.content_html as string | null);

    const willFreezeSnapshot =
      isDraftStatus(rowStatus) &&
      mergedStatusForFreeze !== 'DRAFT' &&
      statusFreezesDocument(mergedStatusForFreeze);

    if (willFreezeSnapshot) {
      const mergedTitleFreeze =
        contractData.title !== undefined ? contractData.title : (row.title as string);
      const mergedTotalFreeze =
        contractData.total_value !== undefined
          ? contractData.total_value
          : row.total_value != null
            ? parseFloat(String(row.total_value))
            : null;
      const mergedCurrencyFreeze =
        contractData.currency !== undefined ? contractData.currency : String(row.currency || 'BRL');
      const mergedStartFreeze =
        contractData.start_date !== undefined ? contractData.start_date : (row.start_date as string | null);
      const mergedEndFreeze =
        contractData.end_date !== undefined ? contractData.end_date : (row.end_date as string | null);
      let mergedVariablesFreeze: Record<string, unknown>;
      if (contractData.variables !== undefined) {
        mergedVariablesFreeze =
          typeof contractData.variables === 'object' && contractData.variables !== null
            ? (contractData.variables as Record<string, unknown>)
            : {};
      } else {
        mergedVariablesFreeze = formatContractRow(row).variables as Record<string, unknown>;
      }
      const enrichment = await loadContractMergeEnrichment(id, pool);
      const snapshotMergedHtml = applyContractMergeFieldsToHtml(mergedContentForFreeze || '', {
        title: mergedTitleFreeze,
        total_value: mergedTotalFreeze,
        currency: mergedCurrencyFreeze,
        start_date: mergedStartFreeze,
        end_date: mergedEndFreeze,
        variables: mergedVariablesFreeze,
        contract_number: row.contract_number as string,
        status: mergedStatusForFreeze,
        created_at: row.created_at as Date,
        updated_at: row.updated_at as Date,
        tenant: enrichment.tenant,
        client: enrichment.client,
        operator: enrichment.operator,
        signerPrimary: enrichment.signerPrimary,
      });
      updates.push(`content_snapshot_html = $${paramIndex}`);
      values.push(snapshotMergedHtml);
      paramIndex++;
      updates.push(`document_frozen_at = $${paramIndex}`);
      values.push(new Date());
      paramIndex++;
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    values.push(id, userId);
    const result = await pool.query(
      `UPDATE contracts
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramIndex} AND user_id IN (SELECT id FROM users WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = $${paramIndex + 1}))
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Contract not found' });
      return;
    }

    const updatedRow = result.rows[0];
    const updated = formatContractRow(updatedRow);
    const newStatusStr = String((updatedRow as Record<string, unknown>).status);

    let signature_invite_bootstrap: Awaited<ReturnType<typeof bootstrapSignatureInvitesForContract>> | undefined;
    if (isDraftStatus(rowStatus) && newStatusStr === 'PENDING_SIGNATURE') {
      try {
        signature_invite_bootstrap = await bootstrapSignatureInvitesForContract({
          contractId: id,
          requestUserId: userId,
          createdByUserId: userId,
          req,
          previousStatus: rowStatus,
          newStatus: newStatusStr,
        });
      } catch (e) {
        console.error('bootstrapSignatureInvitesForContract:', e);
      }
    }

    const becameCancelled =
      contractData.status === 'CANCELLED' && rowStatus !== 'CANCELLED';
    if (becameCancelled) {
      const tidRes = await pool.query<{ tenant_id: string }>(`SELECT tenant_id FROM users WHERE id = $1`, [userId]);
      const tenantId = tidRes.rows[0]?.tenant_id;
      if (tenantId) {
        try {
          await withTenantRlsContext(tenantId, async () => {
            await pool.query('BEGIN');
            try {
              await pool.query(
                `UPDATE contract_public_view_tokens SET revoked_at = now()
                 WHERE contract_id = $1 AND revoked_at IS NULL`,
                [id]
              );
              await pool.query(
                `UPDATE contract_signer_signature_invites i SET revoked_at = now()
                 FROM contract_signers cs
                 WHERE cs.contract_id = $1 AND cs.id = i.contract_signer_id
                   AND i.revoked_at IS NULL AND i.consumed_at IS NULL`,
                [id]
              );
              await pool.query(
                `INSERT INTO contract_events (contract_id, event_type, description, metadata, created_by)
                 VALUES ($1, 'CONTRACT_ACCESS_TOKENS_REVOKED', $2, $3::jsonb, $4)`,
                [
                  id,
                  'Links públicos de visualização e convites de assinatura pendentes foram revogados automaticamente (contrato cancelado).',
                  JSON.stringify({ reason: 'contract_cancelled' }),
                  userId,
                ]
              );
              await pool.query('COMMIT');
            } catch (e) {
              await pool.query('ROLLBACK');
              throw e;
            }
          });
        } catch (e) {
          console.error('updateContract: revoke public tokens on cancel failed', e);
        }
      }
    }

    const responseBody =
      signature_invite_bootstrap && signature_invite_bootstrap.length > 0
        ? { ...updated, signature_invite_bootstrap }
        : updated;
    res.json(responseBody);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error updating contract:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Delete contract
export async function deleteContract(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const existing = await pool.query<{ user_id: string; responsible_id: string | null; status: string }>(
      `SELECT user_id, responsible_id, c.status::text AS status FROM contracts c
       INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE c.id = $1`,
      [id, userId]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Contract not found' });
      return;
    }
    const row = existing.rows[0];
    await assertModulePermission(userId, 'contracts', 'delete', {
      ownerId: row.user_id,
      assigneeId: row.responsible_id,
    }, req);

    if (!canDeleteContractStatus(row.status)) {
      res.status(409).json({
        error: `Contrato no estado ${row.status} não pode ser excluído.`,
        code: 'CONTRACT_DELETE_STATUS_NOT_ALLOWED',
        allowed_statuses: Array.from(CONTRACT_DELETE_ALLOWED_STATUSES),
        current_status: row.status,
      });
      return;
    }

    const result = await pool.query(
      `DELETE FROM contracts WHERE id = $1 AND user_id IN (SELECT id FROM users WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = $2)) RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Contract not found' });
      return;
    }

    res.json({ message: 'Contract deleted successfully' });
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Error deleting contract:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
