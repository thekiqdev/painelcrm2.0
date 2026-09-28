/**
 * Super Admin — templates padrão globais (`notification_template_system`) do motor CRM (tenants).
 */
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { pool } from '../utils/db.js';
import { isNotificationsEngineEnabled } from '../config/notificationsEngineEnv.js';
import {
  getEventByKey,
  listCrmSystemTemplatesJoined,
  updateCrmSystemTemplate,
} from '../services/notificationsEngine/notificationEngineRepository.js';
import {
  extractPlaceholders,
  renderStrictTemplates,
} from '../services/notificationsEngine/strictMergeRenderer.js';
import { buildSampleMergeContext } from '../services/notificationsEngine/notificationTenantUiSamples.js';

const DEFAULT_LOCALE = 'pt-BR';

const MODULE_LABEL: Record<string, string> = {
  invoices: 'Faturas',
  proposals: 'Propostas',
  contracts: 'Contratos',
  agenda: 'Agenda',
  other: 'Outros',
};

function moduleLabel(module: string): string {
  return MODULE_LABEL[module] ?? module;
}

function parseMergeFieldsJson(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === 'string');
  }
  if (typeof raw === 'string') {
    try {
      const j = JSON.parse(raw) as unknown;
      return Array.isArray(j) ? j.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** WhatsApp: apenas texto + placeholders; bloqueia padrões óbvios de HTML/script. */
function validateChannelTemplateSafety(channel: string, body: string, subject: string | null): string | null {
  if (channel !== 'whatsapp') return null;
  const combined = `${subject ?? ''}\n${body}`;
  if (/<\s*script/i.test(combined) || /<\s*\/\s*script/i.test(combined)) {
    return 'Não são permitidas etiquetas script nos templates WhatsApp.';
  }
  if (/javascript\s*:/i.test(combined)) {
    return 'Não são permitidos URLs javascript: nos templates WhatsApp.';
  }
  if (/\bon\w+\s*=/i.test(combined)) {
    return 'Não são permitidos atributos de evento inline (on*) nos templates WhatsApp.';
  }
  return null;
}

const patchBodySchema = z.object({
  event_key: z.string().min(1).max(256),
  channel: z.enum(['whatsapp', 'email', 'sms']),
  locale: z.string().min(2).max(32).default(DEFAULT_LOCALE),
  body_template: z.string().min(1).max(16000),
  subject_template: z.string().max(2000).optional().nullable(),
});

const previewBodySchema = z.object({
  event_key: z.string().min(1),
  body_template: z.string().min(1).max(16000),
  subject_template: z.string().max(2000).optional().nullable(),
  merge_context: z.record(z.string()).optional(),
});

function engineOff(res: Response) {
  res.status(503).json({
    ok: false,
    error: 'Motor de notificações desligado.',
  });
}

/** GET /api/superadmin/notification-templates */
export async function listCrmNotificationSystemTemplates(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!isNotificationsEngineEnabled()) {
      engineOff(res);
      return;
    }
    const module =
      typeof req.query.module === 'string' && req.query.module.trim() ? req.query.module.trim() : null;
    const channel =
      typeof req.query.channel === 'string' && req.query.channel.trim() ? req.query.channel.trim() : null;
    const locale =
      typeof req.query.locale === 'string' && req.query.locale.trim() ? req.query.locale.trim() : null;
    const search = typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q.trim() : null;

    const rows = await listCrmSystemTemplatesJoined(pool, {
      module: module === '__all__' || !module ? null : module,
      channel: channel === '__all__' || !channel ? null : channel,
      locale: locale === '__all__' || !locale ? null : locale,
      search,
    });

    const byModule = new Map<
      string,
      {
        module: string;
        label: string;
        events: Array<{
          event_key: string;
          label: string;
          description: string | null;
          channel: string;
          locale: string;
          subject_template: string | null;
          body_template: string;
          merge_fields: string[];
          version: number;
          template_id: string;
        }>;
      }
    >();

    for (const r of rows) {
      const mf = parseMergeFieldsJson(r.merge_fields);
      const entry = {
        event_key: r.event_key,
        label: r.description?.trim() || r.event_key,
        description: r.description,
        channel: r.channel,
        locale: r.locale,
        subject_template: r.subject_template,
        body_template: r.body_template,
        merge_fields: mf,
        version: r.version,
        template_id: r.id,
      };
      if (!byModule.has(r.module)) {
        byModule.set(r.module, {
          module: r.module,
          label: moduleLabel(r.module),
          events: [],
        });
      }
      byModule.get(r.module)!.events.push(entry);
    }

    res.json({
      ok: true,
      modules: [...byModule.values()],
    });
  } catch (e: unknown) {
    console.error('[superadmin/notification-templates] list', e);
    res.status(500).json({ ok: false, error: 'Erro ao listar templates padrão.' });
  }
}

/** PATCH /api/superadmin/notification-templates */
export async function patchCrmNotificationSystemTemplate(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!isNotificationsEngineEnabled()) {
      engineOff(res);
      return;
    }
    const parsed = patchBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Payload inválido.', details: parsed.error.flatten() });
      return;
    }
    const d = parsed.data;
    const locale = d.locale || DEFAULT_LOCALE;

    const event = await getEventByKey(pool, d.event_key);
    if (!event || !event.is_active) {
      res.status(404).json({ ok: false, error: 'Evento não encontrado ou inativo.' });
      return;
    }

    const allowed = event.merge_field_list;
    const sampleCtx = buildSampleMergeContext(allowed, null);
    const check = renderStrictTemplates({
      subjectTemplate: d.subject_template ?? null,
      bodyTemplate: d.body_template,
      context: sampleCtx,
      allowedMergeFields: allowed,
    });
    if (!check.ok) {
      res.status(400).json({
        ok: false,
        error: check.error,
        disallowed_placeholders: check.disallowedPlaceholders,
        missing_keys: check.missingKeys,
      });
      return;
    }

    const unsafe = validateChannelTemplateSafety(d.channel, d.body_template, d.subject_template ?? null);
    if (unsafe) {
      res.status(400).json({ ok: false, error: unsafe });
      return;
    }

    const updated = await updateCrmSystemTemplate(pool, {
      eventKey: d.event_key,
      channel: d.channel,
      locale,
      bodyTemplate: d.body_template,
      subjectTemplate: d.subject_template ?? null,
    });
    if (!updated) {
      res.status(404).json({
        ok: false,
        error: 'Template sistema não encontrado para este event_key / canal / idioma.',
      });
      return;
    }

    res.json({
      ok: true,
      template: {
        id: updated.id,
        event_key: updated.event_key,
        channel: updated.channel,
        locale: updated.locale,
        subject_template: updated.subject_template,
        body_template: updated.body_template,
        version: updated.version,
      },
    });
  } catch (e: unknown) {
    console.error('[superadmin/notification-templates] patch', e);
    res.status(500).json({ ok: false, error: 'Erro ao atualizar template padrão.' });
  }
}

/** POST /api/superadmin/notification-templates/preview */
export async function postCrmNotificationTemplatePreview(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!isNotificationsEngineEnabled()) {
      engineOff(res);
      return;
    }
    const parsed = previewBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Payload inválido.', details: parsed.error.flatten() });
      return;
    }
    const event = await getEventByKey(pool, parsed.data.event_key);
    if (!event || !event.is_active) {
      res.status(404).json({ ok: false, error: 'Evento não encontrado ou inativo.' });
      return;
    }
    const allowed = event.merge_field_list;
    const sampleCtx = buildSampleMergeContext(allowed, parsed.data.merge_context ?? null);
    const rendered = renderStrictTemplates({
      subjectTemplate: parsed.data.subject_template ?? null,
      bodyTemplate: parsed.data.body_template,
      context: sampleCtx,
      allowedMergeFields: allowed,
    });
    const bodyPlaceholders = extractPlaceholders(parsed.data.body_template);
    const subjectPlaceholders = parsed.data.subject_template
      ? extractPlaceholders(parsed.data.subject_template)
      : [];
    const allUsed = [...new Set([...bodyPlaceholders, ...subjectPlaceholders])];
    const unusedRecommended = allowed.filter((k) => !allUsed.includes(k));

    if (!rendered.ok) {
      res.json({
        ok: true,
        render_ok: false,
        error: rendered.error,
        disallowed_placeholders: rendered.disallowedPlaceholders,
        missing_keys: rendered.missingKeys,
        unused_merge_fields_hint: unusedRecommended,
      });
      return;
    }
    res.json({
      ok: true,
      render_ok: true,
      rendered_subject: rendered.subject,
      rendered_body: rendered.body,
      unused_merge_fields_hint: unusedRecommended.length ? unusedRecommended : undefined,
    });
  } catch (e: unknown) {
    console.error('[superadmin/notification-templates] preview', e);
    res.status(500).json({ ok: false, error: 'Erro ao pré-visualizar.' });
  }
}
