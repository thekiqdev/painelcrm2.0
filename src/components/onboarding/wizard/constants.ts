import { Building2, MessageCircle, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type OperationalWizardStepId = 'company' | 'users' | 'whatsapp';

export const OPERATIONAL_WIZARD_STEPS: {
  id: OperationalWizardStepId;
  label: string;
  short: string;
  icon: LucideIcon;
  headline: string;
  subtitle: string;
}[] = [
  {
    id: 'company',
    label: 'Empresa',
    short: 'Empresa',
    icon: Building2,
    headline: 'Identidade da sua operação',
    subtitle: 'Nome e logos — o que clientes e equipe vão reconhecer no workspace.',
  },
  {
    id: 'users',
    label: 'Equipe',
    short: 'Equipe',
    icon: Users,
    headline: 'Quem opera com você',
    subtitle: 'Convide membros agora ou pule e configure depois no painel.',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    short: 'Canal',
    icon: MessageCircle,
    headline: 'Sua operação está pronta',
    subtitle: 'Falta apenas conectar seu primeiro canal para começar a atender.',
  },
];

export const FOUNDATION_ROLES = [
  { value: 'admin', label: 'Administrador' },
  { value: 'member', label: 'Operador' },
  { value: 'viewer', label: 'Visualizador' },
] as const;
