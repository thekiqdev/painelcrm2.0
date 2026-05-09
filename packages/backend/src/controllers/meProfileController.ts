import { Response } from 'express';
import { z } from 'zod';
import { pool } from '../utils/db.js';
import { isPgUndefinedColumn } from '../utils/pgErrors.js';
import type { AuthRequest } from '../middleware/auth.js';
import { checkPermission } from '../permissions/permissionEngine.js';
import { requireTenantId } from '../middleware/auth.js';
import { getTenantIdOrNull } from '../utils/tenantScope.js';
import {
  confirmLoggedInPasswordChange,
  confirmProfileEditVerificationCode,
  requestLoggedInPasswordChangeCode,
  requestProfileEditVerificationCode,
} from '../services/loggedInPasswordChangeService.js';
import { generateMeProfileEditToken, verifyMeProfileEditToken } from '../utils/jwt.js';
import {
  assertAllowedImageUpload,
  buildCatalogMediaPublicUrl,
  buildCatalogMediaRelativeKey,
  getScopeFromCatalogMediaKey,
  isCatalogMediaKeyOwnedByTenantUser,
  saveCatalogMediaBuffer,
  unlinkCatalogMediaRelativeKey,
} from '../services/catalogMediaUploadService.js';
import { extractCatalogMediaRelativeKeyFromStoredUrl } from '../utils/catalogMediaPublicSignedUrl.js';
import { isMediaSimpleUploadsServiceEnabled } from '../services/media/mediaConfig.js';
import {
  maybeUnlinkPreviousAvatarUrl,
  saveSimpleUploadFromBuffer,
} from '../services/media/simpleUploadMediaService.js';

const personalPutSchema = z.object({
  first_name: z.string().max(200).nullable().optional(),
  last_name: z.string().max(200).nullable().optional(),
  whatsapp_number: z.string().max(64).nullable().optional(),
  job_title: z.string().max(200).nullable().optional(),
  locale: z.string().max(32).nullable().optional(),
  timezone: z.string().max(64).nullable().optional(),
  avatar_url: z.string().max(4096).nullable().optional(),
});

const PROFILE_MIGRATION_HINT =
  'Execute database/init/157_profile_personal_and_password_change.sql (perfil completo) ou, no mínimo, database/init/158_users_avatar_url.sql (avatar em users).';

function assertMeProfileEditToken(req: AuthRequest, res: Response): boolean {
  const userId = req.userId!;
  const raw = req.get('x-profile-edit-token')?.trim();
  if (!raw || !verifyMeProfileEditToken(raw, userId)) {
    res.status(403).json({
      error:
        'É necessário confirmar com o código de 6 dígitos enviado ao WhatsApp para editar o perfil. Toque em «Editar perfil» e siga as instruções.',
      code: 'PROFILE_EDIT_VERIFICATION_REQUIRED',
    });
    return false;
  }
  return true;
}

async function getPreviousAvatarUrlForMe(userId: string): Promise<string | null> {
  try {
    const r = await pool.query<{ avatar_url: string | null }>(`SELECT avatar_url FROM profiles WHERE id = $1`, [userId]);
    const u = r.rows[0]?.avatar_url;
    if (u) return u;
  } catch (e) {
    if (!isPgUndefinedColumn(e)) throw e;
  }
  try {
    const r = await pool.query<{ avatar_url: string | null }>(`SELECT avatar_url FROM users WHERE id = $1`, [userId]);
    return r.rows[0]?.avatar_url ?? null;
  } catch (e) {
    if (isPgUndefinedColumn(e)) return null;
    throw e;
  }
}

/** Grava avatar em profiles; se a coluna não existir, em users.avatar_url (migração 158). */
async function persistAvatarUrlForUser(userId: string, publicUrl: string, whatsappForInsert: string): Promise<void> {
  try {
    const upd = await pool.query(`UPDATE profiles SET avatar_url = $2, updated_at = now() WHERE id = $1`, [userId, publicUrl]);
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
  try {
    await pool.query(`UPDATE users SET avatar_url = $1, updated_at = now() WHERE id = $2`, [publicUrl, userId]);
  } catch (e2) {
    if (isPgUndefinedColumn(e2)) {
      throw new Error('NO_AVATAR_COLUMN');
    }
    throw e2;
  }
}

const businessPutSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  company_legal_name: z.string().max(400).nullable().optional(),
  cpf_cnpj: z.string().max(32).nullable().optional(),
  company_email: z.union([z.string().email().max(320), z.literal(''), z.null()]).optional(),
  company_whatsapp: z.string().max(64).nullable().optional(),
  company_website: z.string().max(500).nullable().optional(),
  company_postal_code: z.string().max(20).nullable().optional(),
  company_street: z.string().max(300).nullable().optional(),
  company_number: z.string().max(40).nullable().optional(),
  company_district: z.string().max(200).nullable().optional(),
  company_city: z.string().max(200).nullable().optional(),
  company_state: z.string().max(100).nullable().optional(),
  company_address_line: z.string().max(500).nullable().optional(),
  logo_light_url: z.string().max(4096).nullable().optional(),
  logo_dark_url: z.string().max(4096).nullable().optional(),
});

async function isPrimaryTenantUser(clientUserId: string, tenantId: string): Promise<boolean> {
  const r = await pool.query<{ id: string }>(
    `SELECT id::text FROM users WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [tenantId],
  );
  return r.rows[0]?.id === clientUserId;
}

export async function canEditBusinessProfile(req: AuthRequest): Promise<boolean> {
  const userId = req.userId!;
  const tenantId = req.tenantId ?? null;
  if (!tenantId) return false;
  if (await isPrimaryTenantUser(userId, tenantId)) return true;
  return checkPermission({ userId, tenantId, module: 'settings', action: 'edit' }, req);
}

export async function getMeProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const sqlFull = `SELECT u.id, u.email, u.whatsapp_number,
              p.first_name, p.last_name, p.job_title, p.locale, p.timezone, p.avatar_url,
              p.whatsapp_number AS profile_whatsapp
       FROM users u
       LEFT JOIN profiles p ON p.id = u.id
       WHERE u.id = $1`;
    const sqlLegacyUserAvatar = `SELECT u.id, u.email, u.whatsapp_number,
              p.first_name, p.last_name,
              u.avatar_url,
              p.whatsapp_number AS profile_whatsapp
       FROM users u
       LEFT JOIN profiles p ON p.id = u.id
       WHERE u.id = $1`;
    const sqlLegacy = `SELECT u.id, u.email, u.whatsapp_number,
              p.first_name, p.last_name,
              p.whatsapp_number AS profile_whatsapp
       FROM users u
       LEFT JOIN profiles p ON p.id = u.id
       WHERE u.id = $1`;
    let r;
    try {
      r = await pool.query(sqlFull, [userId]);
    } catch (e) {
      if (isPgUndefinedColumn(e)) {
        try {
          r = await pool.query(sqlLegacyUserAvatar, [userId]);
        } catch (e2) {
          if (isPgUndefinedColumn(e2)) {
            r = await pool.query(sqlLegacy, [userId]);
          } else {
            throw e2;
          }
        }
      } else {
        throw e;
      }
    }
    if (r.rows.length === 0) {
      res.status(404).json({ error: 'Utilizador não encontrado' });
      return;
    }
    const row = r.rows[0] as Record<string, unknown>;
    const can = await canEditBusinessProfile(req);
    res.json({
      personal: {
        email: row.email,
        first_name: row.first_name ?? null,
        last_name: row.last_name ?? null,
        whatsapp_number: (row.whatsapp_number as string) || (row.profile_whatsapp as string) || '',
        job_title: row.job_title ?? null,
        locale: row.locale ?? null,
        timezone: row.timezone ?? null,
        avatar_url: row.avatar_url ?? null,
      },
      can_edit_business_profile: can,
    });
  } catch (e) {
    console.error('[me/profile] get', e);
    res.status(500).json({ error: 'Erro interno' });
  }
}

export async function putMeProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    if (!assertMeProfileEditToken(req, res)) return;
    const body = personalPutSchema.parse(req.body);

    const existingResult = await pool.query(
      `SELECT first_name, last_name, company_name, whatsapp_number, whatsapp_connected, registration_complete,
              job_title, locale, timezone, avatar_url
       FROM profiles WHERE id = $1`,
      [userId],
    );
    const ex = existingResult.rows[0] || {};

    const merged = {
      first_name: body.first_name !== undefined ? body.first_name : ex.first_name ?? null,
      last_name: body.last_name !== undefined ? body.last_name : ex.last_name ?? null,
      company_name: ex.company_name ?? null,
      whatsapp_number:
        body.whatsapp_number !== undefined ? (body.whatsapp_number ?? '') : ex.whatsapp_number ?? '',
      whatsapp_connected: ex.whatsapp_connected ?? false,
      registration_complete: ex.registration_complete ?? false,
      job_title: body.job_title !== undefined ? body.job_title : ex.job_title ?? null,
      locale: body.locale !== undefined ? body.locale : ex.locale ?? null,
      timezone: body.timezone !== undefined ? body.timezone : ex.timezone ?? null,
      avatar_url: body.avatar_url !== undefined ? body.avatar_url : ex.avatar_url ?? null,
    };

    await pool.query(
      `INSERT INTO profiles (id, first_name, last_name, company_name, whatsapp_number, whatsapp_connected, registration_complete, job_title, locale, timezone, avatar_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         company_name = EXCLUDED.company_name,
         whatsapp_number = EXCLUDED.whatsapp_number,
         whatsapp_connected = EXCLUDED.whatsapp_connected,
         registration_complete = EXCLUDED.registration_complete,
         job_title = EXCLUDED.job_title,
         locale = EXCLUDED.locale,
         timezone = EXCLUDED.timezone,
         avatar_url = EXCLUDED.avatar_url,
         updated_at = now()
       RETURNING *`,
      [
        userId,
        merged.first_name,
        merged.last_name,
        merged.company_name ?? '',
        merged.whatsapp_number,
        merged.whatsapp_connected,
        merged.registration_complete,
        merged.job_title,
        merged.locale,
        merged.timezone,
        merged.avatar_url,
      ],
    );

    if (body.whatsapp_number !== undefined) {
      await pool.query(`UPDATE users SET whatsapp_number = $1, updated_at = now() WHERE id = $2`, [
        body.whatsapp_number ?? null,
        userId,
      ]);
    }

    res.json({
      personal: {
        email: (await pool.query(`SELECT email FROM users WHERE id = $1`, [userId])).rows[0]?.email,
        first_name: merged.first_name,
        last_name: merged.last_name,
        whatsapp_number: merged.whatsapp_number,
        job_title: merged.job_title,
        locale: merged.locale,
        timezone: merged.timezone,
        avatar_url: merged.avatar_url,
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: 'Dados inválidos', details: e.errors });
      return;
    }
    if (isPgUndefinedColumn(e)) {
      res.status(503).json({
        error: `Perfil indisponível até atualizar o schema. ${PROFILE_MIGRATION_HINT}`,
        code: 'PROFILE_SCHEMA_MIGRATION_REQUIRED',
      });
      return;
    }
    console.error('[me/profile] put', e);
    res.status(500).json({ error: 'Erro interno' });
  }
}

export async function postMeProfileAvatar(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (process.env.CATALOG_MEDIA_UPLOAD_ENABLED === 'false') {
      res.status(503).json({ error: 'Upload desabilitado neste ambiente.' });
      return;
    }
    const userId = req.userId!;
    if (!assertMeProfileEditToken(req, res)) return;
    const file = req.file;
    if (!file?.buffer) {
      res.status(400).json({ error: 'Arquivo obrigatório (campo file).' });
      return;
    }
    assertAllowedImageUpload(file.mimetype, file.size);
    const tenantId = req.tenantId ?? null;
    const tenantUuid = getTenantIdOrNull(req.tenantId);
    const tenantSegment = tenantUuid || 'no-tenant';

    const prevUrl = await getPreviousAvatarUrlForMe(userId);

    let publicUrl: string;
    let keyOut: string;

    if (isMediaSimpleUploadsServiceEnabled()) {
      const saved = await saveSimpleUploadFromBuffer({
        tenantSegment,
        tenantUuid,
        userId,
        catalogScope: 'user_avatar',
        buffer: file.buffer,
        mimeType: file.mimetype,
        originalFilename: file.originalname,
      });
      await maybeUnlinkPreviousAvatarUrl({
        previousUrl: prevUrl,
        newKey: saved.storageKey,
        tenantUuid,
        userId,
      });
      publicUrl = saved.relativeUrl;
      keyOut = saved.storageKey;
    } else {
      const relativeKey = buildCatalogMediaRelativeKey({
        tenantId,
        userId,
        scope: 'user_avatar',
        contentType: file.mimetype,
        originalName: file.originalname,
      });
      await saveCatalogMediaBuffer(relativeKey, file.buffer);

      if (prevUrl) {
        const prevKey = extractCatalogMediaRelativeKeyFromStoredUrl(prevUrl);
        if (prevKey && prevKey !== relativeKey && getScopeFromCatalogMediaKey(prevKey) === 'user_avatar') {
          if (isCatalogMediaKeyOwnedByTenantUser(prevKey, tenantId, userId)) {
            try {
              await unlinkCatalogMediaRelativeKey(prevKey);
            } catch {
              /* ignore */
            }
          }
        }
      }

      publicUrl = buildCatalogMediaPublicUrl(req, relativeKey);
      keyOut = relativeKey;
    }

    const wq = await pool.query<{ w: string | null }>(
      `SELECT NULLIF(TRIM(COALESCE(u.whatsapp_number, p.whatsapp_number)), '') AS w
       FROM users u
       LEFT JOIN profiles p ON p.id = u.id
       WHERE u.id = $1`,
      [userId],
    );
    const whatsappForInsert = (wq.rows[0]?.w?.trim() || ' ');

    try {
      await persistAvatarUrlForUser(userId, publicUrl, whatsappForInsert);
    } catch (persistErr) {
      if (persistErr instanceof Error && persistErr.message === 'NO_AVATAR_COLUMN') {
        res.status(503).json({
          error: `Avatar indisponível até atualizar o schema. ${PROFILE_MIGRATION_HINT}`,
          code: 'PROFILE_SCHEMA_MIGRATION_REQUIRED',
        });
        return;
      }
      if (isPgUndefinedColumn(persistErr)) {
        res.status(503).json({
          error: `Avatar indisponível até atualizar o schema. ${PROFILE_MIGRATION_HINT}`,
          code: 'PROFILE_SCHEMA_MIGRATION_REQUIRED',
        });
        return;
      }
      throw persistErr;
    }

    res.json({ avatar_url: publicUrl, key: keyOut });
  } catch (e) {
    if (isPgUndefinedColumn(e)) {
      res.status(503).json({
        error: `Avatar indisponível até atualizar o schema. ${PROFILE_MIGRATION_HINT}`,
        code: 'PROFILE_SCHEMA_MIGRATION_REQUIRED',
      });
      return;
    }
    const msg = e instanceof Error ? e.message : 'Erro ao enviar avatar';
    res.status(400).json({ error: msg });
  }
}

export async function getMeBusinessProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    if (!(await canEditBusinessProfile(req))) {
      res.status(403).json({ error: 'Sem permissão para dados da empresa.' });
      return;
    }
    const r = await pool.query(
      `SELECT id, name, cpf_cnpj,
              company_legal_name, company_email, company_website,
              company_whatsapp, company_postal_code, company_street, company_number, company_district,
              company_address_line, company_city, company_state,
              logo_url, logo_light_url, logo_dark_url, timezone, locale
       FROM tenants WHERE id = $1`,
      [tenantId],
    );
    if (r.rows.length === 0) {
      res.status(404).json({ error: 'Conta não encontrada' });
      return;
    }
    res.json({ business: r.rows[0] });
  } catch (e) {
    console.error('[me/business-profile] get', e);
    res.status(500).json({ error: 'Erro interno' });
  }
}

export async function putMeBusinessProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;
    if (!(await canEditBusinessProfile(req))) {
      res.status(403).json({ error: 'Sem permissão para dados da empresa.' });
      return;
    }
    const body = businessPutSchema.parse(req.body);

    const sets: string[] = ['updated_at = now()'];
    const vals: unknown[] = [];
    let i = 1;
    const add = (col: string, val: unknown) => {
      sets.push(`${col} = $${i++}`);
      vals.push(val);
    };

    if (body.name !== undefined) add('name', body.name);
    if (body.company_legal_name !== undefined) add('company_legal_name', body.company_legal_name);
    if (body.cpf_cnpj !== undefined) add('cpf_cnpj', body.cpf_cnpj);
    if (body.company_email !== undefined) {
      add(
        'company_email',
        body.company_email === '' || body.company_email === null ? null : body.company_email,
      );
    }
    if (body.company_whatsapp !== undefined) add('company_whatsapp', body.company_whatsapp);
    if (body.company_website !== undefined) add('company_website', body.company_website);
    if (body.company_postal_code !== undefined) add('company_postal_code', body.company_postal_code);
    if (body.company_street !== undefined) add('company_street', body.company_street);
    if (body.company_number !== undefined) add('company_number', body.company_number);
    if (body.company_district !== undefined) add('company_district', body.company_district);
    if (body.company_city !== undefined) add('company_city', body.company_city);
    if (body.company_state !== undefined) add('company_state', body.company_state);
    if (body.company_address_line !== undefined) add('company_address_line', body.company_address_line);
    if (body.logo_light_url !== undefined) add('logo_light_url', body.logo_light_url);
    if (body.logo_dark_url !== undefined) add('logo_dark_url', body.logo_dark_url);

    vals.push(tenantId);
    await pool.query(`UPDATE tenants SET ${sets.join(', ')} WHERE id = $${i}`, vals);

    const out = await pool.query(
      `SELECT id, name, cpf_cnpj,
              company_legal_name, company_email, company_website,
              company_whatsapp, company_postal_code, company_street, company_number, company_district,
              company_address_line, company_city, company_state,
              logo_url, logo_light_url, logo_dark_url, timezone, locale
       FROM tenants WHERE id = $1`,
      [tenantId],
    );
    res.json({ business: out.rows[0] });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: 'Dados inválidos', details: e.errors });
      return;
    }
    console.error('[me/business-profile] put', e);
    res.status(500).json({ error: 'Erro interno' });
  }
}

export async function postMeProfileEditRequestCode(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const result = await requestProfileEditVerificationCode(pool, userId, req.tenantId ?? null);
    if (!result.ok) {
      const status = result.code === 'RATE_LIMIT' ? 429 : result.code === 'NO_WHATSAPP' ? 400 : 503;
      res.status(status).json({ error: result.error, code: result.code });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[me/profile/edit/request-code]', e);
    res.status(500).json({ error: 'Erro interno' });
  }
}

const profileEditConfirmSchema = z.object({
  code: z.string().min(4).max(12),
});

export async function postMeProfileEditConfirmCode(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const body = profileEditConfirmSchema.parse(req.body);
    const result = await confirmProfileEditVerificationCode(pool, userId, body.code);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    const profile_edit_token = generateMeProfileEditToken(userId);
    res.json({ ok: true, profile_edit_token, expires_in: 30 * 60 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: 'Dados inválidos', details: e.errors });
      return;
    }
    console.error('[me/profile/edit/confirm-code]', e);
    res.status(500).json({ error: 'Erro interno' });
  }
}

export async function postMeProfilePasswordRequestCode(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const result = await requestLoggedInPasswordChangeCode(pool, userId, req.tenantId ?? null);
    if (!result.ok) {
      const status = result.code === 'RATE_LIMIT' ? 429 : result.code === 'NO_WHATSAPP' ? 400 : 503;
      res.status(status).json({ error: result.error, code: result.code });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[me/profile/password/request]', e);
    res.status(500).json({ error: 'Erro interno' });
  }
}

const passwordConfirmSchema = z.object({
  code: z.string().min(4).max(12),
  new_password: z.string().min(8).max(200),
  confirm_password: z.string().min(8).max(200),
});

export async function postMeProfilePasswordConfirm(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const body = passwordConfirmSchema.parse(req.body);
    const result = await confirmLoggedInPasswordChange(pool, userId, body.code, body.new_password, body.confirm_password);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ ok: true, message: 'Senha atualizada. Faça login novamente.' });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: 'Dados inválidos', details: e.errors });
      return;
    }
    console.error('[me/profile/password/confirm]', e);
    res.status(500).json({ error: 'Erro interno' });
  }
}
