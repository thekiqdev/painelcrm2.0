import { OperationalAtmospherePanel } from './OperationalAtmospherePanel';

type Props = { activeStepIndex: number; compact?: boolean };

/**
 * @deprecated Use OperationalAtmospherePanel no layout desktop.
 * Mantido para compatibilidade; compact não renderiza preview no mobile.
 */
export function OnboardingVisualPanel({ activeStepIndex, compact = false }: Props) {
  if (compact) return null;
  return <OperationalAtmospherePanel activeStepIndex={activeStepIndex} />;
}
