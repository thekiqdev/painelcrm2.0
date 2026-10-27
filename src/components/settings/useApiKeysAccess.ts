import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  API_KEYS_QUERY_KEY,
  isApiKeysDisabledError,
  listTenantApiKeys,
} from '@/services/tenantApiKeys';

export function useApiKeysAccess() {
  const { user } = useAuth();
  const isAdmin = user?.is_tenant_admin === true;
  const query = useQuery({
    queryKey: API_KEYS_QUERY_KEY,
    queryFn: listTenantApiKeys,
    enabled: isAdmin,
    retry: false,
  });

  const flagOff = query.isError && isApiKeysDisabledError(query.error);
  return {
    isAdmin,
    query,
    checking: isAdmin && query.isLoading,
    visible: query.isSuccess,
    flagOff,
    failed: query.isError && !flagOff,
  };
}
