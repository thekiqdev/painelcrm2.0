/**
 * Recuperação de senha por código numérico enviado via Motor de Notificações da Plataforma (WhatsApp).
 */
import { randomInt } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { hashPassword, comparePassword } from '../utils/bcrypt.js';
import {
  buildWhatsappLookupDigitVariants,
  toBrazilWhatsappDialDigits,
} from '../utils/userIdentity.js';
import { runPlatformTransactionalNotification } from './platformNotifications/platformNotificationEngineOrchestrator.js';
import { loadPlatformNotificationsGlobalFlagsFromDb } from './platformNotifications/platformNotificationsGlobalSettingsService.js';
import { isPlatformNotificationsEnabled } from '../config/platformNotificationsEnv.js';
import { pnLogWarn } from './platformNotifications/platformNotificationLog.js';
import {
  generatePasswordResetCompletionToken,
  verifyPasswordResetCompletionToken,
} from '../utils/jwt.js';
import { buildPlatformSupportLink } from '../utils/platformPublicUrls.js';

const EVENT_KEY = 'platform.auth.password_reset_code_issued';
const CODE_TTL_MINUTES = 60;
const MAX_VERIFY_ATTEMPTS = 5;
const MAX_NEW_CODES_PER_HOUR = 3;
const MIN_WHATSAPP_DIGITS = 8;

const GENERIC_REQUEST_MSG =
  'Se encontrarmos uma conta associada a este número, enviaremos um código por WhatsApp em instantes.';
const GENERIC_CODE_ERROR = 'Código inválido ou expirado. Solicite um novo código se necessário.';

function platformPublicName(): string {
  return (process.env.APP_PUBLIC_NAME || 'PainelCRM').trim() || 'PainelCRM';
}

function displayNameFromRow(row: { first_name: string | null; last_name: string | null; email: string }): string {
  const fn = (row.first_name ?? '').trim();
  const ln = (row.last_name ?? '').trim();
  const j = [fn, ln].filter(Boolean).join(' ').trim();
  return j || row.email.trim() || 'Utilizador';
}

export type UserForPasswordReset = {
  id: string;
  email: string;
  tenant_id: string | null;
  first_name: string | null;
  last_name: string | null;
};

export async function findUserByWhatsappDigits(
  pool: Pool,
  inputDigits: string,
): Promise<{ user: UserForPasswordReset; whatsapp_digits_canonical: string } | null> {
  const variants = buildWhatsappLookupDigitVariants(inputDigits);
  if (variants.length === 0) return null;
  const r = await pool.query<
    UserForPasswordReset & { whatsapp_digits_canonical: string }
  >(
    `SELECT u.id::text AS id, u.email, u.tenant_id::text AS tenant_id,
            p.first_name, p.last_name,
            regexp_replace(COALESCE(u.whatsapp_number, ''), '\\D', '', 'g') AS whatsapp_digits_canonical
     FROM users u
     LEFT JOIN profiles p ON p.id = u.id
     WHERE u.password_hash IS NOT NULL
       AND length(regexp_replace(COALESCE(u.whatsapp_number, ''), '\\D', '', 'g')) >= ${MIN_WHATSAPP_DIGITS}
       AND regexp_replace(COALESCE(u.whatsapp_number, ''), '\\D', '', 'g') = ANY($1::text[])
     ORDER BY u.created_at ASC
     LIMIT 1`,
    [variants],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    user: {
      id: row.id,
      email: row.email,
      tenant_id: row.tenant_id,
      first_name: row.first_name,
      last_name: row.last_name,
    },
    whatsapp_digits_canonical: row.whatsapp_digits_canonical,
  };
}

async function resolveTargetTenantIdForNotification(pool: Pool, tenantId: string | null): Promise<string | null> {
  if (tenantId && tenantId.trim()) return tenantId.trim();
  const flags = await loadPlatformNotificationsGlobalFlagsFromDb(pool);
  const d = flags.dispatchTenantId?.trim();
  return d && d.length > 0 ? d : null;
}

function generateSixDigitCode(): string {
  return String(randomInt(100000, 1000000));
}

async function countRecentCodes(pool: Pool | PoolClient, userId: string): Promise<number> {
  const r = await pool.query<{ c: string }>(
    `SELECT count(*)::text AS c FROM password_reset_codes
     WHERE user_id = $1::uuid AND created_at > now() - interval '1 hour'`,
    [userId],
  );
  return parseInt(r.rows[0]?.c ?? '0', 10) || 0;
}

async function supersedePendingCodes(client: PoolClient, userId: string): Promise<void> {
  await client.query(
    `UPDATE password_reset_codes
     SET consumed_at = now(), updated_at = now()
     WHERE user_id = $1::uuid AND consumed_at IS NULL`,
    [userId],
  );
}

async function sendPasswordResetCodeNotification(params: {
  pool: Pool;
  targetTenantId: string;
  userId: string;
  codeRowId: string;
  recipientDigits: string;
  displayName: string;
  plainCode: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isPlatformNotificationsEnabled()) {
    return { ok: false, error: 'Motor de notificações da plataforma desligado.' };
  }

  const mergeContext: Record<string, string> = {
    'platform.name': platformPublicName(),
    'platform.support_link': buildPlatformSupportLink(),
    'user.name': params.displayName,
    'auth.reset_code': params.plainCode,
    'auth.code_expires_in_minutes': String(CODE_TTL_MINUTES),
  };

  const res = await runPlatformTransactionalNotification({
    pool: params.pool,
    targetTenantId: params.targetTenantId,
    eventKey: EVENT_KEY,
    entityType: 'password_reset_code',
    entityId: params.codeRowId,
    idempotencyKey: `platform:pwd_reset:user:${params.userId}:row:${params.codeRowId}`,
    recipientPhone: params.recipientDigits,
    recipientType: 'password_reset',
    mergeContext,
    eventOccurredAt: new Date(),
    actor: { type: 'system', source: 'password_reset_whatsapp' },
    metadata: {
      engine: 'platform_notifications',
      password_reset_code_id: params.codeRowId,
      user_id: params.userId,
    },
  });

  if (!res.ok) {
    return { ok: false, error: res.error };
  }
  return { ok: true };
}

export type PasswordResetRequestResult = { shownMessage: string };

/** Resposta sempre genérica (não revela se o número existe). */
export async function requestPasswordResetByWhatsapp(
  pool: Pool,
  rawWhatsapp: string,
): Promise<PasswordResetRequestResult> {
  const digitsOnly = rawWhatsapp.replace(/\D/g, '');
  if (digitsOnly.length < MIN_WHATSAPP_DIGITS) {
    return { shownMessage: GENERIC_REQUEST_MSG };
  }

  const found = await findUserByWhatsappDigits(pool, digitsOnly);
  if (!found) {
    return { shownMessage: GENERIC_REQUEST_MSG };
  }
  const { user, whatsapp_digits_canonical } = found;

  const recent = await countRecentCodes(pool, user.id);
  if (recent >= MAX_NEW_CODES_PER_HOUR) {
    pnLogWarn('password_reset_rate_limited', { user_id: user.id, reason: 'max_codes_per_hour' });
    return { shownMessage: GENERIC_REQUEST_MSG };
  }

  const targetTenantId = await resolveTargetTenantIdForNotification(pool, user.tenant_id);
  if (!targetTenantId) {
    pnLogWarn('password_reset_skip_no_tenant', {
      user_id: user.id,
      reason: 'no_tenant_and_no_dispatch_tenant',
    });
    return { shownMessage: GENERIC_REQUEST_MSG };
  }

  const plainCode = generateSixDigitCode();
  const codeHash = await hashPassword(plainCode);
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

  const client = await pool.connect();
  let rowId: string | null = null;
  try {
    await client.query('BEGIN');
    await supersedePendingCodes(client, user.id);
    const ins = await client.query<{ id: string }>(
      `INSERT INTO password_reset_codes (user_id, whatsapp_digits, code_hash, expires_at)
       VALUES ($1::uuid, $2, $3, $4)
       RETURNING id::text AS id`,
      [user.id, whatsapp_digits_canonical, codeHash, expiresAt.toISOString()],
    );
    rowId = ins.rows[0]?.id ?? null;
    if (!rowId) {
      await client.query('ROLLBACK');
      return { shownMessage: GENERIC_REQUEST_MSG };
    }
    await client.query('COMMIT');
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error('[passwordReset] insert failed', e);
    return { shownMessage: GENERIC_REQUEST_MSG };
  } finally {
    client.release();
  }

  const send = await sendPasswordResetCodeNotification({
    pool,
    targetTenantId,
    userId: user.id,
    codeRowId: rowId,
    recipientDigits: toBrazilWhatsappDialDigits(whatsapp_digits_canonical),
    displayName: displayNameFromRow(user),
    plainCode,
  });

  if (!send.ok) {
    await pool.query(`DELETE FROM password_reset_codes WHERE id = $1::uuid`, [rowId]);
    pnLogWarn('password_reset_whatsapp_send_failed', {
      user_id: user.id,
      error: send.error,
    });
  }

  return { shownMessage: GENERIC_REQUEST_MSG };
}

export type VerifyCodeResult =
  | { ok: true; reset_token: string }
  | { ok: false; error: string };

export async function verifyPasswordResetCode(
  pool: Pool,
  rawWhatsapp: string,
  rawCode: string,
): Promise<VerifyCodeResult> {
  const digitsOnly = rawWhatsapp.replace(/\D/g, '');
  const variants = buildWhatsappLookupDigitVariants(digitsOnly);
  const code = String(rawCode ?? '').replace(/\D/g, '').trim();
  if (variants.length === 0 || code.length !== 6) {
    return { ok: false, error: GENERIC_CODE_ERROR };
  }

  const r = await pool.query<{
    id: string;
    user_id: string;
    email: string;
    code_hash: string;
    attempts_count: string;
    expires_at: string;
  }>(
    `SELECT c.id::text, c.user_id::text, u.email, c.code_hash, c.attempts_count::text, c.expires_at::text
     FROM password_reset_codes c
     JOIN users u ON u.id = c.user_id
     WHERE c.whatsapp_digits = ANY($1::text[])
       AND c.consumed_at IS NULL
       AND c.expires_at > now()
     ORDER BY c.created_at DESC
     LIMIT 1`,
    [variants],
  );
  const row = r.rows[0];
  if (!row) {
    return { ok: false, error: GENERIC_CODE_ERROR };
  }

  const attempts = parseInt(row.attempts_count, 10) || 0;
  if (attempts >= MAX_VERIFY_ATTEMPTS) {
    await pool.query(
      `UPDATE password_reset_codes SET consumed_at = now(), updated_at = now() WHERE id = $1::uuid`,
      [row.id],
    );
    return { ok: false, error: GENERIC_CODE_ERROR };
  }

  const match = await comparePassword(code, row.code_hash);
  if (!match) {
    await pool.query(
      `UPDATE password_reset_codes
       SET attempts_count = attempts_count + 1, updated_at = now()
       WHERE id = $1::uuid`,
      [row.id],
    );
    return { ok: false, error: GENERIC_CODE_ERROR };
  }

  await pool.query(
    `UPDATE password_reset_codes SET consumed_at = now(), updated_at = now() WHERE id = $1::uuid`,
    [row.id],
  );

  const reset_token = generatePasswordResetCompletionToken(row.user_id, row.email);
  return { ok: true, reset_token };
}

export type CompletePasswordResetResult = { ok: true } | { ok: false; error: string };

export async function completePasswordResetWithToken(
  pool: Pool,
  resetToken: string,
  newPassword: string,
): Promise<CompletePasswordResetResult> {
  if (!newPassword || newPassword.length < 6) {
    return { ok: false, error: 'A nova senha deve ter pelo menos 6 caracteres.' };
  }

  let payload: { userId: string; email: string };
  try {
    payload = verifyPasswordResetCompletionToken(resetToken);
  } catch {
    return { ok: false, error: 'Sessão de redefinição inválida ou expirada. Valide o código novamente.' };
  }

  const passwordHash = await hashPassword(newPassword);
  const u = await pool.query<{ id: string }>(`SELECT id::text FROM users WHERE id = $1::uuid AND email = $2`, [
    payload.userId,
    payload.email,
  ]);
  if (u.rows.length === 0) {
    return { ok: false, error: 'Não foi possível concluir a redefinição.' };
  }

  await pool.query(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2::uuid`, [
    passwordHash,
    payload.userId,
  ]);
  await pool.query(`DELETE FROM sessions WHERE user_id = $1::uuid`, [payload.userId]);

  return { ok: true };
}
