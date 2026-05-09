/**
 * Preload dos chunks das rotas – mesmo path do lazy() no App.tsx.
 * Chamar no onMouseEnter dos links do menu para a página abrir na hora ao clicar.
 */
export const routePreload = {
  dashboard: () => import("./pages/Dashboard"),
  clients: () => import("./pages/Clients"),
  leads: () => import("./pages/Leads"),
  funnel: () => import("./pages/Funnel"),
  tasks: () => import("./pages/Tasks"),
  agenda: () => import("./pages/Agenda"),
  projects: () => import("./pages/Projects"),
  projectTemplates: () => import("./pages/ProjectTemplates"),
  products: () => import("./pages/Products"),
  orders: () => import("./pages/Orders"),
  /** Configuração da loja pública (rota legada/tenant: `/admin/loja`). */
  storeSettings: () => import("./pages/StoreSettings"),
  proposals: () => import("./pages/Proposals"),
  contracts: () => import("./pages/Contracts"),
  contractTemplates: () => import("./pages/ContractTemplates"),
  contractTemplateForm: () => import("./pages/ContractTemplateFormPage"),
  /** /billing redireciona para /customer-invoices; preload da página de faturas. */
  billing: () => import("./pages/CustomerInvoices"),
  customerInvoices: () => import("./pages/CustomerInvoices"),
  customerInvoiceDetail: () => import("./pages/CustomerInvoiceDetail"),
  crmSubscriptions: () => import("./pages/SubscriptionsList"),
  customerCharges: () => import("./pages/CustomerCharges"),
  finance: () => import("./pages/finance/FinanceLayout"),
  settings: () => import("./pages/settings/SettingsIndex"),
  chat: () => import("./pages/Chat"),
  chatKanban: () => import("./pages/ChatKanbanPage"),
  tickets: () => import("./pages/Tickets"),
  meuPlano: () => import("./pages/MeuPlano"),
} as const;
