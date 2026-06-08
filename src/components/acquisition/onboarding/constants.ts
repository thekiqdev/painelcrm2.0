import type { AcquisitionOnboardingStepId } from './types';
import { CreditCard, MessageCircle, Rocket, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type OnboardingStepDef = {
  id: AcquisitionOnboardingStepId;
  label: string;
  short: string;
  description: string;
  icon: LucideIcon;
};

/** Contato → Plano → Ativar → Operação (pós-checkout). */
export const ONBOARDING_STEPS: OnboardingStepDef[] = [
  {
    id: 'lead',
    label: 'Lead',
    short: 'Contato',
    description: 'Seu acesso inicial',
    icon: MessageCircle,
  },
  {
    id: 'plan',
    label: 'Plano',
    short: 'Operação',
    description: 'Monte sua operação',
    icon: CreditCard,
  },
  {
    id: 'conversion',
    label: 'Conversão',
    short: 'Ativar',
    description: 'Preparar workspace',
    icon: Sparkles,
  },
  {
    id: 'onboarding',
    label: 'Onboarding',
    short: 'Operação',
    description: 'Workspace e onboarding',
    icon: Rocket,
  },
];

export const ONBOARDING_HEADLINES: Record<
  Exclude<AcquisitionOnboardingStepId, 'onboarding'>,
  { title: string; subtitle: string }
> = {
  lead: {
    title: 'Comece sua operação inteligente',
    subtitle: 'Informe WhatsApp e nome — em seguida definimos e-mail e senha de acesso.',
  },
  plan: {
    title: 'Monte sua operação',
    subtitle: 'Estruture equipe, canais e recursos do workspace — ativação vem na próxima etapa.',
  },
  conversion: {
    title: 'Sua operação está pronta',
    subtitle: 'Agora vamos finalizar a configuração para colocar seu workspace em produção.',
  },
};

export const ONBOARDING_LEAD_CREDENTIALS_HEADLINE = {
  title: 'Seu acesso ao workspace',
  subtitle: 'Use este e-mail e senha para entrar após iniciar a avaliação.',
};

export const ONBOARDING_CTA_LABELS: Record<'lead' | 'plan', string> = {
  lead: 'Preparar meu workspace',
  plan: 'Continuar ativação',
};

export const ONBOARDING_KICKOFF_PATH = '/onboarding/kickoff';
