/**
 * Sprint N5.2 — Envio Ops via Communication Gateway (tenant virtual + instância plataforma).
 */
import { pool } from '../utils/db.js';
import { SUPERADMIN_OPS_KANBAN_TENANT_ID } from '../config/superadminOpsKanban.js';
import { resolvePlatformWhatsAppOutboundReady } from './platformNotifications/platformNotificationDispatchContext.js';
import type { SendCommunicationInput } from '../communication/communicationTypes.js';

export type OpsLeadGatewaySendExtras = {
  opsTenantId?: string;
  acquisitionLeadId: string;
  targetTenantId?: string | null;
};

/**
 * Monta input de sendMessage para acquisition_lead:
 * - tenantId = tenant Ops (overrides N5.2 em platform_feature_flag_overrides)
 * - instanceToken = WhatsApp plataforma (superadmin_settings), quando configurado
 */
export async function buildOpsLeadGatewaySendInput(
  base: Omit<SendCommunicationInput, 'tenantId' | 'instanceToken' | 'senderUserId'>,
  extras: OpsLeadGatewaySendExtras,
): Promise<SendCommunicationInput> {
  const opsTenantId = extras.opsTenantId?.trim() || SUPERADMIN_OPS_KANBAN_TENANT_ID;
  const outbound = await resolvePlatformWhatsAppOutboundReady(pool);

  return {
    ...base,
    tenantId: opsTenantId,
    instanceToken: outbound?.instanceToken,
    metadata: {
      ...(base.metadata ?? {}),
      acquisition_lead_id: extras.acquisitionLeadId,
      target_tenant_id: extras.targetTenantId ?? null,
      ops_gateway_rollout: true,
    },
  };
}
