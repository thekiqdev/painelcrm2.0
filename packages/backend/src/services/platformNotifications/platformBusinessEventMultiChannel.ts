import type { Pool } from 'pg';
import { pool } from '../../utils/db.js';
import {
  runPlatformTransactionalNotification,
  runPlatformTransactionalEmailDelivery,
} from './platformNotificationEngineOrchestrator.js';
import {
  isPlatformNotificationsEnabled,
  isPlatformNotificationsBusinessEventsEnabled,
} from '../../config/platformNotificationsEnv.js';
import { pnLogInfo, pnLogWarn } from './platformNotificationLog.js';
import {
  loadPrimaryTenantAdminForNotify,
  normalizeTenantAdminEmail,
  resolveRecipientWhatsapp,
} from './platformTenantAdminForNotify.js';

const ACTOR_SYSTEM = { type: 'system', source: 'platform_business_events' };

export type PlatformBusinessChannel = 'whatsapp' | 'email';

export async function publishPlatformBusinessEventMultiChannel(params: {
  pool?: Pool;
  targetTenantId: string;
  eventKey: string;
  entityType: string;
  entityId: string | null;
  idempotencyBaseKey: string;
  mergeContext: Record<string, string>;
  eventOccurredAt: Date | null;
  metadata?: Record<string, unknown>;
  channels?: PlatformBusinessChannel[];
}): Promise<void> {
  const db = params.pool ?? pool;
  const channels = params.channels ?? ['whatsapp', 'email'];

  if (!isPlatformNotificationsEnabled()) {
    return;
  }
  if (!isPlatformNotificationsBusinessEventsEnabled()) {
    return;
  }

  const admin = await loadPrimaryTenantAdminForNotify(db, params.targetTenantId);
  if (!admin) {
    pnLogWarn('platform_business_skip_no_admin', {
      tenant_id: params.targetTenantId,
      event_key: params.eventKey,
    });
    return;
  }

  pnLogWarn('platform_notification_multichannel_started', {
    tenant_id: params.targetTenantId,
    event_key: params.eventKey,
    channels,
    idempotency_base_key: params.idempotencyBaseKey,
  });

  const baseMetadata = {
    engine: 'platform_notifications',
    phase: 3,
    ...(params.metadata ?? {}),
  };

  if (channels.includes('whatsapp')) {
    const phone = resolveRecipientWhatsapp(admin);
    if (!phone) {
      pnLogWarn('platform_notification_whatsapp_skipped', {
        tenant_id: params.targetTenantId,
        event_key: params.eventKey,
        reason: 'no_whatsapp_number',
      });
    } else {
      const res = await runPlatformTransactionalNotification({
        pool: db,
        targetTenantId: params.targetTenantId,
        eventKey: params.eventKey,
        entityType: params.entityType,
        entityId: params.entityId,
        idempotencyKey: `${params.idempotencyBaseKey}:whatsapp`,
        recipientPhone: phone,
        recipientType: 'tenant_admin',
        mergeContext: params.mergeContext,
        eventOccurredAt: params.eventOccurredAt,
        actor: ACTOR_SYSTEM,
        metadata: { ...baseMetadata, channel: 'whatsapp' },
      });

      if (!res.ok) {
        pnLogWarn('platform_business_publish_failed', {
          tenant_id: params.targetTenantId,
          event_key: params.eventKey,
          channel: 'whatsapp',
          error: res.error,
        });
      } else if (res.status === 'skipped') {
        pnLogWarn('platform_notification_whatsapp_skipped', {
          tenant_id: params.targetTenantId,
          event_key: params.eventKey,
          delivery_id: res.deliveryId,
          reason: res.errorMessage ?? 'skipped',
        });
      } else if (res.status === 'sent') {
        pnLogWarn('platform_notification_whatsapp_sent', {
          tenant_id: params.targetTenantId,
          event_key: params.eventKey,
          delivery_id: res.deliveryId,
          duplicate: res.duplicate,
        });
      } else {
        pnLogInfo('platform_business_publish_ok', {
          tenant_id: params.targetTenantId,
          event_key: params.eventKey,
          channel: 'whatsapp',
          delivery_id: res.deliveryId,
          duplicate: res.duplicate,
          status: res.status,
        });
      }
    }
  }

  if (channels.includes('email')) {
    const adminEmail = normalizeTenantAdminEmail(admin.email);
    if (!adminEmail) {
      pnLogWarn('platform_notification_channel_skipped', {
        tenant_id: params.targetTenantId,
        event_key: params.eventKey,
        channel: 'email',
        reason: 'invalid_or_missing_admin_email',
      });
    } else {
      const emailRes = await runPlatformTransactionalEmailDelivery({
        pool: db,
        targetTenantId: params.targetTenantId,
        eventKey: params.eventKey,
        entityType: params.entityType,
        entityId: params.entityId,
        idempotencyKey: `${params.idempotencyBaseKey}:email`,
        toEmail: adminEmail,
        recipientType: 'tenant_admin',
        mergeContext: params.mergeContext,
        eventOccurredAt: params.eventOccurredAt,
        actor: ACTOR_SYSTEM,
        metadata: { ...baseMetadata, channel: 'email' },
      });

      if (!emailRes.ok) {
        pnLogWarn('platform_notification_email_failed', {
          tenant_id: params.targetTenantId,
          event_key: params.eventKey,
          error: emailRes.error,
          details: 'details' in emailRes ? emailRes.details : undefined,
        });
      } else if (emailRes.status === 'skipped') {
        pnLogWarn('platform_notification_channel_skipped', {
          tenant_id: params.targetTenantId,
          event_key: params.eventKey,
          channel: 'email',
          delivery_id: emailRes.deliveryId,
          reason: emailRes.errorMessage ?? 'skipped',
        });
      } else if (emailRes.status === 'sent') {
        pnLogWarn('platform_notification_email_sent', {
          tenant_id: params.targetTenantId,
          event_key: params.eventKey,
          delivery_id: emailRes.deliveryId,
          duplicate: emailRes.duplicate,
        });
      } else if (emailRes.status === 'failed') {
        pnLogWarn('platform_notification_email_failed', {
          tenant_id: params.targetTenantId,
          event_key: params.eventKey,
          delivery_id: emailRes.deliveryId,
          error: emailRes.errorMessage,
        });
      }
    }
  }
}
