/**
 * Grupos WhatsApp (UazAPI): interruptor global em `system_feature_flags` (`whatsapp_groups_enabled`).
 * Por defeito ativo (cache + INSERT na migração); Super Admin altera em Conexões.
 */
import { getSystemFlag } from '../services/systemFeatureFlagsService.js';

export function isWhatsappGroupsEnabled(): boolean {
  return getSystemFlag('whatsapp_groups_enabled');
}
