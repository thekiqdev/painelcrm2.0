/**
 * Catálogo de chaves granulares — resolve para can_* + module_extras (sem migração de BD).
 */
import type { ModulePermissionsMap } from './permissionTypes.js';

export type PermissionCatalogKey =
  | 'dashboard.view'
  | 'dashboard.view_sales_cards'
  | 'dashboard.view_financial_cards'
  | 'dashboard.view_attendance_cards'
  | 'dashboard.view_tasks_cards'
  | 'dashboard.view_projects_cards'
  | 'finance.view'
  | 'finance.view_dashboard_cards'
  | 'finance.view_revenue'
  | 'finance.view_expenses'
  | 'finance.view_profit'
  | 'finance.view_accounts_payable'
  | 'finance.create_expense'
  | 'finance.edit_expense'
  | 'finance.delete_expense'
  | 'finance.pay_accounts'
  | 'finance.view_reports'
  | 'billing.view'
  | 'billing.view_invoices'
  | 'billing.create_invoice'
  | 'billing.edit_invoice'
  | 'billing.cancel_invoice'
  | 'billing.delete_invoice'
  | 'billing.send_invoice'
  | 'billing.mark_paid'
  | 'billing.refund_invoice'
  | 'billing.view_subscriptions'
  | 'billing.create_subscription'
  | 'billing.edit_subscription'
  | 'billing.cancel_subscription'
  | 'billing.view_charges'
  | 'billing.create_charge'
  | 'billing.edit_charge'
  | 'billing.cancel_charge'
  | 'billing.view_all'
  /** @deprecated Resolvido como false até existir dono confiável nas cobranças. */
  | 'billing.view_own'
  | 'tasks.view'
  | 'tasks.view_all'
  | 'tasks.view_own'
  | 'tasks.create'
  | 'tasks.edit'
  | 'tasks.edit_own'
  | 'tasks.delete'
  | 'tasks.delete_own'
  | 'clients.view'
  | 'clients.view_all'
  | 'clients.view_own'
  | 'clients.create'
  | 'clients.edit'
  | 'clients.edit_own'
  | 'clients.delete'
  | 'clients.delete_own'
  | 'clients.export'
  | 'clients.import'
  | 'clients.merge'
  | 'clients.view_sensitive_fields'
  | 'leads.view'
  | 'leads.view_all'
  | 'leads.view_own'
  | 'leads.create'
  | 'leads.edit'
  | 'leads.edit_own'
  | 'leads.delete'
  | 'leads.delete_own'
  | 'leads.convert_to_client'
  | 'leads.export'
  | 'leads.import'
  | 'proposals.view'
  | 'proposals.view_all'
  | 'proposals.view_own'
  | 'proposals.create'
  | 'proposals.edit'
  | 'proposals.edit_own'
  | 'proposals.delete'
  | 'proposals.delete_own'
  | 'proposals.send'
  | 'proposals.approve'
  | 'proposals.convert_to_contract'
  | 'proposals.convert_to_invoice'
  | 'proposals.manage_integrations'
  | 'contracts.view'
  | 'contracts.view_all'
  | 'contracts.view_own'
  | 'contracts.create'
  | 'contracts.edit'
  | 'contracts.edit_own'
  | 'contracts.delete'
  | 'contracts.delete_own'
  | 'contracts.send'
  | 'contracts.request_signature'
  | 'contracts.cancel'
  | 'contracts.view_signed_files'
  | 'chat.view'
  | 'chat.view_queue'
  | 'chat.view_own_conversations'
  | 'chat.view_all_conversations'
  | 'chat.send_message'
  | 'chat.take_attendance'
  | 'chat.transfer_attendance'
  | 'chat.close_attendance'
  | 'chat.reopen_attendance'
  | 'chat.assign_to_user'
  | 'chat.manage_tags'
  | 'chat.create_invoice_from_chat'
  | 'chat.create_proposal_from_chat'
  | 'chat.create_contract_from_chat'
  | 'chat.schedule_from_chat'
  | 'chat.manage_groups'
  | 'chat.create_group'
  | 'chat.manage_group_participants'
  | 'chat.manage_group_settings'
  | 'chat.manage_queues'
  | 'chat.manage_teams'
  | 'chat.view_metrics'
  | 'chat.manage_automation';

/** Chaves só do chat (uso em mapas de ação). */
export type ChatPermissionCatalogKey = Extract<PermissionCatalogKey, `chat.${string}`>;

function moduleView(map: ModulePermissionsMap, module: string): boolean {
  return map[module]?.can_view === true;
}

export function extraFlag(ex: Record<string, unknown>, key: string, defaultVal: boolean): boolean {
  const v = ex[key];
  if (v === false) return false;
  if (v === true) return true;
  return defaultVal;
}

export interface ChatGranularResolved {
  view: boolean;
  view_queue: boolean;
  view_own_conversations: boolean;
  view_all_conversations: boolean;
  send_message: boolean;
  take_attendance: boolean;
  transfer_attendance: boolean;
  close_attendance: boolean;
  reopen_attendance: boolean;
  assign_to_user: boolean;
  manage_tags: boolean;
  create_invoice_from_chat: boolean;
  create_proposal_from_chat: boolean;
  create_contract_from_chat: boolean;
  schedule_from_chat: boolean;
  manage_groups: boolean;
  create_group: boolean;
  manage_group_participants: boolean;
  manage_group_settings: boolean;
  manage_queues: boolean;
  manage_teams: boolean;
  view_metrics: boolean;
  manage_automation: boolean;
}

/** Derivado do modelo legado (can_* + module_extras no módulo chat + módulos CRM). */
export function resolveChatGranularFromLegacy(map: ModulePermissionsMap): ChatGranularResolved {
  const chat = map.chat;
  const canView = chat?.can_view === true;
  const canEdit = chat?.can_edit === true;
  const ex = (chat?.module_extras ?? {}) as Record<string, unknown>;

  const view_all_conversations = extraFlag(ex, 'chat_view_all', canEdit === true);
  const manage_groups_base =
    canEdit &&
    (extraFlag(ex, 'chat_manage_groups', false) || extraFlag(ex, 'chat_manage_queues', false));

  return {
    view: canView,
    view_queue: canView && extraFlag(ex, 'chat_view_queue', true),
    view_own_conversations: canView && !view_all_conversations,
    view_all_conversations,
    send_message: canEdit && extraFlag(ex, 'chat_reply', true),
    take_attendance: canEdit && extraFlag(ex, 'chat_take_attendance', extraFlag(ex, 'chat_assign', true)),
    transfer_attendance: canEdit && extraFlag(ex, 'chat_transfer', true),
    close_attendance: canEdit && extraFlag(ex, 'chat_close', true),
    reopen_attendance: canEdit && extraFlag(ex, 'chat_reopen', true),
    assign_to_user: canEdit && extraFlag(ex, 'chat_assign', true),
    manage_tags: canEdit && extraFlag(ex, 'chat_manage_tags', true),
    create_invoice_from_chat:
      canEdit &&
      resolveBillingGranularFromLegacy(map).create_invoice &&
      extraFlag(ex, 'chat_create_invoice', true),
    create_proposal_from_chat:
      canEdit &&
      resolveProposalsGranularFromLegacy(map).create &&
      extraFlag(ex, 'chat_create_proposal', true),
    create_contract_from_chat:
      canEdit &&
      resolveContractsGranularFromLegacy(map).create &&
      extraFlag(ex, 'chat_create_contract', true),
    schedule_from_chat:
      canEdit &&
      moduleView(map, 'agenda') &&
      extraFlag(ex, 'chat_schedule', true),
    manage_groups: manage_groups_base,
    create_group: canEdit && extraFlag(ex, 'chat_create_group', true),
    manage_group_participants:
      canEdit &&
      extraFlag(
        ex,
        'chat_manage_group_participants',
        extraFlag(ex, 'chat_manage_groups', false) || extraFlag(ex, 'chat_manage_queues', false)
      ),
    manage_group_settings:
      canEdit &&
      extraFlag(
        ex,
        'chat_manage_group_settings',
        extraFlag(ex, 'chat_manage_groups', false) || manage_groups_base
      ),
    manage_queues: canEdit && extraFlag(ex, 'chat_manage_queues', false),
    manage_teams: canEdit && extraFlag(ex, 'chat_manage_teams', false),
    view_metrics: canView && extraFlag(ex, 'chat_view_metrics', false),
    manage_automation:
      canEdit &&
      (extraFlag(ex, 'chat_manage_automation', false) || extraFlag(ex, 'chat_manage_queues', false)),
  };
}

export interface FinanceGranularResolved {
  view: boolean;
  view_dashboard_cards: boolean;
  view_revenue: boolean;
  view_expenses: boolean;
  view_profit: boolean;
  view_accounts_payable: boolean;
  create_expense: boolean;
  edit_expense: boolean;
  delete_expense: boolean;
  pay_accounts: boolean;
  view_reports: boolean;
}

export function resolveFinanceGranularFromLegacy(map: ModulePermissionsMap): FinanceGranularResolved {
  const f = map.finance;
  const cv = f?.can_view === true;
  const cc = f?.can_create === true;
  const ce = f?.can_edit === true;
  const cd = f?.can_delete === true;
  const ex = (f?.module_extras ?? {}) as Record<string, unknown>;

  return {
    view: cv,
    view_dashboard_cards: cv && extraFlag(ex, 'finance_view_dashboard_cards', true),
    view_revenue: cv && extraFlag(ex, 'finance_view_revenue', true),
    view_expenses: cv && extraFlag(ex, 'finance_view_expenses', true),
    view_profit: cv && extraFlag(ex, 'finance_view_profit', true),
    view_accounts_payable: cv && extraFlag(ex, 'finance_view_accounts_payable', true),
    create_expense: cc && extraFlag(ex, 'finance_create_expense', true),
    edit_expense: ce && extraFlag(ex, 'finance_edit_expense', true),
    delete_expense: cd && extraFlag(ex, 'finance_delete_expense', true),
    pay_accounts: ce && extraFlag(ex, 'finance_pay_accounts', true),
    view_reports: cv && extraFlag(ex, 'finance_view_reports', true),
  };
}

export interface BillingGranularResolved {
  view: boolean;
  view_invoices: boolean;
  create_invoice: boolean;
  edit_invoice: boolean;
  cancel_invoice: boolean;
  delete_invoice: boolean;
  send_invoice: boolean;
  mark_paid: boolean;
  refund_invoice: boolean;
  view_subscriptions: boolean;
  create_subscription: boolean;
  edit_subscription: boolean;
  cancel_subscription: boolean;
  view_charges: boolean;
  create_charge: boolean;
  edit_charge: boolean;
  cancel_charge: boolean;
  /** Escopo completo de listagens (contrastado com view_own). */
  view_all: boolean;
  /** Escopo restrito — ver docs se o modelo não expõe created_by em faturas. */
  view_own: boolean;
}

export function resolveBillingGranularFromLegacy(map: ModulePermissionsMap): BillingGranularResolved {
  const b = map.billing;
  const cv = b?.can_view === true;
  const cc = b?.can_create === true;
  const ce = b?.can_edit === true;
  const cd = b?.can_delete === true;
  const ex = (b?.module_extras ?? {}) as Record<string, unknown>;

  return {
    view: cv,
    view_invoices: cv && extraFlag(ex, 'billing_view_invoices', true),
    create_invoice: cc && extraFlag(ex, 'billing_create_invoice', true),
    edit_invoice: ce && extraFlag(ex, 'billing_edit_invoice', true),
    cancel_invoice: ce && extraFlag(ex, 'billing_cancel_invoice', true),
    delete_invoice: cd && extraFlag(ex, 'billing_delete_invoice', true),
    send_invoice: ce && extraFlag(ex, 'billing_send_invoice', true),
    mark_paid: ce && extraFlag(ex, 'billing_mark_paid', true),
    refund_invoice: ce && extraFlag(ex, 'billing_refund_invoice', true),
    view_subscriptions: cv && extraFlag(ex, 'billing_view_subscriptions', true),
    create_subscription: cc && extraFlag(ex, 'billing_create_subscription', true),
    edit_subscription: ce && extraFlag(ex, 'billing_edit_subscription', true),
    cancel_subscription: ce && extraFlag(ex, 'billing_cancel_subscription', true),
    view_charges: cv && extraFlag(ex, 'billing_view_charges', true),
    create_charge: cc && extraFlag(ex, 'billing_create_charge', true),
    edit_charge: ce && extraFlag(ex, 'billing_edit_charge', true),
    cancel_charge: ce && extraFlag(ex, 'billing_cancel_charge', true),
    /** Listagens por tenant; flag legada `billing_view_own_only` ignorada até haver autor/responsável no modelo. */
    view_all: cv,
    view_own: false,
  };
}

export interface TasksGranularResolved {
  view: boolean;
  view_all: boolean;
  view_own: boolean;
  create: boolean;
  edit: boolean;
  edit_own: boolean;
  delete: boolean;
  delete_own: boolean;
}

/** Escopo “próprio” = criador (`user_id`) ou responsável (`assignee_id`). */
export function resolveTasksGranularFromLegacy(map: ModulePermissionsMap): TasksGranularResolved {
  const t = map.tasks;
  const cv = t?.can_view === true;
  const cc = t?.can_create === true;
  const ce = t?.can_edit === true;
  const cd = t?.can_delete === true;
  const ex = (t?.module_extras ?? {}) as Record<string, unknown>;
  const listOwnOnly = extraFlag(ex, 'tasks_view_own_only', false);
  return {
    view: cv,
    view_all: cv && !listOwnOnly,
    view_own: cv && listOwnOnly,
    create: cc,
    edit: ce,
    edit_own: ce && t?.edit_own_only === true,
    delete: cd,
    delete_own: cd && t?.delete_own_only === true,
  };
}

export interface ClientsGranularResolved {
  view: boolean;
  view_all: boolean;
  view_own: boolean;
  create: boolean;
  edit: boolean;
  edit_own: boolean;
  delete: boolean;
  delete_own: boolean;
  export: boolean;
  import: boolean;
  merge: boolean;
  view_sensitive_fields: boolean;
}

export function resolveClientsGranularFromLegacy(map: ModulePermissionsMap): ClientsGranularResolved {
  const c = map.clients;
  const cv = c?.can_view === true;
  const cc = c?.can_create === true;
  const ce = c?.can_edit === true;
  const cd = c?.can_delete === true;
  const ex = (c?.module_extras ?? {}) as Record<string, unknown>;
  const listOwnOnly = extraFlag(ex, 'clients_view_own_only', false);
  return {
    view: cv,
    view_all: cv && !listOwnOnly,
    view_own: cv && listOwnOnly,
    create: cc,
    edit: ce,
    edit_own: ce && c?.edit_own_only === true,
    delete: cd,
    delete_own: cd && c?.delete_own_only === true,
    export: cv && extraFlag(ex, 'clients_export', true),
    import: cc && extraFlag(ex, 'clients_import', true),
    merge: ce && extraFlag(ex, 'clients_merge', false),
    view_sensitive_fields: cv && extraFlag(ex, 'clients_view_sensitive_fields', true),
  };
}

export interface LeadsGranularResolved {
  view: boolean;
  view_all: boolean;
  view_own: boolean;
  create: boolean;
  edit: boolean;
  edit_own: boolean;
  delete: boolean;
  delete_own: boolean;
  convert_to_client: boolean;
  export: boolean;
  import: boolean;
}

export function resolveLeadsGranularFromLegacy(map: ModulePermissionsMap): LeadsGranularResolved {
  const l = map.leads;
  const cv = l?.can_view === true;
  const cc = l?.can_create === true;
  const ce = l?.can_edit === true;
  const cd = l?.can_delete === true;
  const ex = (l?.module_extras ?? {}) as Record<string, unknown>;
  const listOwnOnly = extraFlag(ex, 'leads_view_own_only', false);
  return {
    view: cv,
    view_all: cv && !listOwnOnly,
    view_own: cv && listOwnOnly,
    create: cc,
    edit: ce,
    edit_own: ce && l?.edit_own_only === true,
    delete: cd,
    delete_own: cd && l?.delete_own_only === true,
    convert_to_client: ce && extraFlag(ex, 'leads_convert_to_client', true),
    export: cv && extraFlag(ex, 'leads_export', true),
    import: cc && extraFlag(ex, 'leads_import', true),
  };
}

export interface ProposalsGranularResolved {
  view: boolean;
  view_all: boolean;
  view_own: boolean;
  create: boolean;
  edit: boolean;
  edit_own: boolean;
  delete: boolean;
  delete_own: boolean;
  send: boolean;
  approve: boolean;
  convert_to_contract: boolean;
  convert_to_invoice: boolean;
  manage_integrations: boolean;
}

export function resolveProposalsGranularFromLegacy(map: ModulePermissionsMap): ProposalsGranularResolved {
  const p = map.proposals;
  const cv = p?.can_view === true;
  const cc = p?.can_create === true;
  const ce = p?.can_edit === true;
  const cd = p?.can_delete === true;
  const ex = (p?.module_extras ?? {}) as Record<string, unknown>;
  const listOwnOnly = extraFlag(ex, 'proposals_view_own_only', false);
  const manageInt = p?.module_extras?.proposals_manage_integrations === true;
  return {
    view: cv,
    view_all: cv && !listOwnOnly,
    view_own: cv && listOwnOnly,
    create: cc,
    edit: ce,
    edit_own: ce && p?.edit_own_only === true,
    delete: cd,
    delete_own: cd && p?.delete_own_only === true,
    send: ce && extraFlag(ex, 'proposals_send', true),
    approve: ce && extraFlag(ex, 'proposals_approve', false),
    convert_to_contract: ce && extraFlag(ex, 'proposals_convert_contract', true),
    convert_to_invoice: ce && extraFlag(ex, 'proposals_convert_invoice', true),
    manage_integrations: ce && manageInt,
  };
}

export interface ContractsGranularResolved {
  view: boolean;
  view_all: boolean;
  view_own: boolean;
  create: boolean;
  edit: boolean;
  edit_own: boolean;
  delete: boolean;
  delete_own: boolean;
  send: boolean;
  request_signature: boolean;
  cancel: boolean;
  view_signed_files: boolean;
}

export function resolveContractsGranularFromLegacy(map: ModulePermissionsMap): ContractsGranularResolved {
  const c = map.contracts;
  const cv = c?.can_view === true;
  const cc = c?.can_create === true;
  const ce = c?.can_edit === true;
  const cd = c?.can_delete === true;
  const ex = (c?.module_extras ?? {}) as Record<string, unknown>;
  const listOwnOnly = extraFlag(ex, 'contracts_view_own_only', false);
  return {
    view: cv,
    view_all: cv && !listOwnOnly,
    view_own: cv && listOwnOnly,
    create: cc,
    edit: ce,
    edit_own: ce && c?.edit_own_only === true,
    delete: cd,
    delete_own: cd && c?.delete_own_only === true,
    send: ce && extraFlag(ex, 'contracts_send', true),
    request_signature: ce && extraFlag(ex, 'contracts_request_signature', true),
    cancel: ce && extraFlag(ex, 'contracts_cancel', true),
    view_signed_files: cv && extraFlag(ex, 'contracts_view_signed_files', true),
  };
}

export interface DashboardGranularResolved {
  view: boolean;
  view_sales_cards: boolean;
  view_financial_cards: boolean;
  view_attendance_cards: boolean;
  view_tasks_cards: boolean;
  view_projects_cards: boolean;
}

export function resolveDashboardGranularFromLegacy(map: ModulePermissionsMap): DashboardGranularResolved {
  const d = map.dashboard;
  const dv = d?.can_view === true;
  const ex = (d?.module_extras ?? {}) as Record<string, unknown>;

  const fin = moduleView(map, 'finance');
  const bil = moduleView(map, 'billing');

  return {
    view: dv,
    view_sales_cards: dv && extraFlag(ex, 'dashboard_view_sales_cards', true),
    view_financial_cards: fin || bil,
    view_attendance_cards:
      dv && extraFlag(ex, 'dashboard_view_attendance_cards', true) && moduleView(map, 'chat'),
    view_tasks_cards: dv && extraFlag(ex, 'dashboard_view_tasks_cards', true) && moduleView(map, 'tasks'),
    view_projects_cards:
      dv && extraFlag(ex, 'dashboard_view_projects_cards', true) && moduleView(map, 'projects'),
  };
}

export interface HasPermissionKeyOptions {
  isTenantAdmin?: boolean;
}

export function hasPermissionKey(
  map: ModulePermissionsMap,
  key: PermissionCatalogKey,
  opts?: HasPermissionKeyOptions
): boolean {
  if (opts?.isTenantAdmin) return true;

  const g = resolveChatGranularFromLegacy(map);
  const finance = resolveFinanceGranularFromLegacy(map);
  const billing = resolveBillingGranularFromLegacy(map);
  const dash = resolveDashboardGranularFromLegacy(map);
  const cli = resolveClientsGranularFromLegacy(map);
  const ld = resolveLeadsGranularFromLegacy(map);
  const pr = resolveProposalsGranularFromLegacy(map);
  const ct = resolveContractsGranularFromLegacy(map);
  const tk = resolveTasksGranularFromLegacy(map);

  switch (key) {
    case 'dashboard.view':
      return dash.view;
    case 'dashboard.view_sales_cards':
      return dash.view_sales_cards;
    case 'dashboard.view_financial_cards':
      return dash.view_financial_cards;
    case 'dashboard.view_attendance_cards':
      return dash.view_attendance_cards;
    case 'dashboard.view_tasks_cards':
      return dash.view_tasks_cards;
    case 'dashboard.view_projects_cards':
      return dash.view_projects_cards;

    case 'finance.view':
      return finance.view;
    case 'finance.view_dashboard_cards':
      return finance.view_dashboard_cards;
    case 'finance.view_revenue':
      return finance.view_revenue;
    case 'finance.view_expenses':
      return finance.view_expenses;
    case 'finance.view_profit':
      return finance.view_profit;
    case 'finance.view_accounts_payable':
      return finance.view_accounts_payable;
    case 'finance.create_expense':
      return finance.create_expense;
    case 'finance.edit_expense':
      return finance.edit_expense;
    case 'finance.delete_expense':
      return finance.delete_expense;
    case 'finance.pay_accounts':
      return finance.pay_accounts;
    case 'finance.view_reports':
      return finance.view_reports;

    case 'billing.view':
      return billing.view;
    case 'billing.view_invoices':
      return billing.view_invoices;
    case 'billing.create_invoice':
      return billing.create_invoice;
    case 'billing.edit_invoice':
      return billing.edit_invoice;
    case 'billing.cancel_invoice':
      return billing.cancel_invoice;
    case 'billing.delete_invoice':
      return billing.delete_invoice;
    case 'billing.send_invoice':
      return billing.send_invoice;
    case 'billing.mark_paid':
      return billing.mark_paid;
    case 'billing.refund_invoice':
      return billing.refund_invoice;
    case 'billing.view_subscriptions':
      return billing.view_subscriptions;
    case 'billing.create_subscription':
      return billing.create_subscription;
    case 'billing.edit_subscription':
      return billing.edit_subscription;
    case 'billing.cancel_subscription':
      return billing.cancel_subscription;
    case 'billing.view_charges':
      return billing.view_charges;
    case 'billing.create_charge':
      return billing.create_charge;
    case 'billing.edit_charge':
      return billing.edit_charge;
    case 'billing.cancel_charge':
      return billing.cancel_charge;
    case 'billing.view_all':
      return billing.view_all;
    case 'billing.view_own':
      return billing.view_own;

    case 'clients.view':
      return cli.view;
    case 'clients.view_all':
      return cli.view_all;
    case 'clients.view_own':
      return cli.view_own;
    case 'clients.create':
      return cli.create;
    case 'clients.edit':
      return cli.edit;
    case 'clients.edit_own':
      return cli.edit_own;
    case 'clients.delete':
      return cli.delete;
    case 'clients.delete_own':
      return cli.delete_own;
    case 'clients.export':
      return cli.export;
    case 'clients.import':
      return cli.import;
    case 'clients.merge':
      return cli.merge;
    case 'clients.view_sensitive_fields':
      return cli.view_sensitive_fields;

    case 'leads.view':
      return ld.view;
    case 'leads.view_all':
      return ld.view_all;
    case 'leads.view_own':
      return ld.view_own;
    case 'leads.create':
      return ld.create;
    case 'leads.edit':
      return ld.edit;
    case 'leads.edit_own':
      return ld.edit_own;
    case 'leads.delete':
      return ld.delete;
    case 'leads.delete_own':
      return ld.delete_own;
    case 'leads.convert_to_client':
      return ld.convert_to_client;
    case 'leads.export':
      return ld.export;
    case 'leads.import':
      return ld.import;

    case 'proposals.view':
      return pr.view;
    case 'proposals.view_all':
      return pr.view_all;
    case 'proposals.view_own':
      return pr.view_own;
    case 'proposals.create':
      return pr.create;
    case 'proposals.edit':
      return pr.edit;
    case 'proposals.edit_own':
      return pr.edit_own;
    case 'proposals.delete':
      return pr.delete;
    case 'proposals.delete_own':
      return pr.delete_own;
    case 'proposals.send':
      return pr.send;
    case 'proposals.approve':
      return pr.approve;
    case 'proposals.convert_to_contract':
      return pr.convert_to_contract;
    case 'proposals.convert_to_invoice':
      return pr.convert_to_invoice;
    case 'proposals.manage_integrations':
      return pr.manage_integrations;

    case 'contracts.view':
      return ct.view;
    case 'contracts.view_all':
      return ct.view_all;
    case 'contracts.view_own':
      return ct.view_own;
    case 'contracts.create':
      return ct.create;
    case 'contracts.edit':
      return ct.edit;
    case 'contracts.edit_own':
      return ct.edit_own;
    case 'contracts.delete':
      return ct.delete;
    case 'contracts.delete_own':
      return ct.delete_own;
    case 'contracts.send':
      return ct.send;
    case 'contracts.request_signature':
      return ct.request_signature;
    case 'contracts.cancel':
      return ct.cancel;
    case 'contracts.view_signed_files':
      return ct.view_signed_files;

    case 'tasks.view':
      return tk.view;
    case 'tasks.view_all':
      return tk.view_all;
    case 'tasks.view_own':
      return tk.view_own;
    case 'tasks.create':
      return tk.create;
    case 'tasks.edit':
      return tk.edit;
    case 'tasks.edit_own':
      return tk.edit_own;
    case 'tasks.delete':
      return tk.delete;
    case 'tasks.delete_own':
      return tk.delete_own;

    case 'chat.view':
      return g.view;
    case 'chat.view_queue':
      return g.view_queue;
    case 'chat.view_own_conversations':
      return g.view_own_conversations;
    case 'chat.view_all_conversations':
      return g.view_all_conversations;
    case 'chat.send_message':
      return g.send_message;
    case 'chat.take_attendance':
      return g.take_attendance;
    case 'chat.transfer_attendance':
      return g.transfer_attendance;
    case 'chat.close_attendance':
      return g.close_attendance;
    case 'chat.reopen_attendance':
      return g.reopen_attendance;
    case 'chat.assign_to_user':
      return g.assign_to_user;
    case 'chat.manage_tags':
      return g.manage_tags;
    case 'chat.create_invoice_from_chat':
      return g.create_invoice_from_chat;
    case 'chat.create_proposal_from_chat':
      return g.create_proposal_from_chat;
    case 'chat.create_contract_from_chat':
      return g.create_contract_from_chat;
    case 'chat.schedule_from_chat':
      return g.schedule_from_chat;
    case 'chat.manage_groups':
      return g.manage_groups;
    case 'chat.create_group':
      return g.create_group;
    case 'chat.manage_group_participants':
      return g.manage_group_participants;
    case 'chat.manage_group_settings':
      return g.manage_group_settings;
    case 'chat.manage_queues':
      return g.manage_queues;
    case 'chat.manage_teams':
      return g.manage_teams;
    case 'chat.view_metrics':
      return g.view_metrics;
    case 'chat.manage_automation':
      return g.manage_automation;
    default:
      return false;
  }
}
