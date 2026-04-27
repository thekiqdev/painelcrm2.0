import { useEffect, useState } from 'react';
import { searchService, type GlobalSearchGroupedResponse } from '@/services/search';

/**
 * Busca global agrupada (mesmo endpoint que desktop e mobile).
 * Debounce 300 ms, mínimo 2 caracteres, cancela pedidos em curso com AbortSignal.
 */
export function useDebouncedGlobalGroupedSearch(query: string, typesCsv: string) {
  const [groupedSearch, setGroupedSearch] = useState<GlobalSearchGroupedResponse | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (!typesCsv || query.trim().length < 2) {
      setGroupedSearch(null);
      setSearchLoading(false);
      setSearchError(null);
      return;
    }

    const ac = new AbortController();
    setSearchLoading(true);
    setSearchError(null);

    const timer = setTimeout(async () => {
      try {
        const data = await searchService.searchGlobalGrouped(query.trim(), typesCsv, ac.signal);
        if (ac.signal.aborted) return;
        setGroupedSearch(data);
      } catch (err) {
        if (ac.signal.aborted) return;
        setGroupedSearch(null);
        setSearchError(err instanceof Error ? err.message : 'Erro ao buscar');
      } finally {
        if (!ac.signal.aborted) setSearchLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [query, typesCsv]);

  return { groupedSearch, searchLoading, searchError };
}
