/**
 * OS-S1 — HTTP handlers para Ordens de Serviço.
 */
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { requireTenantId } from '../middleware/auth.js';
import { assertModulePermission, assertPermissionKey, ModulePermissionError } from '../permissions/index.js';
import { getEffectiveModulePermissions } from '../services/modulePermissionsService.js';
import { convertSignedServiceOrderToInvoice } from '../services/serviceOrderInvoiceConversionService.js';
import { PreconditionFailedError } from '../services/customerInvoicePreconditions.js';
import {
  getServiceOrderAppointmentSummary,
  rescheduleServiceOrderVisit,
  scheduleServiceOrderVisit,
} from '../services/serviceOrderVisitService.js';
import {
  SERVICE_ORDER_STATUSES,
  ServiceOrderDomainError,
  createServiceOrder,
  deleteServiceOrder,
  getServiceOrderById,
  listServiceOrders,
  updateServiceOrder,
  type ServiceOrderStatus,
} from '../services/serviceOrdersService.js';
import {
  buildServiceOrderPdfBuffer,
  buildServiceOrderDocumentForPreview,
  persistServiceOrderDocumentHtml,
} from '../services/serviceOrderPdfService.js';
import {
  getActivePublicViewTokenMeta,
  listServiceOrderSigners,
  reissueSignerInvite,
  revokeServiceOrderPublicLinks,
  sendServiceOrderForSignature,
  updateServiceOrderSignerName,
} from '../services/serviceOrderSignatureService.js';

const MODULE = 'service_orders' as const;

const itemSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(['service', 'product']),
  product_id: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(500),
  description: z.string().max(5000).optional().nullable(),
  unit: z.string().max(32).optional().nullable(),
  quantity: z.number().positive(),
  unit_price_cents: z.number().int().min(0),
  discount_cents: z.number().int().min(0).optional().default(0),
  sort_order: z.number().int().optional(),
});

const equipmentItemSchema = z
  .object({
    name: z.string().max(500).optional().nullable(),
    brand: z.string().max(200).optional().nullable(),
    model: z.string().max(200).optional().nullable(),
    serial: z.string().max(200).optional().nullable(),
    defects: z.string().max(5000).optional().nullable(),
  })
  .passthrough();

/** 1 equipamento (legado) ou lista (até 20). */
const equipmentSchema = z
  .union([equipmentItemSchema, z.array(equipmentItemSchema).max(20)])
  .nullable()
  .optional();

const createBody = z.object({
  client_id: z.string().uuid().optional().nullable(),
  responsible_user_id: z.string().uuid().optional().nullable(),
  status: z.enum(['draft', 'scheduled', 'in_progress']).optional().default('draft'),
  client_snapshot: z.record(z.unknown()).optional(),
  execution_address: z.record(z.unknown()).optional(),
  period_start_at: z.string().datetime({ offset: true }).optional().nullable().or(z.string().min(1).optional().nullable()),
  period_end_at: z.string().datetime({ offset: true }).optional().nullable().or(z.string().min(1).optional().nullable()),
  equipment: equipmentSchema,
  observations: z.string().max(20000).optional().nullable(),
  billing_mode: z.enum(['none', 'manual', 'auto_on_sign']).optional().default('manual'),
  currency: z.string().min(3).max(3).optional().default('BRL'),
  items: z.array(itemSchema).max(200).optional().default([]),
});

const patchBody = z
  .object({
    client_id: z.string().uuid().optional().nullable(),
    responsible_user_id: z.string().uuid().optional().nullable(),
    status: z
      .enum([
        'draft',
        'scheduled',
        'in_progress',
        'awaiting_signature',
        'signed',
        'invoiced',
        'completed',
        'cancelled',
      ])
      .optional(),
    client_snapshot: z.record(z.unknown()).optional(),
    execution_address: z.record(z.unknown()).optional(),
    period_start_at: z.string().optional().nullable(),
    period_end_at: z.string().optional().nullable(),
    equipment: equipmentSchema,
    observations: z.string().max(20000).optional().nullable(),
    billing_mode: z.enum(['none', 'manual', 'auto_on_sign']).optional(),
    currency: z.string().min(3).max(3).optional(),
    items: z.array(itemSchema).max(200).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Informe ao menos um campo' });

function respondError(res: Response, error: unknown): boolean {
  if (error instanceof ModulePermissionError) {
    res.status(error.statusCode).json({ error: error.message });
    return true;
  }
  if (error instanceof ServiceOrderDomainError) {
    res.status(error.statusCode).json({ error: error.message, code: error.code });
    return true;
  }
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: 'Validation error', details: error.errors });
    return true;
  }
  return false;
}

function firstQuery(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const s = value.find((v): v is string => typeof v === 'string');
    return s;
  }
  return undefined;
}

async function shouldListOwnOnly(userId: string): Promise<boolean> {
  const map = await getEffectiveModulePermissions(userId);
  const row = map.service_orders;
  if (!row || row.can_view !== true) return false;
  // Filtro own só quando module_extras.service_orders_view_own_only === true (S7).
  const ex = row.module_extras ?? {};
  return ex.service_orders_view_own_only === true;
}

export async function getServiceOrdersHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const userId = req.userId!;
    await assertModulePermission(userId, MODULE, 'view', undefined, req);

    const statusRaw = firstQuery(req.query.status);
    const status =
      statusRaw && (SERVICE_ORDER_STATUSES as readonly string[]).includes(statusRaw)
        ? (statusRaw as ServiceOrderStatus)
        : undefined;

    const onlyOwn = await shouldListOwnOnly(userId);
    const limit = Math.min(parseInt(firstQuery(req.query.limit) || '50', 10) || 50, 200);
    const offset = Math.max(parseInt(firstQuery(req.query.offset) || '0', 10) || 0, 0);

    const result = await listServiceOrders(tenantId, {
      status,
      client_id: firstQuery(req.query.client_id),
      responsible_user_id: firstQuery(req.query.responsible_user_id),
      created_by: firstQuery(req.query.created_by),
      q: firstQuery(req.query.q),
      limit,
      offset,
      onlyOwn,
      viewerUserId: userId,
    });

    res.json({ data: result.rows, total: result.total, limit, offset });
  } catch (error) {
    if (respondError(res, error)) return;
    console.error('[service-orders] list failed', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getServiceOrderByIdHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const userId = req.userId!;
    await assertModulePermission(userId, MODULE, 'view', undefined, req);

    const id = String(req.params.id || '');
    const row = await getServiceOrderById(tenantId, id);
    if (!row) {
      res.status(404).json({ error: 'Ordem de serviço não encontrada.' });
      return;
    }

    const onlyOwn = await shouldListOwnOnly(userId);
    if (onlyOwn && row.created_by !== userId) {
      res.status(403).json({ error: 'Sem permissão para visualizar esta ordem.' });
      return;
    }

    const [signers, public_view, appointment] = await Promise.all([
      listServiceOrderSigners(tenantId, id),
      getActivePublicViewTokenMeta(tenantId, id),
      getServiceOrderAppointmentSummary(tenantId, row.appointment_id),
    ]);
    res.json({ ...row, signers, public_view, appointment });
  } catch (error) {
    if (respondError(res, error)) return;
    console.error('[service-orders] get failed', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function postServiceOrderHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const userId = req.userId!;
    await assertModulePermission(userId, MODULE, 'create', undefined, req);

    const body = createBody.parse(req.body);
    const created = await createServiceOrder(tenantId, userId, body);
    res.status(201).json(created);
  } catch (error) {
    if (respondError(res, error)) return;
    console.error('[service-orders] create failed', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function patchServiceOrderHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const userId = req.userId!;
    const id = String(req.params.id || '');

    const existing = await getServiceOrderById(tenantId, id);
    if (!existing) {
      res.status(404).json({ error: 'Ordem de serviço não encontrada.' });
      return;
    }

    await assertModulePermission(
      userId,
      MODULE,
      'edit',
      { ownerId: existing.created_by, assigneeId: existing.responsible_user_id },
      req,
    );

    const body = patchBody.parse(req.body);
    if (body.status === 'cancelled') {
      await assertPermissionKey(userId, 'service_orders.cancel', req);
    }
    const updated = await updateServiceOrder(tenantId, userId, id, body);
    res.json(updated);
  } catch (error) {
    if (respondError(res, error)) return;
    console.error('[service-orders] patch failed', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteServiceOrderHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const userId = req.userId!;
    const id = String(req.params.id || '');

    const existing = await getServiceOrderById(tenantId, id);
    if (!existing) {
      res.status(404).json({ error: 'Ordem de serviço não encontrada.' });
      return;
    }

    await assertModulePermission(
      userId,
      MODULE,
      'delete',
      { ownerId: existing.created_by, assigneeId: existing.responsible_user_id },
      req,
    );

    await deleteServiceOrder(tenantId, id);
    res.status(204).send();
  } catch (error) {
    if (respondError(res, error)) return;
    console.error('[service-orders] delete failed', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/** OS-S3 — HTML A4 para preview no painel (não congela snapshot). */
export async function getServiceOrderDocumentHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const userId = req.userId!;
    await assertModulePermission(userId, MODULE, 'view', undefined, req);

    const id = String(req.params.id || '');
    const built = await buildServiceOrderDocumentForPreview({ tenantId, serviceOrderId: id });
    if (!built) {
      res.status(404).json({ error: 'Ordem de serviço não encontrada.' });
      return;
    }
    await persistServiceOrderDocumentHtml({
      tenantId,
      serviceOrderId: id,
      html: built.html,
      freeze: false,
    });
    res.json({ html: built.html, model: built.model });
  } catch (error) {
    if (respondError(res, error)) return;
    console.error('[service-orders] document failed', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/** OS-S3 — PDF download; congela snapshot na primeira emissão. */
export async function getServiceOrderPdfHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const userId = req.userId!;
    await assertModulePermission(userId, MODULE, 'view', undefined, req);

    const id = String(req.params.id || '');
    const freeze = firstQuery(req.query.freeze) !== '0';
    const result = await buildServiceOrderPdfBuffer({
      tenantId,
      serviceOrderId: id,
      freeze,
    });
    if (!result) {
      res.status(404).json({ error: 'Ordem de serviço não encontrada.' });
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
  } catch (error) {
    if (respondError(res, error)) return;
    console.error('[service-orders] pdf failed', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

const sendSignatureBody = z.object({
  include_technician: z.boolean().optional().default(true),
  regenerate: z.boolean().optional().default(false),
});

/** OS-S4 — Enviar / reenviar para assinatura (freeze + invites + notificação). */
export async function postServiceOrderSendForSignatureHandler(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const userId = req.userId!;
    const id = String(req.params.id || '');

    const existing = await getServiceOrderById(tenantId, id);
    if (!existing) {
      res.status(404).json({ error: 'Ordem de serviço não encontrada.' });
      return;
    }
    await assertModulePermission(
      userId,
      MODULE,
      'edit',
      { ownerId: existing.created_by, assigneeId: existing.responsible_user_id },
      req,
    );
    await assertPermissionKey(userId, 'service_orders.request_signature', req);
    await assertPermissionKey(userId, 'service_orders.send', req);

    const body = sendSignatureBody.parse(req.body ?? {});
    const result = await sendServiceOrderForSignature({
      tenantId,
      userId,
      serviceOrderId: id,
      includeTechnician: body.include_technician,
      regenerate: body.regenerate,
    });
    res.json(result);
  } catch (error) {
    if (respondError(res, error)) return;
    console.error('[service-orders] send-for-signature failed', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/** OS-S4 — Revogar links públicos ativos. */
export async function postServiceOrderRevokeLinksHandler(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const userId = req.userId!;
    const id = String(req.params.id || '');

    const existing = await getServiceOrderById(tenantId, id);
    if (!existing) {
      res.status(404).json({ error: 'Ordem de serviço não encontrada.' });
      return;
    }
    await assertModulePermission(
      userId,
      MODULE,
      'edit',
      { ownerId: existing.created_by, assigneeId: existing.responsible_user_id },
      req,
    );
    await assertPermissionKey(userId, 'service_orders.request_signature', req);

    await revokeServiceOrderPublicLinks({ tenantId, userId, serviceOrderId: id });
    res.json({ ok: true });
  } catch (error) {
    if (respondError(res, error)) return;
    console.error('[service-orders] revoke-links failed', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

const patchSignerBody = z.object({
  name: z.string().min(2).max(200),
});

/** Editar nome do técnico responsável (signatário). */
export async function patchServiceOrderSignerHandler(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const userId = req.userId!;
    const id = String(req.params.id || '');
    const signerId = String(req.params.signerId || '');
    const body = patchSignerBody.parse(req.body ?? {});

    const existing = await getServiceOrderById(tenantId, id);
    if (!existing) {
      res.status(404).json({ error: 'Ordem de serviço não encontrada.' });
      return;
    }
    await assertModulePermission(
      userId,
      MODULE,
      'edit',
      { ownerId: existing.created_by, assigneeId: existing.responsible_user_id },
      req,
    );
    await assertPermissionKey(userId, 'service_orders.request_signature', req);

    const out = await updateServiceOrderSignerName({
      tenantId,
      serviceOrderId: id,
      signerId,
      name: body.name,
    });
    res.json(out);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    if (respondError(res, error)) return;
    console.error('[service-orders] patch-signer failed', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/** OS-S4 — Reemitir convite de um signatário. */
export async function postServiceOrderReissueInviteHandler(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const userId = req.userId!;
    const id = String(req.params.id || '');
    const signerId = String(req.params.signerId || '');

    const existing = await getServiceOrderById(tenantId, id);
    if (!existing) {
      res.status(404).json({ error: 'Ordem de serviço não encontrada.' });
      return;
    }
    await assertModulePermission(
      userId,
      MODULE,
      'edit',
      { ownerId: existing.created_by, assigneeId: existing.responsible_user_id },
      req,
    );
    await assertPermissionKey(userId, 'service_orders.request_signature', req);
    await assertPermissionKey(userId, 'service_orders.send', req);

    const out = await reissueSignerInvite({
      tenantId,
      userId,
      serviceOrderId: id,
      signerId,
    });
    res.json(out);
  } catch (error) {
    if (respondError(res, error)) return;
    console.error('[service-orders] reissue-invite failed', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

const convertInvoiceBody = z.object({
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'due_date deve ser YYYY-MM-DD'),
  payment_method: z.string().min(1).max(64).optional().nullable(),
  allowed_payment_methods: z.array(z.string().min(1).max(64)).max(20).optional().nullable(),
  gateway_key: z.string().min(1).max(64).optional().nullable(),
});

/** OS-S5 — Converter OS assinada em fatura. */
export async function postServiceOrderConvertToInvoiceHandler(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const userId = req.userId!;
    const id = String(req.params.id || '');

    const existing = await getServiceOrderById(tenantId, id);
    if (!existing) {
      res.status(404).json({ error: 'Ordem de serviço não encontrada.' });
      return;
    }

    await assertPermissionKey(userId, 'billing.create_invoice', req);
    await assertPermissionKey(userId, 'service_orders.generate_invoice', req);
    await assertModulePermission(
      userId,
      MODULE,
      'edit',
      { ownerId: existing.created_by, assigneeId: existing.responsible_user_id },
      req,
    );

    const body = convertInvoiceBody.parse(req.body ?? {});
    const result = await convertSignedServiceOrderToInvoice({
      tenantId,
      actorUserId: userId,
      serviceOrderId: id,
      dueDate: body.due_date,
      paymentMethod: body.payment_method ?? null,
      allowedPaymentMethods: body.allowed_payment_methods ?? null,
      gatewayKey: body.gateway_key ?? null,
    });
    res.status(201).json({ invoice: result.invoice });
  } catch (error) {
    if (respondError(res, error)) return;
    if (error instanceof PreconditionFailedError) {
      res.status(400).json({ code: error.code, errors: error.errors });
      return;
    }
    if (error instanceof Error) {
      const msg = error.message;
      if (msg === 'Ordem de serviço não encontrada') {
        res.status(404).json({ error: msg });
        return;
      }
      if (
        msg === 'Apenas ordens assinadas (ou concluídas) podem ser convertidas em fatura' ||
        msg === 'Ordem de serviço sem cliente vinculado' ||
        msg === 'Esta ordem está configurada sem faturamento (billing_mode=none)' ||
        msg.includes('sem itens válidos')
      ) {
        res.status(400).json({ error: msg });
        return;
      }
      if (
        msg === 'Esta ordem de serviço já possui fatura gerada' ||
        msg === 'Já existe fatura vinculada a esta ordem de serviço'
      ) {
        res.status(409).json({ error: msg, code: 'SERVICE_ORDER_ALREADY_INVOICED' });
        return;
      }
      if (msg === 'Gateway de pagamento não configurado') {
        res.status(503).json({ error: msg });
        return;
      }
    }
    const err = error as { code?: string };
    if (err?.code === '23505') {
      res.status(409).json({
        error: 'Já existe fatura vinculada a esta ordem de serviço.',
        code: 'SERVICE_ORDER_ALREADY_INVOICED',
      });
      return;
    }
    console.error('[service-orders] convert-to-invoice failed', error);
    res.status(500).json({ error: 'Erro ao gerar fatura a partir da ordem de serviço' });
  }
}

const scheduleVisitBody = z.object({
  title: z.string().min(1).max(500).optional().nullable(),
  description: z.string().max(20000).optional().nullable(),
  type: z.string().min(1).max(80).optional().default('visit'),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  location: z.string().max(2000).optional().nullable(),
  responsible_user_id: z.string().uuid().optional().nullable(),
  create_google_event: z.boolean().optional().default(false),
  create_meet: z.boolean().optional().default(false),
  send_reminder_to_client: z.boolean().optional().default(false),
});

/** OS-S6 — Marcar visita técnica (Agenda ± Google). */
export async function postServiceOrderScheduleVisitHandler(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const userId = req.userId!;
    const id = String(req.params.id || '');

    const existing = await getServiceOrderById(tenantId, id);
    if (!existing) {
      res.status(404).json({ error: 'Ordem de serviço não encontrada.' });
      return;
    }

    await assertModulePermission(
      userId,
      MODULE,
      'edit',
      { ownerId: existing.created_by, assigneeId: existing.responsible_user_id },
      req,
    );
    await assertModulePermission(userId, 'agenda', 'create', undefined, req);

    const body = scheduleVisitBody.parse(req.body ?? {});
    const result = await scheduleServiceOrderVisit({
      tenantId,
      userId,
      serviceOrderId: id,
      input: body,
    });

    res.status(201).json({
      appointment: result.appointment,
      warnings: result.warnings,
      order: {
        ...result.order,
        appointment: await getServiceOrderAppointmentSummary(
          tenantId,
          result.order.appointment_id,
        ),
      },
    });
  } catch (error) {
    if (respondError(res, error)) return;
    if (error instanceof Error) {
      const msg = error.message;
      // createAppointment throws plain Error for validation
      if (msg.includes('cliente ou lead') || msg.includes('horário') || msg.includes('título')) {
        res.status(400).json({ error: msg });
        return;
      }
    }
    console.error('[service-orders] schedule-visit failed', error);
    res.status(500).json({ error: 'Erro ao marcar visita técnica' });
  }
}

const rescheduleVisitBody = z.object({
  title: z.string().min(1).max(500).optional().nullable(),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  location: z.string().max(2000).optional().nullable(),
  responsible_user_id: z.string().uuid().optional().nullable(),
  create_google_event: z.boolean().optional(),
  create_meet: z.boolean().optional().default(false),
  send_reminder_to_client: z.boolean().optional().default(false),
});

/** OS-S9 — Remarcar visita técnica já vinculada. */
export async function postServiceOrderRescheduleVisitHandler(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    const userId = req.userId!;
    const id = String(req.params.id || '');

    const existing = await getServiceOrderById(tenantId, id);
    if (!existing) {
      res.status(404).json({ error: 'Ordem de serviço não encontrada.' });
      return;
    }

    await assertModulePermission(
      userId,
      MODULE,
      'edit',
      { ownerId: existing.created_by, assigneeId: existing.responsible_user_id },
      req,
    );
    await assertModulePermission(userId, 'agenda', 'edit', undefined, req);

    const body = rescheduleVisitBody.parse(req.body ?? {});
    const result = await rescheduleServiceOrderVisit({
      tenantId,
      userId,
      serviceOrderId: id,
      input: body,
    });

    res.status(200).json({
      appointment: result.appointment,
      warnings: result.warnings,
      order: {
        ...result.order,
        appointment: await getServiceOrderAppointmentSummary(
          tenantId,
          result.order.appointment_id,
        ),
      },
    });
  } catch (error) {
    if (respondError(res, error)) return;
    if (error instanceof Error) {
      const msg = error.message;
      if (msg.includes('cliente ou lead') || msg.includes('horário') || msg.includes('título')) {
        res.status(400).json({ error: msg });
        return;
      }
    }
    console.error('[service-orders] reschedule-visit failed', error);
    res.status(500).json({ error: 'Erro ao remarcar visita técnica' });
  }
}
