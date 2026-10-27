import { featureFlagRegistry } from '../platform/featureFlagRegistry.js';

export const I18N_LOCALE_DETECTION_FLAG_KEY = 'i18n.locale_detection_v1' as const;

/**
 * IX2 — detecção automática de idioma/moeda na landing.
 * OFF = visitante anônimo fica em pt-BR + BRL.
 */
export async function isLocaleDetectionEnabled(): Promise<boolean> {
  try {
    const res = await featureFlagRegistry.resolve(I18N_LOCALE_DETECTION_FLAG_KEY, {});
    return res.enabled === true;
  } catch {
    return false;
  }
}
