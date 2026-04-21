/** Espelha `metadata` da coluna Kanban: `kanban_column_ui` + `kanban_column_rules`. */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PRIORITIES = new Set(['low', 'medium', 'high']);
const ALLOWED_WEBHOOK_METHODS = new Set(['POST', 'PUT', 'PATCH']);

export type KanbanColumnUi = {
  hidden: boolean;
};

export const EMPTY_KANBAN_COLUMN_UI: KanbanColumnUi = {
  hidden: false,
};

export type KanbanColumnRules = {
  is_terminal: boolean;
  close_conversation: boolean;
  clear_assignee: boolean;
  send_to_queue: boolean;
  require_move_reason: boolean;
  require_confirmation: boolean;
  assign_team_id: string | null;
  assign_user_id: string | null;
  add_tag_label: string;
  remove_tag_label: string;
  conversation_priority: 'low' | 'medium' | 'high' | '' | null;
};

export const EMPTY_KANBAN_RULES: KanbanColumnRules = {
  is_terminal: false,
  close_conversation: false,
  clear_assignee: false,
  send_to_queue: false,
  require_move_reason: false,
  require_confirmation: false,
  assign_team_id: null,
  assign_user_id: null,
  add_tag_label: '',
  remove_tag_label: '',
  conversation_priority: '',
};

export type KanbanPhase2WebhookConfig = {
  enabled: boolean;
  url: string;
  method: 'POST' | 'PUT' | 'PATCH';
  timeout_ms: number;
  signing_secret: string;
  include_headers: boolean;
  non_blocking: boolean;
};

export type KanbanAutoMessageModeUi = 'free_text' | 'whatsapp_model';

export type KanbanPhase2Config = {
  version: 1;
  notifications: {
    notify_operator: boolean;
    notify_team: boolean;
    message_template: string | null;
    auto_message_enabled: boolean;
    auto_message_mode: KanbanAutoMessageModeUi;
    /** Legado (template interno removido): sempre null ao gravar pela UI. */
    auto_message_template_id: string | null;
    /** Modelo da aba «Modelos» (whatsapp_message_templates.template_type = model). */
    auto_message_whatsapp_template_id: string | null;
    auto_message_text: string | null;
  };
   webhook: KanbanPhase2WebhookConfig;
  crm: {
    enabled: boolean;
    ensure_client_on_column_entry: boolean;
    auto_link_or_create_lead: boolean;
    allow_create_when_no_dedupe_match: boolean;
  };
  productivity: {
    enabled: boolean;
    auto_create_task: boolean;
    task_title_template: string;
    task_description_template: string;
    task_priority: 'low' | 'medium' | 'high';
    due_offset_days: number | null;
    assignee_mode: 'none' | 'actor' | 'conversation_assignee' | 'fixed_user';
    assignee_user_id: string | null;
  };
  automations: {
    auto_move_by_time: {
      enabled: boolean;
      to_column_id: string | null;
      delay_value: number;
      delay_unit: 'minutes' | 'hours' | 'days';
    };
  };
};

/** Exibição de totais de propostas no cartão do Kanban (metadata.kanban_proposals). */
export type KanbanProposalsDisplay = {
  show_pending: boolean;
  show_accepted: boolean;
  /** Etapa 2: mover cartão ao aceitar proposta (backend). */
  move_on_proposal_accept: boolean;
  target_column_id: string | null;
  /**
   * Quando verdadeiro, o backend cria proposta ao mover/criar o cartão nesta coluna (exige modelo abaixo).
   */
  auto_create_proposal_on_enter: boolean;
  /** Modelo oficial (`proposal_templates`) para pré-preencher proposta no Chat a partir desta coluna. */
  default_proposal_model_id: string | null;
  /** Legado: rascunho em `proposals` (Etapa 3 inicial); mantido até reconfigurar a coluna. */
  default_proposal_template_id: string | null;
};

export const EMPTY_KANBAN_PROPOSALS_DISPLAY: KanbanProposalsDisplay = {
  show_pending: false,
  show_accepted: false,
  move_on_proposal_accept: false,
  target_column_id: null,
  auto_create_proposal_on_enter: false,
  default_proposal_model_id: null,
  default_proposal_template_id: null,
};

export function parseKanbanProposalsDisplay(metadata: unknown): KanbanProposalsDisplay {
  if (!metadata || typeof metadata !== 'object') return { ...EMPTY_KANBAN_PROPOSALS_DISPLAY };
  const root = metadata as Record<string, unknown>;
  const raw = root.kanban_proposals;
  if (!raw || typeof raw !== 'object') return { ...EMPTY_KANBAN_PROPOSALS_DISPLAY };
  const o = raw as Record<string, unknown>;
  const tid = o.target_column_id;
  const targetStr = typeof tid === 'string' && UUID_RE.test(tid.trim()) ? tid.trim() : null;
  const tplRaw = o.default_proposal_template_id;
  const templateStr =
    typeof tplRaw === 'string' && UUID_RE.test(tplRaw.trim()) ? tplRaw.trim() : null;
  const modelRaw = o.default_proposal_model_id;
  const modelStr =
    typeof modelRaw === 'string' && UUID_RE.test(modelRaw.trim()) ? modelRaw.trim() : null;
  return {
    show_pending: o.show_pending === true,
    show_accepted: o.show_accepted === true,
    move_on_proposal_accept: o.move_on_proposal_accept === true,
    target_column_id: targetStr,
    auto_create_proposal_on_enter: o.auto_create_proposal_on_enter === true,
    default_proposal_model_id: modelStr,
    default_proposal_template_id: templateStr,
  };
}

export const EMPTY_KANBAN_PHASE2: KanbanPhase2Config = {
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

export function parseKanbanColumnUi(metadata: unknown): KanbanColumnUi {
  if (!metadata || typeof metadata !== 'object') return { ...EMPTY_KANBAN_COLUMN_UI };
  const root = metadata as Record<string, unknown>;
  const raw = root.kanban_column_ui;
  if (!raw || typeof raw !== 'object') return { ...EMPTY_KANBAN_COLUMN_UI };
  const u = raw as Record<string, unknown>;
  return {
    hidden: u.hidden === true,
  };
}

export function parseKanbanColumnRules(metadata: unknown): KanbanColumnRules {
  if (!metadata || typeof metadata !== 'object') return { ...EMPTY_KANBAN_RULES };
  const root = metadata as Record<string, unknown>;
  const raw = root.kanban_column_rules;
  if (!raw || typeof raw !== 'object') return { ...EMPTY_KANBAN_RULES };
  const r = raw as Record<string, unknown>;
  let assignTeam: string | null = null;
  if (typeof r.assign_team_id === 'string' && UUID_RE.test(r.assign_team_id)) {
    assignTeam = r.assign_team_id;
  }
  let assignUser: string | null = null;
  if (typeof r.assign_user_id === 'string' && UUID_RE.test(r.assign_user_id)) {
    assignUser = r.assign_user_id;
  }
  let prio: KanbanColumnRules['conversation_priority'] = '';
  if (typeof r.conversation_priority === 'string' && PRIORITIES.has(r.conversation_priority)) {
    prio = r.conversation_priority as 'low' | 'medium' | 'high';
  }
  const closeConversation = r.close_conversation === true;
  const clearAssignee = r.clear_assignee === true;
  const sendQueue = r.send_to_queue === true;
  const blocksAssignTargets = closeConversation || clearAssignee || sendQueue;

  return {
    is_terminal: r.is_terminal === true,
    close_conversation: closeConversation,
    clear_assignee: clearAssignee,
    send_to_queue: sendQueue,
    require_move_reason: r.require_move_reason === true,
    require_confirmation: r.require_confirmation === true,
    assign_team_id: blocksAssignTargets ? null : assignTeam,
    assign_user_id: blocksAssignTargets ? null : assignUser,
    add_tag_label: typeof r.add_tag_label === 'string' ? r.add_tag_label : '',
    remove_tag_label: typeof r.remove_tag_label === 'string' ? r.remove_tag_label : '',
    conversation_priority: prio,
  };
}

export function parseKanbanPhase2(metadata: unknown): KanbanPhase2Config {
  if (!metadata || typeof metadata !== 'object') return { ...EMPTY_KANBAN_PHASE2 };
  const root = metadata as Record<string, unknown>;
  const raw = root.kanban_phase2;
  if (!raw || typeof raw !== 'object') return { ...EMPTY_KANBAN_PHASE2 };
  const p = raw as Record<string, unknown>;

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

  const rawMethod = typeof rawWebhook.method === 'string' ? rawWebhook.method.toUpperCase() : 'POST';
  const method = ALLOWED_WEBHOOK_METHODS.has(rawMethod) ? (rawMethod as 'POST' | 'PUT' | 'PATCH') : 'POST';

  const timeoutRaw = Number(rawWebhook.timeout_ms);
  const timeoutMs = Number.isFinite(timeoutRaw) ? Math.min(10000, Math.max(500, Math.round(timeoutRaw))) : 3000;

  let url = '';
  if (typeof rawWebhook.url === 'string') {
    const trimmed = rawWebhook.url.trim();
    if (/^https?:\/\//i.test(trimmed)) url = trimmed;
  }

  const rawMode =
    typeof rawNotifications.auto_message_mode === 'string' ? rawNotifications.auto_message_mode.trim() : '';
  let autoMessageMode: KanbanAutoMessageModeUi = 'free_text';
  if (rawMode === 'whatsapp_model') autoMessageMode = 'whatsapp_model';
  else if (rawMode === 'template') {
    autoMessageMode = 'free_text';
  }

  let autoMessageWhatsappTemplateId: string | null = null;
  if (
    typeof rawNotifications.auto_message_whatsapp_template_id === 'string' &&
    UUID_RE.test(rawNotifications.auto_message_whatsapp_template_id)
  ) {
    autoMessageWhatsappTemplateId = rawNotifications.auto_message_whatsapp_template_id;
  }

  let autoMsg: string | null = null;
  if (typeof rawNotifications.auto_message_text === 'string') {
    const t = rawNotifications.auto_message_text.trim();
    if (t.length > 0) autoMsg = t.slice(0, 2000);
  }

  const normalizedText = autoMessageMode === 'free_text' ? autoMsg : null;
  const normalizedTemplateId = null;
  const normalizedWhatsappTemplateId =
    autoMessageMode === 'whatsapp_model' ? autoMessageWhatsappTemplateId : null;

  return {
    version: 1,
    notifications: {
      notify_operator: rawNotifications.notify_operator === true,
      notify_team: rawNotifications.notify_team === true,
      message_template:
        typeof rawNotifications.message_template === 'string' && rawNotifications.message_template.trim().length > 0
          ? rawNotifications.message_template.trim().slice(0, 120)
          : null,
      auto_message_enabled: rawNotifications.auto_message_enabled === true,
      auto_message_mode: autoMessageMode,
      auto_message_template_id: normalizedTemplateId,
      auto_message_whatsapp_template_id: normalizedWhatsappTemplateId,
      auto_message_text: normalizedText,
    },
    webhook: {
      enabled: rawWebhook.enabled === true,
      url,
      method,
      timeout_ms: timeoutMs,
      signing_secret:
        typeof rawWebhook.signing_secret === 'string' ? rawWebhook.signing_secret.trim().slice(0, 512) : '',
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
      if (typeof rawProductivity.assignee_user_id === 'string' && UUID_RE.test(rawProductivity.assignee_user_id)) {
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
      if (typeof rawAmt.to_column_id === 'string' && UUID_RE.test(rawAmt.to_column_id)) {
        toCol = rawAmt.to_column_id;
      }
      const dvRaw = Number(rawAmt.delay_value);
      const delayValue = Number.isFinite(dvRaw) ? Math.min(99999, Math.max(1, Math.round(dvRaw))) : 60;
      const duRaw = typeof rawAmt.delay_unit === 'string' ? rawAmt.delay_unit.trim().toLowerCase() : '';
      let delayUnit: 'minutes' | 'hours' | 'days' = 'minutes';
      if (duRaw === 'hours') delayUnit = 'hours';
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

/** Efeitos que alteram atendimento (exclui só is_terminal, require_move_reason e require_confirmation). */
export function hasKanbanAttendanceRules(rules: KanbanColumnRules): boolean {
  return (
    rules.close_conversation ||
    rules.clear_assignee ||
    rules.send_to_queue ||
    !!rules.assign_team_id ||
    !!rules.assign_user_id
  );
}

export function hasKanbanOrganizationRules(rules: KanbanColumnRules): boolean {
  const p = rules.conversation_priority;
  const hasPrio = p === 'low' || p === 'medium' || p === 'high';
  return !!(rules.add_tag_label?.trim() || rules.remove_tag_label?.trim() || hasPrio);
}

export function hasKanbanColumnAutomationIndicators(rules: KanbanColumnRules): boolean {
  return (
    rules.is_terminal ||
    hasKanbanAttendanceRules(rules) ||
    hasKanbanOrganizationRules(rules) ||
    rules.require_move_reason ||
    rules.require_confirmation
  );
}

function serializeRulesForBackend(rules: KanbanColumnRules): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (rules.is_terminal) out.is_terminal = true;
  if (rules.close_conversation) out.close_conversation = true;
  if (rules.clear_assignee) out.clear_assignee = true;
  if (rules.send_to_queue) out.send_to_queue = true;
  if (rules.require_move_reason) out.require_move_reason = true;
  if (rules.require_confirmation) out.require_confirmation = true;
  const blocksAssignTargets =
    rules.close_conversation || rules.clear_assignee || rules.send_to_queue;
  if (!blocksAssignTargets && rules.assign_team_id) out.assign_team_id = rules.assign_team_id;
  if (!blocksAssignTargets && rules.assign_user_id) out.assign_user_id = rules.assign_user_id;
  const add = rules.add_tag_label.trim().slice(0, 64);
  if (add) out.add_tag_label = add;
  const rem = rules.remove_tag_label.trim().slice(0, 64);
  if (rem) out.remove_tag_label = rem;
  if (rules.conversation_priority === 'low' || rules.conversation_priority === 'medium' || rules.conversation_priority === 'high') {
    out.conversation_priority = rules.conversation_priority;
  }
  return out;
}

/** Funde UI + regras no objeto `metadata` completo da coluna (preserva outras chaves). */
export function mergeColumnMetadataFull(
  existing: Record<string, unknown> | undefined,
  ui: KanbanColumnUi,
  rules: KanbanColumnRules,
  phase2?: KanbanPhase2Config,
): Record<string, unknown> {
  const next = { ...(existing && typeof existing === 'object' ? existing : {}) } as Record<string, unknown>;
  if (ui.hidden) {
    next.kanban_column_ui = { hidden: true };
  } else {
    delete next.kanban_column_ui;
  }
  const ser = serializeRulesForBackend(rules);
  if (Object.keys(ser).length === 0) {
    delete next.kanban_column_rules;
  } else {
    next.kanban_column_rules = ser;
  }
  const normalizedPhase2 = phase2 ? parseKanbanPhase2({ kanban_phase2: phase2 }) : EMPTY_KANBAN_PHASE2;
  next.kanban_phase2 = normalizedPhase2;
  return next;
}

/** Injeta `kanban_proposals` no metadata preservando o restante (ex.: após mergeColumnMetadataFull). */
export function mergeKanbanProposalsIntoMetadata(
  meta: Record<string, unknown>,
  display: KanbanProposalsDisplay,
): Record<string, unknown> {
  const out = { ...meta };
  const modelId =
    typeof display.default_proposal_model_id === 'string' &&
    UUID_RE.test(display.default_proposal_model_id.trim())
      ? display.default_proposal_model_id.trim()
      : null;
  const tpl =
    typeof display.default_proposal_template_id === 'string' &&
    UUID_RE.test(display.default_proposal_template_id.trim())
      ? display.default_proposal_template_id.trim()
      : null;
  const autoOn = display.auto_create_proposal_on_enter === true;
  const hasBlock =
    display.show_pending ||
    display.show_accepted ||
    display.move_on_proposal_accept ||
    autoOn;
  if (!hasBlock) {
    delete out.kanban_proposals;
    return out;
  }
  const kp: Record<string, unknown> = {
    show_pending: display.show_pending,
    show_accepted: display.show_accepted,
    move_on_proposal_accept: display.move_on_proposal_accept,
    auto_create_proposal_on_enter: autoOn,
  };
  if (display.move_on_proposal_accept && display.target_column_id) {
    kp.target_column_id = display.target_column_id;
  }
  if (autoOn && modelId) {
    kp.default_proposal_model_id = modelId;
  } else if (autoOn && tpl) {
    kp.default_proposal_template_id = tpl;
  }
  out.kanban_proposals = kp;
  return out;
}

/** @deprecated use mergeColumnMetadataFull — mantido para chamadas antigas */
export function mergeColumnMetadataWithRules(
  existing: Record<string, unknown> | undefined,
  rules: KanbanColumnRules,
): Record<string, unknown> {
  return mergeColumnMetadataFull(existing, EMPTY_KANBAN_COLUMN_UI, rules);
}
