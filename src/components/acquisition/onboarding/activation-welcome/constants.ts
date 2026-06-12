import { Building2, MessageCircle, User, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const ACTIVATION_WELCOME_HEADLINE = {
  title: 'Sua operação está pronta para configuração',
  subtitle: 'Sua operação está pronta para configuração',
};

export const ACTIVATION_WELCOME_GREETING = {
  eyebrow: 'Centro de preparação',
  title: (firstName: string) => (firstName ? `Bem-vindo, ${firstName}` : 'Bem-vindo'),
};

export const ACTIVATION_MOBILE_GREETING = {
  title: (firstName: string) => (firstName ? `Olá, ${firstName}!` : 'Olá!'),
  subtitle: 'Sua operação está pronta. Vamos montar sua empresa em poucos passos.',
};

export const ACTIVATION_MOBILE_OPERATION_STATUS_TITLE = 'Sua empresa está sendo preparada';

export const ACTIVATION_MOBILE_FOOTER_ESTIMATE = '3 minutos para concluir';

export const ACTIVATION_QUICK_STATUS = [
  'Acesso criado',
  'Dados validados',
  'Avaliação disponível',
] as const;

export const ACTIVATION_CTA = {
  label: 'Entrar no workspace',
};

/** Sprint O2.3 — premium workspace reveal */
export const PREMIUM_WORKSPACE_REVEAL = {
  heroSubtitle: 'Seu ambiente foi criado com sucesso e está pronto para começar.',
  environmentTitle: 'Seu ambiente já está preparado',
  bottomMessage: 'Tudo está pronto para iniciar sua operação.',
} as const;

export const ACTIVATION_CTA_SECTION = {
  title: 'Tudo pronto para começar',
  description: 'Sua operação será configurada em poucos minutos.',
  estimatedTime: '3 minutos',
};

export const ACTIVATION_JOURNEY_TITLE = 'O que falta para ativar sua operação';

export const ACTIVATION_TIMELINE_TITLE = 'O que acontece agora';

export const ACTIVATION_TIMELINE_ESTIMATE = '3 minutos';

export const ACTIVATION_OPERATION_STATUS_TITLE = 'Status da sua operação';

export const ACTIVATION_OPERATION_SUMMARY_TITLE = 'Sua operação inicial';

export const ACTIVATION_TRIAL_BADGE = 'Avaliação gratuita ativa';

export const PROFILE_ROLE_LABEL = 'Administrador inicial';

export type ActivationJourneyStepId = 'profile' | 'company' | 'users' | 'whatsapp';

export type OperationPillarId = 'company' | 'users' | 'whatsapp';

export type OperationPillarStatus = 'pending' | 'in_progress' | 'configured';

export const ACTIVATION_JOURNEY_STEPS: {
  id: ActivationJourneyStepId;
  label: string;
  icon: LucideIcon;
}[] = [
  { id: 'profile', label: 'Perfil criado', icon: User },
  { id: 'company', label: 'Empresa', icon: Building2 },
  { id: 'users', label: 'Equipe', icon: Users },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
];

export const ACTIVATION_TIMELINE_STEPS: { id: OperationPillarId; label: string; icon: LucideIcon }[] = [
  { id: 'company', label: 'Empresa', icon: Building2 },
  { id: 'users', label: 'Equipe', icon: Users },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
];

export const OPERATION_PILLAR_LABELS: Record<
  OperationPillarId,
  { title: string; pendingHint: string }
> = {
  company: { title: 'Empresa', pendingHint: 'Nome e identidade visual não definidos' },
  users: { title: 'Equipe', pendingHint: 'Nenhum membro convidado' },
  whatsapp: { title: 'WhatsApp', pendingHint: 'Canal ainda não conectado' },
};

export const PROFILE_STATUS_BADGES = [
  { id: 'admin', label: 'Administrador inicial', tone: 'primary' as const },
  { id: 'ready', label: 'Pronto para ativação', tone: 'neutral' as const },
];

export function deriveOperationPillarStatuses(input: {
  completedSteps: string[];
  currentStep?: OperationPillarId | ActivationJourneyStepId | null;
}): Record<OperationPillarId, OperationPillarStatus> {
  const { completedSteps, currentStep } = input;
  const pillars: OperationPillarId[] = ['company', 'users', 'whatsapp'];
  const result = {} as Record<OperationPillarId, OperationPillarStatus>;

  for (const id of pillars) {
    if (completedSteps.includes(id)) {
      result[id] = 'configured';
    } else if (currentStep === id) {
      result[id] = 'in_progress';
    } else {
      result[id] = 'pending';
    }
  }
  return result;
}
