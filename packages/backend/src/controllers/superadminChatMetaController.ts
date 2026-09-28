import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { isWhatsappOfficialSuperadminEnabled } from '../config/whatsappOfficialEnv.js';
import { getSuperadminAccount } from '../services/whatsappOfficial/whatsappOfficialConfigService.js';
import { isWhatsappOfficialEncryptionConfigured } from '../services/whatsappOfficial/whatsappOfficialSecretCrypto.js';

function resolvePublicApiBaseForMetaWebhook(): string | null {
  const u = (
    process.env.API_PUBLIC_BASE_URL ||
    process.env.WHATSAPP_OFFICIAL_PUBLIC_BASE_URL ||
    ''
  )
    .trim()
    .replace(/\/$/, '');
  return u || null;
}

/** Estado seguro da integração Meta para o Chat da Plataforma (sem tokens). */
export async function getSuperadminChatMetaIntegrationStatus(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user?.is_super_admin) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }
    const featureEnabled = isWhatsappOfficialSuperadminEnabled();
    const encryptionConfigured = isWhatsappOfficialEncryptionConfigured();
    const { account } = await getSuperadminAccount();
    const base = resolvePublicApiBaseForMetaWebhook();
    res.json({
      feature_enabled: featureEnabled,
      encryption_configured: encryptionConfigured,
      account: account
        ? {
            id: account.id,
            status: account.status,
            is_active: account.is_active,
            phone_number_id: account.phone_number_id,
            display_phone_number: account.display_phone_number,
            verified_name: account.verified_name,
            has_app_secret: account.has_app_secret,
            has_app_id: Boolean(account.app_id?.trim()),
            inbox_user_assigned: Boolean(account.inbox_user_id),
            webhook_status: account.webhook_status ?? null,
            webhook_last_configured_at: account.webhook_last_configured_at ?? null,
          }
        : null,
      recommended_callback_url: base ? `${base}/api/webhooks/meta/whatsapp` : null,
    });
  } catch (e) {
    console.error('[superadmin-chat] meta-integration-status', e);
    res.status(500).json({ error: 'Erro ao carregar estado da API Oficial' });
  }
}
