/** Espelha o placeholder do frontend — usado só no capture pós-verificação. */
export const ACQUISITION_CAPTURE_NAME_PLACEHOLDER = 'Solicitante';

export function isAcquisitionCaptureNamePlaceholder(name: string | null | undefined): boolean {
  if (!name?.trim()) return false;
  return name.trim().toLowerCase() === ACQUISITION_CAPTURE_NAME_PLACEHOLDER.toLowerCase();
}

/** Não persiste "Solicitante" como nome definitivo. */
export function normalizeCaptureNameForStorage(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed || isAcquisitionCaptureNamePlaceholder(trimmed)) return null;
  return trimmed;
}

export function hasRealAcquisitionLeadName(name: string | null | undefined): boolean {
  return Boolean(name?.trim()) && !isAcquisitionCaptureNamePlaceholder(name);
}

/**
 * Nome efetivo após capture/re-capture: preserva nome real existente.
 */
export function resolveLeadNameAfterCapture(
  existingName: string | null | undefined,
  incomingName: string,
): string | null {
  const incoming = normalizeCaptureNameForStorage(incomingName);
  if (incoming) return incoming;
  if (hasRealAcquisitionLeadName(existingName)) return existingName!.trim();
  return null;
}
