import { useAuth } from '@/contexts/AuthContext';

/**
 * Retorna se a feature está habilitada para o usuário atual (plano/tenant).
 * Super admin tem todas as features. Se features ainda não carregaram, retorna false.
 */
export function useFeatureFlag(featureKey: string): boolean {
  const { features } = useAuth();
  return features?.includes(featureKey) ?? false;
}
