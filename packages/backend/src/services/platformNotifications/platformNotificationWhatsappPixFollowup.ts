/**
 * Segundo passo opcional no WhatsApp (plataforma): botão PIX copia e cola após o texto transacional.
 * Escopo atual: apenas `platform.billing.charge.created` (fatura SaaS). Extensível ao motor do tenant depois.
 */
import type { Pool } from 'pg';
import { getInvoiceById } from '../invoiceService.js';
import { resolveEffectivePlatformSendPixCopyPasteButton } from './platformNotificationEngineRepository.js';
import { dispatchPlatformWhatsAppPixCopyPasteButton } from '../notificationsEngine/whatsappChannelDispatcher.js';
import { pnLogInfo, pnLogWarn } from './platformNotificationLog.js';

const CHARGE_CREATED = 'platform.billing.charge.created';
const DEFAULT_LOCALE = 'pt-BR';

function platformPublicName(): string {
  return (process.env.APP_PUBLIC_NAME || 'PainelCRM').trim() || 'PainelCRM';
}

export function extractPixCopyPasteFromGatewayMetadata(meta: unknown): string | null {
  if (meta == null || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const rec = meta as Record<string, unknown>;
  const v = rec.pixCopyPaste;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function resolveBillingIdFromDeliveryContext(params: {
  metadata: Record<string, unknown>;
  entityType: string;
  entityId: string | null;
}): string | null {
  const raw = params.metadata['billing_id'];
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (params.entityType === 'tenant_billing' && params.entityId?.trim()) return params.entityId.trim();
  return null;
}

/**
 * Não altera estado da entrega do texto; apenas regista avisos em log se o botão falhar ou não aplicar.
 */
export async function tryPlatformBillingPixWhatsappFollowupAfterText(params: {
  pool: Pool;
  instanceToken: string;
  phone: string;
  eventKey: string;
  channel: string;
  locale?: string;
  metadata: Record<string, unknown>;
  entityType: string;
  entityId: string | null;
}): Promise<void> {
  if (params.channel !== 'whatsapp') return;
  if (params.eventKey !== CHARGE_CREATED) return;

  const locale = params.locale?.trim() || DEFAULT_LOCALE;
  const enabled = await resolveEffectivePlatformSendPixCopyPasteButton(
    params.pool,
    params.eventKey,
    params.channel,
    locale,
  );
  if (!enabled) return;

  const billingId = resolveBillingIdFromDeliveryContext({
    metadata: params.metadata,
    entityType: params.entityType,
    entityId: params.entityId,
  });
  if (!billingId) {
    pnLogWarn('platform_pix_followup_skip_no_billing_id', { event_key: params.eventKey });
    return;
  }

  const row = await getInvoiceById(billingId);
  if (!row) {
    pnLogWarn('platform_pix_followup_skip_billing_missing', { billing_id: billingId });
    return;
  }

  const pix = extractPixCopyPasteFromGatewayMetadata(row.gateway_metadata);
  if (!pix) {
    pnLogInfo('platform_pix_followup_skip_no_pix_payload', { billing_id: billingId });
    return;
  }

  const send = await dispatchPlatformWhatsAppPixCopyPasteButton({
    instanceToken: params.instanceToken,
    phone: params.phone,
    pixCopyPaste: pix,
    pixDisplayName: platformPublicName(),
  });

  if (!send.ok) {
    pnLogWarn('platform_pix_followup_send_failed', {
      billing_id: billingId,
      error: send.error,
    });
    return;
  }

  pnLogInfo('platform_pix_followup_sent', {
    billing_id: billingId,
    provider_message_id: send.providerMessageId,
  });
}
