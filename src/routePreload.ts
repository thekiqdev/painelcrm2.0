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
  projects: () => import("./pages/Projects"),
  projectTemplates: () => import("./pages/ProjectTemplates"),
  products: () => import("./pages/Products"),
  storeSettings: () => import("./pages/StoreSettings"),
  proposals: () => import("./pages/Proposals"),
  contracts: () => import("./pages/Contracts"),
  /** /billing redireciona para /customer-invoices; preload da página de faturas. */
  billing: () => import("./pages/CustomerInvoices"),
  customerInvoices: () => import("./pages/CustomerInvoices"),
  customerInvoiceDetail: () => import("./pages/CustomerInvoiceDetail"),
  customerCharges: () => import("./pages/CustomerCharges"),
  finance: () => import("./pages/Finance"),
  settings: () => import("./pages/Settings"),
  chat: () => import("./pages/Chat"),
  chatKanban: () => import("./pages/ChatKanbanPage"),
  tickets: () => import("./pages/Tickets"),
  meuPlano: () => import("./pages/MeuPlano"),
} as const;
