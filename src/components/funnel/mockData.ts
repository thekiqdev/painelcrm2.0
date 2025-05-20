
import { SalesFunnel, Deal, Client, ClientTag, Rule } from './types';

// Initial example funnel
export const initialFunnel: SalesFunnel = {
  id: "funnel-1",
  name: "Funil de Clientes Padrão",
  description: "Funil de vendas padrão para clientes",
  type: "clients",
  isDefault: true,
  createdAt: "15/05/2023",
  stages: [
    { id: "stage-1", name: "Prospecção", color: "bg-blue-500", order: 0, funnelId: "funnel-1" },
    { id: "stage-2", name: "Qualificação", color: "bg-purple-500", order: 1, funnelId: "funnel-1" },
    { id: "stage-3", name: "Proposta", color: "bg-amber-500", order: 2, funnelId: "funnel-1" },
    { id: "stage-4", name: "Negociação", color: "bg-green-500", order: 3, funnelId: "funnel-1" },
    { id: "stage-5", name: "Fechado", color: "bg-emerald-500", order: 4, funnelId: "funnel-1" },
    { id: "stage-6", name: "Perdido", color: "bg-red-500", order: 5, funnelId: "funnel-1" }
  ]
};

// Example deals data
export const initialDeals: Deal[] = [
  {
    id: "D001",
    title: "Implementação de Sistema ERP",
    client: "ABC Tecnologia",
    amount: "R$ 58.000,00",
    probability: 20,
    dueDate: "15/06/2023",
    stage: "stage-1",
    funnelId: "funnel-1"
  },
  {
    id: "D002",
    title: "Projeto de Marketing Digital",
    client: "Construtora XYZ",
    amount: "R$ 25.000,00",
    probability: 50,
    dueDate: "28/06/2023",
    stage: "stage-1",
    funnelId: "funnel-1"
  },
  {
    id: "D003",
    title: "Consultoria Estratégica",
    client: "Lima & Associados",
    amount: "R$ 45.000,00",
    probability: 75,
    dueDate: "10/07/2023",
    stage: "stage-2",
    funnelId: "funnel-1"
  },
  {
    id: "D004",
    title: "Renovação de Licenças",
    client: "Tech Solutions",
    amount: "R$ 12.500,00",
    probability: 90,
    dueDate: "30/06/2023",
    stage: "stage-3",
    funnelId: "funnel-1"
  },
  {
    id: "D005",
    title: "Desenvolvimento de Website",
    client: "Consultoria Global",
    amount: "R$ 35.000,00",
    probability: 60,
    dueDate: "15/07/2023",
    stage: "stage-4",
    funnelId: "funnel-1"
  },
];

// Mock clients data
export const mockClients: Client[] = [
  { 
    id: "C001", 
    name: "João Silva", 
    company: "Tech Solutions", 
    email: "joao@techsolutions.com", 
    phone: "(11) 98765-4321", 
    status: "Ativo", 
    stage: "stage-1",
    tags: ["client-tag-1", "client-tag-3"]
  },
  { 
    id: "C002", 
    name: "Maria Oliveira", 
    company: "Consultoria Global", 
    email: "maria@consultoriaglobal.com", 
    phone: "(11) 91234-5678", 
    status: "Potencial", 
    stage: "stage-1",
    tags: ["client-tag-2"]
  },
  { 
    id: "C003", 
    name: "Carlos Santos", 
    company: "ABC Tecnologia", 
    email: "carlos@abctech.com", 
    phone: "(21) 99876-5432", 
    status: "Em Negociação", 
    stage: "stage-2",
    tags: []
  },
  { 
    id: "C004", 
    name: "Ana Pereira", 
    company: "Lima & Associados", 
    email: "ana@lima.com", 
    phone: "(11) 97777-8888", 
    status: "Ativo", 
    stage: "stage-3",
    tags: ["client-tag-1"]
  },
];

// Client tags
export const clientTags: ClientTag[] = [
  { id: "client-tag-1", name: "VIP", color: "#FF6B6B" },
  { id: "client-tag-2", name: "Novo", color: "#4ECDC4" },
  { id: "client-tag-3", name: "Recorrente", color: "#FFD166" },
];

// Rules data
export const rules: Rule[] = [];

// Sources options for rule creation
export const sourcesOptions = [
  { value: "website", label: "Website" },
  { value: "social", label: "Redes Sociais" },
  { value: "referral", label: "Indicação" },
  { value: "direct", label: "Direto" },
  { value: "ads", label: "Anúncios" },
];
