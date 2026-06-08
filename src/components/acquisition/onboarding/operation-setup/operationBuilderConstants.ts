import type { LucideIcon } from 'lucide-react';
import {
  Bot,
  Layers,
  MessageCircle,
  Radio,
  Sparkles,
  Users,
  Workflow,
  Zap,
} from 'lucide-react';

export const TEAM_PRESETS = [1, 3, 5, 10] as const;

export const TEAM_VALUE_MESSAGES = [
  'Atendimento simultâneo por operador',
  'Permissões individuais no workspace',
  'Métricas e desempenho por pessoa',
  'Login próprio para cada membro',
] as const;

export type ResourceStatus = 'active' | 'preview' | 'coming_soon';

export type OperationResource = {
  id: string;
  name: string;
  status: ResourceStatus;
  icon: LucideIcon;
};

export const OPERATION_RESOURCES: OperationResource[] = [
  { id: 'crm', name: 'CRM operacional', status: 'active', icon: Zap },
  { id: 'whatsapp', name: 'WhatsApp integrado', status: 'active', icon: MessageCircle },
  { id: 'automations', name: 'Automações', status: 'active', icon: Workflow },
  { id: 'ai', name: 'IA Assist', status: 'preview', icon: Bot },
  { id: 'multi', name: 'Multi instâncias', status: 'coming_soon', icon: Layers },
];

export const WHATSAPP_SETUP_OPTIONS = [
  {
    id: 'included',
    title: '1 canal incluso',
    description: 'WhatsApp comercial na ativação do workspace',
    status: 'active' as const,
    icon: MessageCircle,
  },
  {
    id: 'multi',
    title: 'Multi canais',
    description: 'Vários números por operação — em breve',
    status: 'soon' as const,
    icon: Radio,
  },
  {
    id: 'omni',
    title: 'Omnichannel ready',
    description: 'Arquitetura preparada para expansão de canais',
    status: 'ready' as const,
    icon: Sparkles,
  },
];

export const MOBILE_RESOURCE_CHIPS = [
  { id: 'crm', label: 'CRM', tone: 'active' as const },
  { id: 'wa', label: 'WhatsApp', tone: 'active' as const },
  { id: 'ai', label: 'IA Preview', tone: 'preview' as const },
  { id: 'auto', label: 'Automação', tone: 'active' as const },
];

export const RESOURCE_STATUS_LABEL: Record<ResourceStatus, string> = {
  active: 'Ativo',
  preview: 'Preview',
  coming_soon: 'Em breve',
};
