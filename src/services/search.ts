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

export class SearchService {
  async search(
    query: string,
    types?: string[]
  ): Promise<SearchResult[]> {
    const typesParam = types && types.length > 0 ? types.join(',') : undefined;
    const url = typesParam
      ? `/api/search?q=${encodeURIComponent(query)}&types=${encodeURIComponent(typesParam)}`
      : `/api/search?q=${encodeURIComponent(query)}`;
    
    const response = await apiClient.get<SearchResult[]>(url);
    if (response.error) throw new Error(response.error);
    return response.data || [];
  }
}

export const searchService = new SearchService();

