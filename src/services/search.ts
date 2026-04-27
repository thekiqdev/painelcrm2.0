import { apiClient } from '@/integrations/api/client';

export interface SearchResult {
  id: string;
  name?: string;
  email?: string;
  company?: string;
  title?: string;
  contract_number?: string;
  description?: string;
  type: string;
  route: string;
}

export type GlobalSearchClientRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: string | null;
  kind: string;
  href: string;
  /** Foto WhatsApp (última conversa), alinhado às listas de clientes */
  whatsapp_avatar_url?: string | null;
  avatar_url?: string | null;
  photo?: string | null;
};

export type GlobalSearchLeadRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: string | null;
  kind: string;
  href: string;
  whatsapp_avatar_url?: string | null;
  avatar_url?: string | null;
  photo?: string | null;
};

export type GlobalSearchInvoiceRow = {
  id: string;
  invoice_number: string | null;
  amount_cents: number;
  status: string;
  due_date: string | null;
  client_name: string | null;
  href: string;
};

export type GlobalSearchProposalRow = {
  id: string;
  title: string;
  amount: string;
  status: string;
  valid_until: string | null;
  client_name: string | null;
  href: string;
};

export type GlobalSearchContractRow = {
  id: string;
  title: string | null;
  contract_number: string | null;
  status: string;
  client_name: string | null;
  signature_state: string;
  href: string;
};

export type GlobalSearchTicketRow = {
  id: string;
  ticket_number: string | null;
  subject: string;
  status: string;
  priority: string;
  contact_name: string | null;
  href: string;
};

export type GlobalSearchProjectRow = {
  id: string;
  name: string;
  status: string | null;
  due_date: string | null;
  href: string;
};

export type GlobalSearchProductRow = {
  id: string;
  name: string;
  description: string | null;
  type: string | null;
  status: string | null;
  href: string;
};

export type GlobalSearchGroupedResponse = {
  clients: GlobalSearchClientRow[];
  leads: GlobalSearchLeadRow[];
  invoices: GlobalSearchInvoiceRow[];
  proposals: GlobalSearchProposalRow[];
  contracts: GlobalSearchContractRow[];
  tickets: GlobalSearchTicketRow[];
  projects: GlobalSearchProjectRow[];
  products: GlobalSearchProductRow[];
};

const emptyGrouped = (): GlobalSearchGroupedResponse => ({
  clients: [],
  leads: [],
  invoices: [],
  proposals: [],
  contracts: [],
  tickets: [],
  projects: [],
  products: [],
});

export class SearchService {
  async search(query: string, types?: string[]): Promise<SearchResult[]> {
    const typesParam = types && types.length > 0 ? types.join(',') : undefined;
    const url = typesParam
      ? `/api/search?q=${encodeURIComponent(query)}&types=${encodeURIComponent(typesParam)}`
      : `/api/search?q=${encodeURIComponent(query)}`;

    const response = await apiClient.get<SearchResult[]>(url);
    if (response.error) throw new Error(response.error);
    return response.data || [];
  }

  /**
   * Busca global agrupada (desktop / command palette).
   * `types` — lista de tipos permitidos pelo frontend (ex.: clients,leads,billing mapeado no backend como invoices).
   */
  async searchGlobalGrouped(
    query: string,
    typesCsv: string,
    signal?: AbortSignal,
  ): Promise<GlobalSearchGroupedResponse> {
    const q = query.trim();
    if (q.length < 2) return emptyGrouped();
    const url = `/api/search/global?q=${encodeURIComponent(q)}&types=${encodeURIComponent(typesCsv)}`;
    const response = await apiClient.get<GlobalSearchGroupedResponse>(url, { signal });
    if (response.error) throw new Error(response.error);
    if (!response.data) return emptyGrouped();
    return response.data;
  }
}

export const searchService = new SearchService();
