import { useTranslation } from 'react-i18next';
import type { SettingsNavItem } from '@/config/settingsNavigation';

const CAT: Record<string, string> = {
  Geral: 'cat_general',
  'Usuários e Acesso': 'cat_access',
  Preferências: 'cat_preferences',
  CRM: 'cat_crm',
  Integrações: 'cat_integrations',
  Outros: 'cat_other',
};

const SUB: Record<string, string> = {
  Mensagens: 'sub_messages',
  'Marca e domínio': 'sub_brand',
  'Modelos (CRM)': 'sub_models',
  Recebimentos: 'sub_payments',
  Agenda: 'sub_agenda',
  Arquivos: 'sub_files',
  API: 'sub_api',
};

const MOB: Record<string, string> = {
  Conta: 'mob_account',
  Empresa: 'mob_company',
  Comercial: 'mob_commercial',
  Atendimento: 'mob_service',
  Equipe: 'mob_team',
  Sistema: 'mob_system',
  Preferências: 'mob_preferences',
};

export function useSettingsLabels() {
  const { t } = useTranslation('settings');
  return {
    t,
    title: (item: SettingsNavItem) => t(`sec_${item.id}`),
    description: (item: SettingsNavItem) => t(`sec_${item.id}_desc`),
    category: (name: string) => t(CAT[name] ?? 'cat_other'),
    subcategory: (name: string) => t(SUB[name] ?? name),
    mobileCategory: (name: string) => t(MOB[name] ?? name),
  };
}
