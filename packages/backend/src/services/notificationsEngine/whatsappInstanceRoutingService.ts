/**
 * WR1+/WR2: roteamento tenant → chat_instance por finalidade (invoice / module).
 */
import type { Pool } from 'pg';
import {
  CHAT_INSTANCE_OPERABLE_STATUS_SQL,
  isChatInstanceStatusOperable,
} from '../chatInstanceOperableStatus.js';

export type RoutedWhatsAppInstance = {
  chat_instance_id: string;
  sender_user_id: string;
  status: string;
  routing_source: 'explicit';
  purpose: 'invoice' | 'module';
  module_key: string | null;
};

/** Módulos do catálogo com UI de tick (faturas usam purpose=invoice, não este set). */
export const INVOICE_CATALOG_MODULE = 'invoices';

const MODULE_LABELS_PT: Record<string, string> = {
  agenda: 'Agenda',
  proposals: 'Propostas',
  contracts: 'Contratos',
};

export function moduleKeyLabelPt(moduleKey: string): string {
  return MODULE_LABELS_PT[moduleKey] ?? moduleKey;
}

export async function listRoutableNotificationModules(
  pool: Pool,
): Promise<{ module_key: string; label: string }[]> {
  const r = await pool.query<{ module_key: string }>(
    `SELECT DISTINCT module AS module_key
     FROM notification_event_catalog
     WHERE is_active = true
       AND module IS NOT NULL
       AND trim(module) <> ''
       AND module <> $1
     ORDER BY module`,
    [INVOICE_CATALOG_MODULE],
  );
  return r.rows.map((row) => ({
    module_key: row.module_key,
    label: moduleKeyLabelPt(row.module_key),
  }));
}

export async function getInvoiceRoutedInstanceId(
  pool: Pool,
  tenantId: string,
): Promise<string | null> {
  const r = await pool.query<{ chat_instance_id: string }>(
    `SELECT chat_instance_id::text AS chat_instance_id
     FROM tenant_whatsapp_instance_routing
     WHERE tenant_id = $1 AND purpose = 'invoice'
     LIMIT 1`,
    [tenantId],
  );
  return r.rows[0]?.chat_instance_id ?? null;
}

export async function instanceIsRoutedForInvoice(
  pool: Pool,
  tenantId: string,
  chatInstanceId: string,
): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1
     FROM tenant_whatsapp_instance_routing
     WHERE tenant_id = $1 AND purpose = 'invoice' AND chat_instance_id = $2
     LIMIT 1`,
    [tenantId, chatInstanceId],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function listModuleRoutingsForInstance(
  pool: Pool,
  tenantId: string,
  chatInstanceId: string,
): Promise<{ module_key: string; label: string; enabled: boolean; routed_instance_id: string | null }[]> {
  const modules = await listRoutableNotificationModules(pool);
  const routes = await pool.query<{ module_key: string; chat_instance_id: string }>(
    `SELECT module_key, chat_instance_id::text AS chat_instance_id
     FROM tenant_whatsapp_instance_routing
     WHERE tenant_id = $1 AND purpose = 'module' AND module_key IS NOT NULL`,
    [tenantId],
  );
  const byModule = new Map(routes.rows.map((row) => [row.module_key, row.chat_instance_id]));
  return modules.map((m) => {
    const routed = byModule.get(m.module_key) ?? null;
    return {
      module_key: m.module_key,
      label: m.label,
      enabled: routed === chatInstanceId,
      routed_instance_id: routed,
    };
  });
}

async function resolveRoutedRow(
  pool: Pool,
  tenantId: string,
  purpose: 'invoice' | 'module',
  moduleKey: string | null,
): Promise<RoutedWhatsAppInstance | null> {
  const operable = await pool.query<{
    chat_instance_id: string;
    sender_user_id: string;
    status: string;
  }>(
    `SELECT i.id::text AS chat_instance_id,
            i.user_id::text AS sender_user_id,
            i.status
     FROM tenant_whatsapp_instance_routing r
     INNER JOIN chat_instances i ON i.id = r.chat_instance_id
     INNER JOIN users u ON u.id = i.user_id AND u.tenant_id = r.tenant_id
     WHERE r.tenant_id = $1
       AND r.purpose = $2
       AND (
         ($2 = 'invoice' AND r.module_key IS NULL)
         OR ($2 = 'module' AND r.module_key = $3)
       )
       AND ${CHAT_INSTANCE_OPERABLE_STATUS_SQL}
     LIMIT 1`,
    [tenantId, purpose, moduleKey],
  );
  if (operable.rows[0]) {
    return {
      ...operable.rows[0],
      routing_source: 'explicit',
      purpose,
      module_key: moduleKey,
    };
  }

  const any = await pool.query<{
    chat_instance_id: string;
    sender_user_id: string;
    status: string;
  }>(
    `SELECT i.id::text AS chat_instance_id,
            i.user_id::text AS sender_user_id,
            i.status
     FROM tenant_whatsapp_instance_routing r
     INNER JOIN chat_instances i ON i.id = r.chat_instance_id
     INNER JOIN users u ON u.id = i.user_id AND u.tenant_id = r.tenant_id
     WHERE r.tenant_id = $1
       AND r.purpose = $2
       AND (
         ($2 = 'invoice' AND r.module_key IS NULL)
         OR ($2 = 'module' AND r.module_key = $3)
       )
     LIMIT 1`,
    [tenantId, purpose, moduleKey],
  );
  if (!any.rows[0]) return null;
  return {
    ...any.rows[0],
    routing_source: 'explicit',
    purpose,
    module_key: moduleKey,
  };
}

export async function resolveInvoiceRoutedWhatsAppInstance(
  pool: Pool,
  tenantId: string,
): Promise<RoutedWhatsAppInstance | null> {
  return resolveRoutedRow(pool, tenantId, 'invoice', null);
}

export async function resolveModuleRoutedWhatsAppInstance(
  pool: Pool,
  tenantId: string,
  moduleKey: string,
): Promise<RoutedWhatsAppInstance | null> {
  const key = String(moduleKey || '').trim();
  if (!key || key === INVOICE_CATALOG_MODULE) return null;
  return resolveRoutedRow(pool, tenantId, 'module', key);
}

/**
 * Resolve routing para um event_key: invoice.* / module=invoices → purpose invoice;
 * demais módulos do catálogo → purpose module.
 */
export async function resolveWhatsAppRoutingForEventKey(
  pool: Pool,
  tenantId: string,
  eventKey: string,
): Promise<RoutedWhatsAppInstance | null> {
  if (String(eventKey || '').startsWith('invoice.')) {
    return resolveInvoiceRoutedWhatsAppInstance(pool, tenantId);
  }
  const ev = await pool.query<{ module: string | null }>(
    `SELECT module FROM notification_event_catalog WHERE event_key = $1 LIMIT 1`,
    [eventKey],
  );
  const mod = ev.rows[0]?.module?.trim() || null;
  if (!mod) return null;
  if (mod === INVOICE_CATALOG_MODULE) {
    return resolveInvoiceRoutedWhatsAppInstance(pool, tenantId);
  }
  return resolveModuleRoutedWhatsAppInstance(pool, tenantId, mod);
}

async function assertInstanceOwnedByTenant(
  pool: Pool,
  tenantId: string,
  chatInstanceId: string,
): Promise<void> {
  const owned = await pool.query(
    `SELECT 1
     FROM chat_instances i
     INNER JOIN users u ON u.id = i.user_id
     WHERE i.id = $1 AND u.tenant_id = $2
     LIMIT 1`,
    [chatInstanceId, tenantId],
  );
  if ((owned.rowCount ?? 0) === 0) {
    throw new Error('Instância WhatsApp não pertence a esta conta.');
  }
}

/** Define/remove esta instância como remetente de notificações de fatura (única por tenant). */
export async function setInstanceInvoiceRouting(params: {
  pool: Pool;
  tenantId: string;
  chatInstanceId: string;
  useForInvoice: boolean;
}): Promise<void> {
  const { pool, tenantId, chatInstanceId, useForInvoice } = params;
  await assertInstanceOwnedByTenant(pool, tenantId, chatInstanceId);

  if (!useForInvoice) {
    await pool.query(
      `DELETE FROM tenant_whatsapp_instance_routing
       WHERE tenant_id = $1 AND purpose = 'invoice' AND chat_instance_id = $2`,
      [tenantId, chatInstanceId],
    );
    return;
  }

  await pool.query(
    `DELETE FROM tenant_whatsapp_instance_routing
     WHERE tenant_id = $1 AND purpose = 'invoice'`,
    [tenantId],
  );
  await pool.query(
    `INSERT INTO tenant_whatsapp_instance_routing (tenant_id, purpose, module_key, chat_instance_id)
     VALUES ($1, 'invoice', NULL, $2)`,
    [tenantId, chatInstanceId],
  );
}

export async function setInstanceModuleRouting(params: {
  pool: Pool;
  tenantId: string;
  chatInstanceId: string;
  moduleKey: string;
  useForModule: boolean;
}): Promise<void> {
  const { pool, tenantId, chatInstanceId, useForModule } = params;
  const moduleKey = String(params.moduleKey || '').trim();
  if (!moduleKey || moduleKey === INVOICE_CATALOG_MODULE) {
    throw new Error('Módulo inválido para roteamento.');
  }
  await assertInstanceOwnedByTenant(pool, tenantId, chatInstanceId);

  const known = await pool.query(
    `SELECT 1 FROM notification_event_catalog
     WHERE is_active = true AND module = $1
     LIMIT 1`,
    [moduleKey],
  );
  if ((known.rowCount ?? 0) === 0) {
    throw new Error(`Módulo "${moduleKey}" não existe no catálogo de notificações.`);
  }

  if (!useForModule) {
    await pool.query(
      `DELETE FROM tenant_whatsapp_instance_routing
       WHERE tenant_id = $1 AND purpose = 'module' AND module_key = $2 AND chat_instance_id = $3`,
      [tenantId, moduleKey, chatInstanceId],
    );
    return;
  }

  await pool.query(
    `DELETE FROM tenant_whatsapp_instance_routing
     WHERE tenant_id = $1 AND purpose = 'module' AND module_key = $2`,
    [tenantId, moduleKey],
  );
  await pool.query(
    `INSERT INTO tenant_whatsapp_instance_routing (tenant_id, purpose, module_key, chat_instance_id)
     VALUES ($1, 'module', $2, $3)`,
    [tenantId, moduleKey, chatInstanceId],
  );
}

/** Resumo de chips por instância (lista / card). */
export async function listPurposeBadgesByInstance(
  pool: Pool,
  tenantId: string,
): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};

  const routes = await pool.query<{
    chat_instance_id: string;
    purpose: string;
    module_key: string | null;
  }>(
    `SELECT chat_instance_id::text AS chat_instance_id, purpose, module_key
     FROM tenant_whatsapp_instance_routing
     WHERE tenant_id = $1`,
    [tenantId],
  );
  for (const row of routes.rows) {
    const chips = out[row.chat_instance_id] ?? (out[row.chat_instance_id] = []);
    if (row.purpose === 'invoice') chips.push('Faturas');
    else if (row.purpose === 'module' && row.module_key) {
      chips.push(moduleKeyLabelPt(row.module_key));
    }
  }

  const chatEnabled = await pool.query<{ id: string }>(
    `SELECT i.id::text AS id
     FROM chat_instances i
     INNER JOIN users u ON u.id = i.user_id
     WHERE u.tenant_id = $1
       AND COALESCE(i.metadata->>'enabled_in_chat', 'true') <> 'false'`,
    [tenantId],
  );
  for (const row of chatEnabled.rows) {
    const chips = out[row.id] ?? (out[row.id] = []);
    if (!chips.includes('Chat')) chips.unshift('Chat');
  }

  return out;
}

export type SeedDefaultPurposeRoutingResult = {
  seeded: boolean;
  reason:
    | 'seeded'
    | 'already_configured'
    | 'not_sole_operable'
    | 'instance_not_operable'
    | 'not_owned';
  invoice?: boolean;
  modules?: string[];
};

async function tenantHasAnyPurposeRouting(pool: Pool, tenantId: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM tenant_whatsapp_instance_routing WHERE tenant_id = $1 LIMIT 1`,
    [tenantId],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * WR4: se o tenant ainda não configurou routing e esta é a única instância operable,
 * assume fatura + todos os módulos (Chat já nasce enabled). Não sobrescreve escolha prévia.
 */
export async function maybeSeedDefaultPurposeRouting(params: {
  pool: Pool;
  tenantId: string;
  chatInstanceId: string;
}): Promise<SeedDefaultPurposeRoutingResult> {
  const { pool, tenantId, chatInstanceId } = params;

  const owned = await pool.query<{ status: string }>(
    `SELECT i.status
     FROM chat_instances i
     INNER JOIN users u ON u.id = i.user_id
     WHERE i.id = $1 AND u.tenant_id = $2
     LIMIT 1`,
    [chatInstanceId, tenantId],
  );
  if (!owned.rows[0]) {
    return { seeded: false, reason: 'not_owned' };
  }
  if (!isChatInstanceStatusOperable(owned.rows[0].status)) {
    return { seeded: false, reason: 'instance_not_operable' };
  }

  if (await tenantHasAnyPurposeRouting(pool, tenantId)) {
    return { seeded: false, reason: 'already_configured' };
  }

  const operable = await pool.query<{ id: string }>(
    `SELECT i.id::text AS id
     FROM chat_instances i
     INNER JOIN users u ON u.id = i.user_id
     WHERE u.tenant_id = $1 AND ${CHAT_INSTANCE_OPERABLE_STATUS_SQL}
     ORDER BY i.updated_at DESC NULLS LAST`,
    [tenantId],
  );
  if (operable.rows.length !== 1 || operable.rows[0].id !== chatInstanceId) {
    return { seeded: false, reason: 'not_sole_operable' };
  }

  await setInstanceInvoiceRouting({
    pool,
    tenantId,
    chatInstanceId,
    useForInvoice: true,
  });

  const modules = await listRoutableNotificationModules(pool);
  const seededModules: string[] = [];
  for (const m of modules) {
    await setInstanceModuleRouting({
      pool,
      tenantId,
      chatInstanceId,
      moduleKey: m.module_key,
      useForModule: true,
    });
    seededModules.push(m.module_key);
  }

  await pool.query(
    `UPDATE chat_instances
     SET metadata = jsonb_set(
       COALESCE(metadata, '{}'::jsonb),
       '{enabled_in_chat}',
       'true'::jsonb,
       true
     ),
     updated_at = now()
     WHERE id = $1`,
    [chatInstanceId],
  );

  return {
    seeded: true,
    reason: 'seeded',
    invoice: true,
    modules: seededModules,
  };
}

/**
 * Backfill: se não há routing e existe exatamente uma operable, seed nela.
 * Usado em listagem / GET purpose-routing sem exigir reconnect.
 */
export async function maybeSeedSoleOperableInstanceRouting(
  pool: Pool,
  tenantId: string,
): Promise<SeedDefaultPurposeRoutingResult & { chat_instance_id?: string }> {
  if (await tenantHasAnyPurposeRouting(pool, tenantId)) {
    return { seeded: false, reason: 'already_configured' };
  }
  const operable = await pool.query<{ id: string }>(
    `SELECT i.id::text AS id
     FROM chat_instances i
     INNER JOIN users u ON u.id = i.user_id
     WHERE u.tenant_id = $1 AND ${CHAT_INSTANCE_OPERABLE_STATUS_SQL}
     ORDER BY i.updated_at DESC NULLS LAST
     LIMIT 2`,
    [tenantId],
  );
  if (operable.rows.length !== 1) {
    return { seeded: false, reason: 'not_sole_operable' };
  }
  const chatInstanceId = operable.rows[0].id;
  const result = await maybeSeedDefaultPurposeRouting({ pool, tenantId, chatInstanceId });
  return { ...result, chat_instance_id: chatInstanceId };
}

