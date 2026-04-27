/**
 * Alteração de senha com utilizador autenticado: código por WhatsApp (instância do utilizador ou plataforma).
 */
import { randomInt } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { hashPassword, comparePassword } from '../utils/bcrypt.js';
import {
  dispatchPlatformWhatsAppText,
  dispatchWhatsAppText,
  normalizeWhatsAppOutboundPlainText,
} from './notificationsEngine/whatsappChannelDispatcher.js';
import { resolvePlatformWhatsAppOutboundReady } from './platformNotifications/platformNotificationDispatchContext.js';
import { toBrazilWhatsappDialDigits } from '../utils/userIdentity.js';

const CODE_TTL_MINUTES = 10;
const MAX_VERIFY_ATTEMPTS = 5;
const MAX_NEW_CODES_PER_HOUR = 5;

function generateSixDigitCode(): string {
  return String(randomInt(100000, 1000000));
}

function buildMessage(code: string): string {
  return normalizeWhatsAppOutboundPlainText(
    `Seu código para alterar a senha é: ${code}. Ele expira em ${CODE_TTL_MINUTES} minutos. Se não foi você, ignore esta mensagem.`,
  );
}

async function countRecentCodes(pool: Pool | PoolClient, userId: string): Promise<number> {
  const r = await pool.query<{ c: string }>(
    `SELECT count(*)::text AS c FROM user_password_change_codes
     WHERE user_id = $1::uuid AND created_at > now() - interval '1 hour'`,
    [userId],
  );
  return parseInt(r.rows[0]?.c ?? '0', 10) || 0;
}

async function supersedePendingCodes(client: PoolClient, userId: string): Promise<void> {
  await client.query(
    `UPDATE user_password_change_codes
     SET consumed_at = now(), updated_at = now()
     WHERE user_id = $1::uuid AND consumed_at IS NULL`,
    [userId],
  );
}

async function sendCodeToWhatsapp(params: {
  pool: Pool;
  tenantId: string | null;
  userId: string;
  phoneDigits: string;
  text: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const dial = toBrazilWhatsappDialDigits(params.phoneDigits);
  if (!dial || dial.replace(/\D/g, '').length < 10) {
    return { ok: false, error: 'Número de WhatsApp inválido.' };
  }

  if (params.tenantId) {
    const own = await dispatchWhatsAppText({
      pool: params.pool,
      tenantId: params.tenantId,
      senderUserId: params.userId,
      phone: dial,
      text: params.text,
    });
    if (own.ok) return { ok: true };
  }

  const outbound = await resolvePlatformWhatsAppOutboundReady(params.pool);
  if (!outbound) {
    return {
      ok: false,
      error:
        'Não foi possível enviar o código: configure o WhatsApp (instância ligada à sua conta) ou a instância da plataforma em notificações.',
    };
  }
  const plat = await dispatchPlatformWhatsAppText({
    instanceToken: outbound.instanceToken,
    phone: dial,
    text: params.text,
  });
  if (!plat.ok) {
    return { ok: false, error: plat.error || 'Falha ao enviar WhatsApp.' };
  }
  return { ok: true };
}

export type RequestLoggedInPasswordChangeCodeResult =
  | { ok: true }
  | { ok: false; error: string; code?: 'NO_WHATSAPP' | 'RATE_LIMIT' | 'SEND_FAILED' };

export async function requestLoggedInPasswordChangeCode(pool: Pool, userId: string, tenantId: string | null): Promise<RequestLoggedInPasswordChangeCodeResult> {
  const u = await pool.query<{ whatsapp: string | null }>(
    `SELECT regexp_replace(COALESCE(u.whatsapp_number, p.whatsapp_number, ''), '\\D', '', 'g') AS whatsapp
     FROM users u
     LEFT JOIN profiles p ON p.id = u.id
     WHERE u.id = $1`,
    [userId],
  );
  const digits = (u.rows[0]?.whatsapp ?? '').replace(/\D/g, '');
  if (digits.length < 8) {
    return { ok: false, error: 'Cadastre o WhatsApp no perfil antes de alterar a senha por código.', code: 'NO_WHATSAPP' };
  }

  const recent = await countRecentCodes(pool, userId);
  if (recent >= MAX_NEW_CODES_PER_HOUR) {
    return { ok: false, error: 'Muitas solicitações. Tente novamente mais tarde.', code: 'RATE_LIMIT' };
  }

  const plainCode = generateSixDigitCode();
  const codeHash = await hashPassword(plainCode);
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

  const client = await pool.connect();
  let rowId: string | null = null;
  try {
    await client.query('BEGIN');
    await supersedePendingCodes(client, userId);
    const ins = await client.query<{ id: string }>(
      `INSERT INTO user_password_change_codes (user_id, code_hash, expires_at)
       VALUES ($1::uuid, $2, $3)
       RETURNING id::text AS id`,
      [userId, codeHash, expiresAt.toISOString()],
    );
    rowId = ins.rows[0]?.id ?? null;
    if (!rowId) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'Não foi possível gerar o código.' };
    }
    await client.query('COMMIT');
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error('[loggedInPasswordChange] insert failed', e);
    return { ok: false, error: 'Erro interno ao gerar código.' };
  } finally {
    client.release();
  }

  const send = await sendCodeToWhatsapp({
    pool,
    tenantId,
    userId,
    phoneDigits: digits,
    text: buildMessage(plainCode),
  });

  if (!send.ok && rowId) {
    await pool.query(`DELETE FROM user_password_change_codes WHERE id = $1::uuid`, [rowId]);
    return { ok: false, error: send.error, code: 'SEND_FAILED' };
  }

  return { ok: true };
}

export type ConfirmLoggedInPasswordChangeResult = { ok: true } | { ok: false; error: string };

export async function confirmLoggedInPasswordChange(
  pool: Pool,
  userId: string,
  rawCode: string,
  newPassword: string,
  confirmPassword: string,
): Promise<ConfirmLoggedInPasswordChangeResult> {
  if (!newPassword || newPassword.length < 8) {
    return { ok: false, error: 'A nova senha deve ter pelo menos 8 caracteres.' };
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, error: 'A confirmação da senha não confere.' };
  }

  const code = String(rawCode ?? '').replace(/\D/g, '').trim();
  if (code.length !== 6) {
    return { ok: false, error: 'Código inválido ou expirado.' };
  }

  const r = await pool.query<{
    id: string;
    code_hash: string;
    attempts_count: string;
  }>(
    `SELECT id::text, code_hash, attempts_count::text
     FROM user_password_change_codes
     WHERE user_id = $1::uuid AND consumed_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId],
  );
  const row = r.rows[0];
  if (!row) {
    return { ok: false, error: 'Código inválido ou expirado.' };
  }

  const attempts = parseInt(row.attempts_count, 10) || 0;
  if (attempts >= MAX_VERIFY_ATTEMPTS) {
    await pool.query(`UPDATE user_password_change_codes SET consumed_at = now(), updated_at = now() WHERE id = $1::uuid`, [row.id]);
    return { ok: false, error: 'Limite de tentativas excedido. Solicite um novo código.' };
  }

  const match = await comparePassword(code, row.code_hash);
  if (!match) {
    await pool.query(
      `UPDATE user_password_change_codes SET attempts_count = attempts_count + 1, updated_at = now() WHERE id = $1::uuid`,
      [row.id],
    );
    return { ok: false, error: 'Código inválido.' };
  }

  await pool.query(`UPDATE user_password_change_codes SET consumed_at = now(), updated_at = now() WHERE id = $1::uuid`, [row.id]);

  const passwordHash = await hashPassword(newPassword);
  await pool.query(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2::uuid`, [passwordHash, userId]);
  await pool.query(`DELETE FROM sessions WHERE user_id = $1::uuid`, [userId]);

  return { ok: true };
}
