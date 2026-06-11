/** Sprint E1.3 — centro vivo de preparação (sem duplicar menu lateral). */

export type ActivationTimelineStage = 'contact' | 'operation' | 'prepare_workspace' | 'final';

export type ActivationLiveState = 'future' | 'in_progress' | 'completed';

export type ActivationTimelineItemId =
  | 'whatsapp_access'
  | 'admin_defined'
  | 'operation_personalized'
  | 'initial_users'
  | 'whatsapp_channel'
  | 'workspace'
  | 'crm_operational'
  | 'recovery_onboarding'
  | 'automations';

export type ActivationTimelineItem = {
  id: ActivationTimelineItemId;
  labelFuture: string;
  labelInProgress: string;
  labelCompleted: string;
};

export const ACTIVATION_TIMELINE_ITEMS: ActivationTimelineItem[] = [
  {
    id: 'whatsapp_access',
    labelFuture: 'WhatsApp de acesso',
    labelInProgress: 'Validando WhatsApp de acesso',
    labelCompleted: 'WhatsApp de acesso validado',
  },
  {
    id: 'admin_defined',
    labelFuture: 'Administrador principal',
    labelInProgress: 'Definindo administrador principal',
    labelCompleted: 'Administrador principal definido',
  },
  {
    id: 'operation_personalized',
    labelFuture: 'Operação personalizada',
    labelInProgress: 'Preparando configuração operacional',
    labelCompleted: 'Operação personalizada',
  },
  {
    id: 'initial_users',
    labelFuture: 'Usuários iniciais',
    labelInProgress: 'Configurando usuários iniciais',
    labelCompleted: 'Usuários iniciais configurados',
  },
  {
    id: 'whatsapp_channel',
    labelFuture: 'Canal WhatsApp',
    labelInProgress: 'Incluindo canal WhatsApp',
    labelCompleted: 'Canal WhatsApp incluído',
  },
  {
    id: 'workspace',
    labelFuture: 'Workspace',
    labelInProgress: 'Criando workspace',
    labelCompleted: 'Workspace criado',
  },
  {
    id: 'crm_operational',
    labelFuture: 'CRM operacional',
    labelInProgress: 'Habilitando CRM operacional',
    labelCompleted: 'CRM operacional habilitado',
  },
  {
    id: 'recovery_onboarding',
    labelFuture: 'Recovery e onboarding',
    labelInProgress: 'Preparando recovery e onboarding',
    labelCompleted: 'Recovery e onboarding',
  },
];

const STAGE_ITEM_ORDER: Record<ActivationTimelineStage, ActivationTimelineItemId[]> = {
  contact: [
    'whatsapp_access',
    'admin_defined',
    'operation_personalized',
    'workspace',
    'crm_operational',
    'recovery_onboarding',
  ],
  operation: [
    'whatsapp_access',
    'admin_defined',
    'operation_personalized',
    'whatsapp_channel',
    'workspace',
    'crm_operational',
    'recovery_onboarding',
  ],
  prepare_workspace: [
    'whatsapp_access',
    'admin_defined',
    'operation_personalized',
    'initial_users',
    'workspace',
    'crm_operational',
    'recovery_onboarding',
  ],
  final: ACTIVATION_TIMELINE_ITEMS.map((i) => i.id),
};

export function timelineLiveItemsForStage(stage: ActivationTimelineStage): ActivationTimelineItem[] {
  const ids = STAGE_ITEM_ORDER[stage];
  const byId = new Map(ACTIVATION_TIMELINE_ITEMS.map((i) => [i.id, i]));
  return ids.map((id) => byId.get(id)!).filter(Boolean);
}

export type ActivationTimelineEntry = {
  id: ActivationTimelineItemId;
  state: ActivationLiveState;
  label: string;
};
