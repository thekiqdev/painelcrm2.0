/**
 * Tipos do wizard de criação de projetos (Fase 1+).
 * Fonte: PLANO-WIZARD-PROJETOS.md
 *
 * Para adicionar novo tipo de projeto: estender ProjectType aqui e seguir
 * EXTENSIBILIDADE.md (Step1, Step3, backend PROJECT_TYPES).
 */
export type ProjectType = 'simple' | 'areas' | 'advanced' | 'template';

export interface WizardBasicConfig {
  name: string;
  clientId: string | null;
  description: string;
  responsibleIds: string[];
  startDate: string | null;
  endDate: string | null;
  teamId: string | null;
}

export interface WizardSpecificConfig {
  areas?: string[];
  createFirstVersion?: boolean;
  firstVersionName?: string;
  firstVersionDate?: string | null;
}

export interface WizardState {
  step: 1 | 2 | 3 | 4;
  projectType: ProjectType | null;
  templateId: string | null;
  basicConfig: WizardBasicConfig;
  specificConfig: WizardSpecificConfig;
}

export const INITIAL_BASIC_CONFIG: WizardBasicConfig = {
  name: '',
  clientId: null,
  description: '',
  responsibleIds: [],
  startDate: null,
  endDate: null,
  teamId: null,
};

export const INITIAL_SPECIFIC_CONFIG: WizardSpecificConfig = {};

export function getInitialWizardState(): WizardState {
  return {
    step: 1,
    projectType: null,
    templateId: null,
    basicConfig: { ...INITIAL_BASIC_CONFIG },
    specificConfig: { ...INITIAL_SPECIFIC_CONFIG },
  };
}

export const WIZARD_STEP_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: 'Modelo',
  2: 'Configurações básicas',
  3: 'Configuração específica',
  4: 'Revisão',
};
