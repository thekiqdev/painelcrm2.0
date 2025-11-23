
import { useAuth } from '@/contexts/AuthContext';

export function useCurrentUser() {
  const { user, loading } = useAuth();

  return { user, loading };
}
