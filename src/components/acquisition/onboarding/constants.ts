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

/** Sprint E1 — primeira etapa: teste fechado (somente WhatsApp). */
export const ONBOARDING_LEAD_ACCESS_HEADLINE = {
  title: '🔒 TESTE FECHADO',
  subtitle: 'As próximas vagas estão sendo liberadas gradualmente.',
  kicker: 'Solicite seu acesso ao PainelCRM',
};

export const ONBOARDING_LEAD_VERIFICATION_HEADLINE = {
  title: 'Confirmar acesso',
  subtitle: 'Digite o código recebido para continuar.',
};

export const ONBOARDING_LEAD_CREDENTIALS_HEADLINE = {
  title: 'Seu acesso ao workspace',
  subtitle: 'Informe seu nome, e-mail e senha para concluir a solicitação.',
};

export const ONBOARDING_CTA_ACCESS_REQUEST = 'Receber código de acesso';

export const ONBOARDING_CTA_LABELS: Record<'lead' | 'plan', string> = {
  lead: 'Preparar meu workspace',
  plan: 'Continuar ativação',
};

/** Nome temporário no capture (API exige name); substituído na etapa de credenciais. */
export const ACQUISITION_CAPTURE_NAME_PLACEHOLDER = 'Solicitante';

export const ONBOARDING_KICKOFF_PATH = '/onboarding/kickoff';
