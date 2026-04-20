export type KanbanAutoMessageMode = 'free_text' | 'whatsapp_model';

type ParsedKanbanPhase2Notifications = {
  notify_operator: boolean;
  notify_team: boolean;
  message_template: string | null;
  /** PR3 Fase 2B: texto simples enviado ao entrar na coluna (sem template oficial WhatsApp). */
  auto_message_enabled: boolean;
  /** Modo: texto livre ou modelo da aba «Modelos» (`whatsapp_message_templates`, tipo model). */
  auto_message_mode: KanbanAutoMessageMode;
  /** Legado (template interno removido): mantido null ao normalizar metadata. */
  auto_message_template_id: string | null;
  /** Quando `auto_message_mode === 'whatsapp_model'`, id de `whatsapp_message_templates` (tipo model). */
  auto_message_whatsapp_template_id: string | null;
  auto_message_text: string | null;
};

export type ParsedKanbanPhase2Webhook = {
  enabled: boolean;
  url: string;
  method: 'POST' | 'PUT' | 'PATCH';
  timeout_ms: number;
  signing_secret: string;
  include_headers: boolean;
  non_blocking: boolean;
};

export type ParsedKanbanPhase2 = {
  version: 1;
  notifications: ParsedKanbanPhase2Notifications;
  webhook: ParsedKanbanPhase2Webhook;
  crm: {
    enabled: boolean;
    /** Fase comercial: garante vínculo client_id ao entrar na coluna. */
    ensure_client_on_column_entry: boolean;
    /** Fase 2B: ao entrar na coluna, dedupe + vincular ou criar lead (quando permitido). */
    auto_link_or_create_lead: boolean;
    /** Se não houver match único no dedupe, criar lead novo (default true quando auto_link está ativo). */
    allow_create_when_no_dedupe_match: boolean;
  };
  productivity: {
    enabled: boolean;
    /** Fase 2B PR2: criar tarefa ao entrar na coluna. */
    auto_create_task: boolean;
    task_title_template: string;
    task_description_template: string;
    task_priority: 'low' | 'medium' | 'high';
    /** null = sem prazo; 0 = hoje; N = N dias a partir de hoje (UTC). */
    due_offset_days: number | null;
    assignee_mode: 'none' | 'actor' | 'conversation_assignee' | 'fixed_user';
    assignee_user_id: string | null;
  };
  automations: {
    /** Movimento automático para outra coluna após tempo (agendado no backend). */
    auto_move_by_time: {
      enabled: boolean;
      to_column_id: string | null;
      delay_value: number;
      delay_unit: 'seconds' | 'minutes' | 'hours' | 'days';
    };
  };
};

const DEFAULT_KANBAN_PHASE2: ParsedKanbanPhase2 = {
  version: 1,
   notifications: {
    notify_operator: false,
    notify_team: false,
    message_template: null,
    auto_message_enabled: false,
    auto_message_mode: 'free_text',
    auto_message_template_id: null,
    auto_message_whatsapp_template_id: null,
    auto_message_text: null,
  },
  webhook: {
    enabled: false,
    url: '',
    method: 'POST',
    timeout_ms: 3000,
    signing_secret: '',
    include_headers: true,
    non_blocking: true,
  },
  crm: {
    enabled: false,
    ensure_client_on_column_entry: false,
    auto_link_or_create_lead: false,
    allow_create_when_no_dedupe_match: true,
  },
  productivity: {
    enabled: false,
    auto_create_task: false,
    task_title_template: 'Kanban: {{column_name}}',
    task_description_template: '',
    task_priority: 'medium',
    due_offset_days: null,
    assignee_mode: 'actor',
    assignee_user_id: null,
  },
  automations: {
    auto_move_by_time: {
      enabled: false,
      to_column_id: null,
      delay_value: 60,
      delay_unit: 'minutes',
    },
  },
};

const ALLOWED_WEBHOOK_METHODS = new Set(['POST', 'PUT', 'PATCH']);
const MIN_TIMEOUT_MS = 500;
const MAX_TIMEOUT_MS = 10000;

const UUID_RE_PHASE2 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeWebhookUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    return u.toString();
  } catch {
    return '';
  }
}

export function parseKanbanPhase2(metadata: unknown): ParsedKanbanPhase2 {
  if (!metadata || typeof metadata !== 'object') return DEFAULT_KANBAN_PHASE2;
  const root = metadata as Record<string, unknown>;
  const rawPhase2 = root.kanban_phase2;
  if (!rawPhase2 || typeof rawPhase2 !== 'object') return DEFAULT_KANBAN_PHASE2;
  const p = rawPhase2 as Record<string, unknown>;

  const rawNotifications =
    p.notifications && typeof p.notifications === 'object'
      ? (p.notifications as Record<string, unknown>)
      : {};
  const rawWebhook =
    p.webhook && typeof p.webhook === 'object' ? (p.webhook as Record<string, unknown>) : {};
  const rawCrm = p.crm && typeof p.crm === 'object' ? (p.crm as Record<string, unknown>) : {};
  const rawProductivity =
    p.productivity && typeof p.productivity === 'object'
      ? (p.productivity as Record<string, unknown>)
      : {};
  const rawAutomations =
    p.automations && typeof p.automations === 'object' ? (p.automations as Record<string, unknown>) : {};

  let messageTemplate: string | null = null;
  if (typeof rawNotifications.message_template === 'string') {
    const trimmed = rawNotifications.message_template.trim().slice(0, 120);
    if (trimmed.length > 0) messageTemplate = trimmed;
  }

  const autoMessageEnabled = rawNotifications.auto_message_enabled === true;
  const rawMode =
    typeof rawNotifications.auto_message_mode === 'string' ? rawNotifications.auto_message_mode.trim() : '';
  let autoMessageMode: KanbanAutoMessageMode = 'free_text';
  if (rawMode === 'whatsapp_model') autoMessageMode = 'whatsapp_model';
  else if (rawMode === 'template') {
    // Legado: automação por template interno descontinuada → tratar como texto livre (corpo só em auto_message_text).
    autoMessageMode = 'free_text';
  }

  let autoMessageWhatsappTemplateId: string | null = null;
  if (
    typeof rawNotifications.auto_message_whatsapp_template_id === 'string' &&
    UUID_RE_PHASE2.test(rawNotifications.auto_message_whatsapp_template_id)
  ) {
    autoMessageWhatsappTemplateId = rawNotifications.auto_message_whatsapp_template_id;
  }

  let autoMessageText: string | null = null;
  if (typeof rawNotifications.auto_message_text === 'string') {
    const t = rawNotifications.auto_message_text.trim();
    if (t.length > 0) autoMessageText = t.slice(0, 2000);
  }

  const normalizedText = autoMessageMode === 'free_text' ? autoMessageText : null;
  const normalizedTemplateId = null;
  const normalizedWhatsappTemplateId = autoMessageMode === 'whatsapp_model' ? autoMessageWhatsappTemplateId : null;

  const rawMethod = typeof rawWebhook.method === 'string' ? rawWebhook.method.toUpperCase() : 'POST';
  const method = ALLOWED_WEBHOOK_METHODS.has(rawMethod) ? (rawMethod as 'POST' | 'PUT' | 'PATCH') : 'POST';
  const timeoutRaw = Number(rawWebhook.timeout_ms);
  const timeoutMs = Number.isFinite(timeoutRaw)
    ? Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(timeoutRaw)))
    : 3000;
  const signingSecret =
    typeof rawWebhook.signing_secret === 'string' ? rawWebhook.signing_secret.trim().slice(0, 512) : '';

  return {
    version: 1,
    notifications: {
      notify_operator: rawNotifications.notify_operator === true,
      notify_team: rawNotifications.notify_team === true,
      message_template: messageTemplate,
      auto_message_enabled: autoMessageEnabled,
      auto_message_mode: autoMessageMode,
      auto_message_template_id: normalizedTemplateId,
      auto_message_whatsapp_template_id: normalizedWhatsappTemplateId,
      auto_message_text: normalizedText,
    },
    webhook: {
      enabled: rawWebhook.enabled === true,
      url: normalizeWebhookUrl(rawWebhook.url),
      method,
      timeout_ms: timeoutMs,
      signing_secret: signingSecret,
      include_headers: rawWebhook.include_headers !== false,
      non_blocking: rawWebhook.non_blocking !== false,
    },
    crm: {
      enabled: rawCrm.enabled === true,
      ensure_client_on_column_entry: rawCrm.ensure_client_on_column_entry === true,
      auto_link_or_create_lead: rawCrm.auto_link_or_create_lead === true,
      allow_create_when_no_dedupe_match:
        rawCrm.auto_link_or_create_lead === true && rawCrm.allow_create_when_no_dedupe_match !== false,
    },
    productivity: (() => {
      const autoTask = rawProductivity.auto_create_task === true;
      const rawTitle =
        typeof rawProductivity.task_title_template === 'string'
          ? rawProductivity.task_title_template.trim().slice(0, 500)
          : '';
      const titleTpl = rawTitle.length > 0 ? rawTitle : 'Kanban: {{column_name}}';
      const rawDesc =
        typeof rawProductivity.task_description_template === 'string'
          ? rawProductivity.task_description_template.trim().slice(0, 5000)
          : '';
      let prio: 'low' | 'medium' | 'high' = 'medium';
      if (
        rawProductivity.task_priority === 'low' ||
        rawProductivity.task_priority === 'medium' ||
        rawProductivity.task_priority === 'high'
      ) {
        prio = rawProductivity.task_priority;
      }
      let dueOff: number | null = null;
      if (rawProductivity.due_offset_days !== undefined && rawProductivity.due_offset_days !== null) {
        const n = Number(rawProductivity.due_offset_days);
        if (Number.isFinite(n)) dueOff = Math.min(365, Math.max(0, Math.round(n)));
      }
      const amRaw = typeof rawProductivity.assignee_mode === 'string' ? rawProductivity.assignee_mode : 'actor';
      const am =
        amRaw === 'none' ||
        amRaw === 'actor' ||
        amRaw === 'conversation_assignee' ||
        amRaw === 'fixed_user'
          ? amRaw
          : 'actor';
      let fixedUid: string | null = null;
      if (
        typeof rawProductivity.assignee_user_id === 'string' &&
        UUID_RE_PHASE2.test(rawProductivity.assignee_user_id)
      ) {
        fixedUid = rawProductivity.assignee_user_id;
      }
      return {
        enabled: rawProductivity.enabled === true || autoTask,
        auto_create_task: autoTask,
        task_title_template: titleTpl,
        task_description_template: rawDesc,
        task_priority: prio,
        due_offset_days: dueOff,
        assignee_mode: am,
        assignee_user_id: fixedUid,
      };
    })(),
    automations: (() => {
      const rawAmt =
        rawAutomations.auto_move_by_time && typeof rawAutomations.auto_move_by_time === 'object'
          ? (rawAutomations.auto_move_by_time as Record<string, unknown>)
          : {};
      const enabled = rawAmt.enabled === true;
      let toCol: string | null = null;
      if (typeof rawAmt.to_column_id === 'string' && UUID_RE_PHASE2.test(rawAmt.to_column_id)) {
        toCol = rawAmt.to_column_id;
      }
      const dvRaw = Number(rawAmt.delay_value);
      const delayValue = Number.isFinite(dvRaw) ? Math.min(99999, Math.max(1, Math.round(dvRaw))) : 60;
      const duRaw = typeof rawAmt.delay_unit === 'string' ? rawAmt.delay_unit.trim().toLowerCase() : '';
      let delayUnit: 'seconds' | 'minutes' | 'hours' | 'days' = 'minutes';
      if (duRaw === 'seconds') delayUnit = 'seconds';
      else if (duRaw === 'hours') delayUnit = 'hours';
      else if (duRaw === 'days') delayUnit = 'days';
      else delayUnit = 'minutes';
      return {
        auto_move_by_time: {
          enabled,
          to_column_id: toCol,
          delay_value: delayValue,
          delay_unit: delayUnit,
        },
      };
    })(),
  };
}

export function applyKanbanPhase2Defaults(metadata: unknown): Record<string, unknown> {
  const root =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? ({ ...(metadata as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  root.kanban_phase2 = parseKanbanPhase2(root);
  return root;
}

export function validateKanbanPhase2ForSave(metadata: unknown): string[] {
  const parsed = parseKanbanPhase2(metadata);
  const issues: string[] = [];
  if (parsed.webhook.enabled) {
    if (!parsed.webhook.url) {
      issues.push('Webhook habilitado exige URL válida (http/https).');
    }
    if (!ALLOWED_WEBHOOK_METHODS.has(parsed.webhook.method)) {
      issues.push('Método de webhook inválido. Use POST, PUT ou PATCH.');
    }
    if (
      !Number.isFinite(parsed.webhook.timeout_ms) ||
      parsed.webhook.timeout_ms < MIN_TIMEOUT_MS ||
      parsed.webhook.timeout_ms > MAX_TIMEOUT_MS
    ) {
      issues.push(`timeout_ms deve estar entre ${MIN_TIMEOUT_MS} e ${MAX_TIMEOUT_MS}.`);
    }
    if (parsed.webhook.non_blocking !== true) {
      issues.push('Webhook da Fase 2A deve permanecer non_blocking=true.');
    }
  }
  if (parsed.productivity.auto_create_task) {
    if (parsed.productivity.assignee_mode === 'fixed_user') {
      if (!parsed.productivity.assignee_user_id) {
        issues.push('Tarefa automática: modo “usuário fixo” exige responsável selecionado.');
      }
    }
  }
  if (parsed.notifications.auto_message_enabled) {
    if (parsed.notifications.auto_message_mode === 'whatsapp_model') {
      if (!parsed.notifications.auto_message_whatsapp_template_id) {
        issues.push('Mensagem automática (Templates WhatsApp): selecione um modelo ou desligue a opção.');
      }
    } else if (!parsed.notifications.auto_message_text || !parsed.notifications.auto_message_text.trim()) {
      issues.push('Mensagem automática: ative somente com texto da mensagem preenchido.');
    }
  }
  if (parsed.automations.auto_move_by_time.enabled) {
    if (!parsed.automations.auto_move_by_time.to_column_id) {
      issues.push('Movimento automático: selecione a coluna de destino ou desligue a opção.');
    }
  }
  return issues;
}

/** Valida destino da automação contra o board (ex.: não pode ser a própria coluna; coluna deve existir no quadro). */
export function validateKanbanAutoMoveAgainstBoard(
  columnId: string | null,
  boardColumnIds: Set<string>,
  parsed: ParsedKanbanPhase2,
): string[] {
  const m = parsed.automations.auto_move_by_time;
  if (!m.enabled) return [];
  const issues: string[] = [];
  if (!m.to_column_id) {
    issues.push('Movimento automático: coluna de destino inválida.');
    return issues;
  }
  if (columnId && m.to_column_id === columnId) {
    issues.push('Movimento automático: a coluna de destino não pode ser a mesma coluna de origem.');
  }
  if (!boardColumnIds.has(m.to_column_id)) {
    issues.push('Movimento automático: a coluna de destino deve pertencer ao mesmo quadro.');
  }
  return issues;
}

export function computeScheduledForFromDelay(
  delayValue: number,
  delayUnit: 'seconds' | 'minutes' | 'hours' | 'days',
  from: Date = new Date(),
): Date {
  const v = Math.max(1, Math.min(99999, Math.round(delayValue)));
  const mult =
    delayUnit === 'seconds'
      ? 1000
      : delayUnit === 'hours'
        ? 3600_000
        : delayUnit === 'days'
          ? 86400_000
          : 60_000;
  return new Date(from.getTime() + v * mult);
}
