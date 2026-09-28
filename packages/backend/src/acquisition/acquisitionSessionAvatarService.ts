/**
 * Avatar da sessão de onboarding (metadata.avatar) → perfil do usuário admin ao provisionar/concluir.
 */
import { pool } from '../utils/db.js';
import { assertAllowedImageUpload } from '../services/catalogMediaUploadService.js';
import { isMediaSimpleUploadsServiceEnabled } from '../services/media/mediaConfig.js';
import {
  maybeUnlinkPreviousAvatarUrl,
  saveSimpleUploadFromBuffer,
} from '../services/media/simpleUploadMediaService.js';
import { isPgUndefinedColumn } from '../utils/pgErrors.js';
import type { OnboardingSessionRow } from './acquisitionOnboardingSessionService.js';
import { updateOnboardingWizardSession } from './acquisitionOnboardingSessionService.js';

export const MAX_SESSION_AVATAR_DATA_URL_CHARS = 600_000;

export type SessionAvatarMetadata = {
  data_url?: string;
  url?: string;
  updated_at: string;
  applied_user_id?: string;
  applied_at?: string;
};

export function normalizeSessionAvatarInput(input: {
  avatar_data_url?: string | null;
  avatar_url?: string | null;
}): SessionAvatarMetadata | null {
  const dataUrl = input.avatar_data_url?.trim();
  const url = input.avatar_url?.trim();
  if (!dataUrl && !url) return null;

  if (dataUrl) {
    if (!dataUrl.startsWith('data:image/')) return null;
    if (dataUrl.length > MAX_SESSION_AVATAR_DATA_URL_CHARS) return null;
  }
  if (url && url.length > 4096) return null;

  return {
    ...(dataUrl ? { data_url: dataUrl } : {}),
    ...(url ? { url } : {}),
    updated_at: new Date().toISOString(),
  };
}

export function resolveSessionAvatarDisplay(metadata: Record<string, unknown>): string | null {
  const raw = metadata.avatar;
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as SessionAvatarMetadata;
  if (typeof a.data_url === 'string' && a.data_url.startsWith('data:image/')) return a.data_url;
  if (typeof a.url === 'string' && a.url.length > 0) return a.url;
  return null;
}

export async function mergeSessionAvatar(
  sessionId: string,
  avatar: SessionAvatarMetadata,
): Promise<void> {
  await updateOnboardingWizardSession(sessionId, {
    metadata: { avatar },
  });
}

function parseDataUrl(dataUrl: string): { buffer: Buffer; mimeType: string } | null {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  try {
    const buffer = Buffer.from(m[2]!.replace(/\s/g, ''), 'base64');
    return { mimeType: m[1]!.toLowerCase(), buffer };
  } catch {
    return null;
  }
}

async function persistAvatarUrlForUser(userId: string, publicUrl: string): Promise<void> {
  const wq = await pool.query<{ w: string | null }>(
    `SELECT NULLIF(TRIM(COALESCE(u.whatsapp_number, p.whatsapp_number)), '') AS w
     FROM users u
     LEFT JOIN profiles p ON p.id = u.id
     WHERE u.id = $1`,
    [userId],
  );
  const whatsappForInsert = wq.rows[0]?.w?.trim() || ' ';

  try {
    const upd = await pool.query(
      `UPDATE profiles SET avatar_url = $2, updated_at = now() WHERE id = $1`,
      [userId, publicUrl],
    );
    if (!upd.rowCount) {
      await pool.query(
        `INSERT INTO profiles (id, first_name, last_name, company_name, whatsapp_number, whatsapp_connected, registration_complete, avatar_url)
         VALUES ($1, '', '', '', $2, false, false, $3)`,
        [userId, whatsappForInsert, publicUrl],
      );
    }
    return;
  } catch (e) {
    if (!isPgUndefinedColumn(e)) throw e;
  }
  await pool.query(`UPDATE users SET avatar_url = $1, updated_at = now() WHERE id = $2`, [
    publicUrl,
    userId,
  ]);
}

async function uploadDataUrlAvatar(
  dataUrl: string,
  userId: string,
  tenantId: string,
): Promise<string | null> {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;
  try {
    assertAllowedImageUpload(parsed.mimeType, parsed.buffer.length);
  } catch {
    return null;
  }

  const tenantSegment = tenantId;
  if (isMediaSimpleUploadsServiceEnabled()) {
    const saved = await saveSimpleUploadFromBuffer({
      tenantSegment,
      tenantUuid: tenantId,
      userId,
      catalogScope: 'user_avatar',
      buffer: parsed.buffer,
      mimeType: parsed.mimeType,
      originalFilename: 'onboarding-avatar',
    });
    await maybeUnlinkPreviousAvatarUrl({
      previousUrl: null,
      newKey: saved.storageKey,
      tenantUuid: tenantId,
      userId,
    });
    return saved.relativeUrl;
  }

  return dataUrl;
}

/**
 * Copia avatar da sessão para profiles/users. Idempotente por applied_user_id.
 */
export async function applySessionAvatarToUserProfile(input: {
  session: OnboardingSessionRow;
  userId: string;
  tenantId: string;
}): Promise<void> {
  const raw = input.session.metadata_json.avatar;
  if (!raw || typeof raw !== 'object') return;
  const avatar = raw as SessionAvatarMetadata;
  if (avatar.applied_user_id === input.userId) return;

  let publicUrl: string | null = null;
  if (typeof avatar.url === 'string' && avatar.url.length > 0) {
    publicUrl = avatar.url;
  } else if (typeof avatar.data_url === 'string') {
    publicUrl = await uploadDataUrlAvatar(avatar.data_url, input.userId, input.tenantId);
  }
  if (!publicUrl) return;

  try {
    await persistAvatarUrlForUser(input.userId, publicUrl);
  } catch (e) {
    if (isPgUndefinedColumn(e)) return;
    throw e;
  }

  await updateOnboardingWizardSession(input.session.id, {
    metadata: {
      avatar: {
        ...avatar,
        url: publicUrl.startsWith('data:') ? avatar.url : publicUrl,
        applied_user_id: input.userId,
        applied_at: new Date().toISOString(),
      },
    },
  });
}

export async function applySessionAvatarForTenantAdmin(
  session: OnboardingSessionRow,
  tenantId: string,
): Promise<void> {
  const r = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE tenant_id = $1 AND role = 'admin' ORDER BY created_at ASC LIMIT 1`,
    [tenantId],
  );
  const userId = r.rows[0]?.id;
  if (!userId) return;
  await applySessionAvatarToUserProfile({ session, userId, tenantId });
}
