/**
 * Lista fixa de feature keys do sistema.
 * Usado para validar feature_key em plan_features e para listar no Super Admin.
 */
export const FEATURE_KEYS = [
  'dashboard',
  'leads',
  'clients',
  'funnels',
  'products',
  'contracts',
  'projects',
  'tickets',
  'chat',
  'invoices',
  'expenses',
  'proposals',
  'tasks',
  'reports',
  'settings',
  'message_templates',
  'whatsapp',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const FEATURE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  leads: 'Leads',
  clients: 'Clientes',
  funnels: 'Funil de Vendas',
  products: 'Produtos',
  contracts: 'Contratos',
  projects: 'Projetos',
  tickets: 'Tickets',
  chat: 'Chat / WhatsApp',
  invoices: 'Faturas',
  expenses: 'Despesas',
  proposals: 'Propostas',
  tasks: 'Tarefas',
  reports: 'Relatórios',
  settings: 'Configurações',
  message_templates: 'Modelos de mensagem',
  whatsapp: 'Integração WhatsApp',
};

export function isValidFeatureKey(key: string): key is FeatureKey {
  return (FEATURE_KEYS as readonly string[]).includes(key);
}
