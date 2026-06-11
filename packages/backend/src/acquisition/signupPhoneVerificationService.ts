import { randomInt } from 'node:crypto';
import type { Pool } from 'pg';
import { hashPassword, comparePassword } from '../utils/bcrypt.js';
import { dispatchPlatformWhatsAppText } from '../services/notificationsEngine/whatsappChannelDispatcher.js';
import { resolvePlatformWhatsAppOutboundReady } from '../services/platformNotifications/platformNotificationDispatchContext.js';
import { toBrazilWhatsappDialDigits } from '../utils/userIdentity.js';

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

export type ParsedSignupPhone = {
  ddi: string;
  phone: string;
  dialDigits: string;
};

export function parseSignupPhone(raw: string, ddiInput?: string): ParsedSignupPhone | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10) return null;

  let ddi = (ddiInput ?? '55').replace(/\D/g, '') || '55';
  let national = digits;

  if (digits.startsWith('55') && digits.length >= 12) {
    ddi = '55';
    national = digits.slice(2);
  }

  if (national.length < 10) return null;

  return {
    ddi,
    phone: national,
    dialDigits: toBrazilWhatsappDialDigits(`${ddi}${national}`),
  };
}

function generateSixDigitCode(): string {
  return String(randomInt(100000, 1000000));
}

function buildAccessCodeMessage(plainCode: string): string {
  const appName = (process.env.APP_PUBLIC_NAME || 'PainelCRM').trim() || 'PainelCRM';
  return `🔐 ${appName}\n\nCódigo de acesso:\n\n${plainCode}\n\nEste código é válido por ${CODE_TTL_MINUTES} minutos.`;
}

async function invalidatePendingForPhone(pool: Pool, parsed: ParsedSignupPhone): Promise<void> {
  await pool.query(
    `UPDATE signup_phone_verifications
     SET verified_at = COALESCE(verified_at, now()),
         updated_at = now()
     WHERE ddi = $1 AND phone = $2 AND verified_at IS NULL`,
    [parsed.ddi, parsed.phone],
  );
}

export type SendSignupCodeResult =
  | {
      ok: true;
      verification_id: string;
      resend_available_at: string;
    }
  | { ok: false; reason: string; resend_available_in_seconds?: number };

export async function sendSignupPhoneVerificationCode(
  pool: Pool,
  rawPhone: string,
  ddiInput?: string,
): Promise<SendSignupCodeResult> {
  const parsed = parseSignupPhone(rawPhone, ddiInput);
  if (!parsed) return { ok: false, reason: 'invalid_phone' };

  const recent = await pool.query<{ created_at: string }>(
    `SELECT created_at::text
     FROM signup_phone_verifications
     WHERE ddi = $1 AND phone = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [parsed.ddi, parsed.phone],
  );
  const lastCreated = recent.rows[0]?.created_at;
  if (lastCreated) {
    const elapsed = (Date.now() - new Date(lastCreated).getTime()) / 1000;
    if (elapsed < RESEND_COOLDOWN_SECONDS) {
      return {
        ok: false,
        reason: 'resend_cooldown',
        resend_available_in_seconds: Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed),
      };
    }
  }

  const outbound = await resolvePlatformWhatsAppOutboundReady(pool);
  if (!outbound?.instanceToken) {
    return { ok: false, reason: 'whatsapp_unavailable' };
  }

  const plainCode = generateSixDigitCode();
  const codeHash = await hashPassword(plainCode);
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

  await invalidatePendingForPhone(pool, parsed);

  const ins = await pool.query<{ id: string }>(
    `INSERT INTO signup_phone_verifications (phone, ddi, code, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id::text AS id`,
    [parsed.phone, parsed.ddi, codeHash, expiresAt.toISOString()],
  );
  const verificationId = ins.rows[0]?.id;
  if (!verificationId) return { ok: false, reason: 'insert_failed' };

  const send = await dispatchPlatformWhatsAppText({
    instanceToken: outbound.instanceToken,
    phone: parsed.dialDigits,
    text: buildAccessCodeMessage(plainCode),
  });

  if (!send.ok) {
    await pool.query(`DELETE FROM signup_phone_verifications WHERE id = $1::uuid`, [verificationId]);
    console.error('[signup_phone_verify] send_failed', send.error);
    return { ok: false, reason: 'send_failed' };
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`[signup_phone_verify] dev_code phone=${parsed.ddi}${parsed.phone} code=${plainCode}`);
  }

  const resendAt = new Date(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
  return {
    ok: true,
    verification_id: verificationId,
    resend_available_at: resendAt.toISOString(),
  };
}

export type VerifySignupCodeResult =
  | { ok: true; verification_id: string }
  | { ok: false; reason: 'invalid_code' | 'expired' | 'max_attempts' | 'not_found' };

export async function verifySignupPhoneCode(
  pool: Pool,
  verificationId: string,
  rawPhone: string,
  rawCode: string,
): Promise<VerifySignupCodeResult> {
  const parsed = parseSignupPhone(rawPhone);
  const code = String(rawCode ?? '').replace(/\D/g, '').trim();
  if (!parsed || code.length !== 6) {
    return { ok: false, reason: 'invalid_code' };
  }

  const r = await pool.query<{
    id: string;
    code: string;
    attempts: number;
    expires_at: string;
    verified_at: string | null;
  }>(
    `SELECT id::text, code, attempts, expires_at::text, verified_at::text
     FROM signup_phone_verifications
     WHERE id = $1::uuid AND ddi = $2 AND phone = $3
     LIMIT 1`,
    [verificationId, parsed.ddi, parsed.phone],
  );
  const row = r.rows[0];
  if (!row) return { ok: false, reason: 'not_found' };

  if (row.verified_at) {
    return { ok: true, verification_id: row.id };
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return { ok: false, reason: 'expired' };
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: 'max_attempts' };
  }

  const match = await comparePassword(code, row.code);
  if (!match) {
    const nextAttempts = row.attempts + 1;
    await pool.query(
      `UPDATE signup_phone_verifications
       SET attempts = $2, updated_at = now()
       WHERE id = $1::uuid`,
      [row.id, nextAttempts],
    );
    return { ok: false, reason: nextAttempts >= MAX_ATTEMPTS ? 'max_attempts' : 'invalid_code' };
  }

  await pool.query(
    `UPDATE signup_phone_verifications
     SET verified_at = now(), updated_at = now()
     WHERE id = $1::uuid`,
    [row.id],
  );

  return { ok: true, verification_id: row.id };
}

export async function assertSignupPhoneVerified(
  pool: Pool,
  verificationId: string,
  rawPhone: string,
): Promise<boolean> {
  const parsed = parseSignupPhone(rawPhone);
  if (!parsed) return false;

  const r = await pool.query<{ ok: boolean }>(
    `SELECT (verified_at IS NOT NULL AND verified_at > now() - interval '30 minutes') AS ok
     FROM signup_phone_verifications
     WHERE id = $1::uuid AND ddi = $2 AND phone = $3
     LIMIT 1`,
    [verificationId, parsed.ddi, parsed.phone],
  );
  return Boolean(r.rows[0]?.ok);
}
