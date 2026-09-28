import type { Pool, PoolClient } from 'pg';
import { pool } from '../utils/db.js';

export type PlatformTrackingSettings = {
  meta_pixel_enabled: boolean;
  meta_pixel_id: string | null;
  meta_track_page_view: boolean;
  meta_track_lead: boolean;
  meta_track_complete_registration: boolean;
};

export type PlatformTrackingSettingsUpdate = Partial<PlatformTrackingSettings>;

type Row = {
  meta_pixel_enabled: boolean;
  meta_pixel_id: string | null;
  meta_track_page_view: boolean;
  meta_track_lead: boolean;
  meta_track_complete_registration: boolean;
};

const DEFAULTS: PlatformTrackingSettings = {
  meta_pixel_enabled: false,
  meta_pixel_id: null,
  meta_track_page_view: true,
  meta_track_lead: true,
  meta_track_complete_registration: true,
};

function mapRow(row: Row | undefined): PlatformTrackingSettings {
  if (!row) return { ...DEFAULTS };
  return {
    meta_pixel_enabled: Boolean(row.meta_pixel_enabled),
    meta_pixel_id: row.meta_pixel_id?.trim() || null,
    meta_track_page_view: Boolean(row.meta_track_page_view),
    meta_track_lead: Boolean(row.meta_track_lead),
    meta_track_complete_registration: Boolean(row.meta_track_complete_registration),
  };
}

export function sanitizeMetaPixelId(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

export function validatePlatformTrackingUpdate(input: PlatformTrackingSettingsUpdate): string | null {
  if (input.meta_pixel_enabled) {
    const id = sanitizeMetaPixelId(input.meta_pixel_id ?? null);
    if (!id) return 'Meta Pixel ID é obrigatório quando o rastreamento está ativo.';
  }
  if (input.meta_pixel_id != null && input.meta_pixel_id !== '') {
    const id = sanitizeMetaPixelId(input.meta_pixel_id);
    if (!id) return 'Meta Pixel ID deve conter apenas números.';
  }
  return null;
}

async function loadRow(client: Pool | PoolClient): Promise<Row | undefined> {
  const r = await client.query<Row>(
    `SELECT meta_pixel_enabled, meta_pixel_id, meta_track_page_view,
            meta_track_lead, meta_track_complete_registration
     FROM platform_tracking_settings
     ORDER BY created_at ASC
     LIMIT 1`,
  );
  return r.rows[0];
}

export async function getPlatformTrackingSettings(): Promise<PlatformTrackingSettings> {
  return mapRow(await loadRow(pool));
}

export async function updatePlatformTrackingSettings(
  input: PlatformTrackingSettingsUpdate,
): Promise<PlatformTrackingSettings> {
  const err = validatePlatformTrackingUpdate(input);
  if (err) throw new Error(err);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let row = await loadRow(client);
    if (!row) {
      await client.query(`INSERT INTO platform_tracking_settings (id) VALUES (gen_random_uuid())`);
      row = await loadRow(client);
    }

    const current = mapRow(row);
    const next: PlatformTrackingSettings = {
      meta_pixel_enabled: input.meta_pixel_enabled ?? current.meta_pixel_enabled,
      meta_pixel_id:
        input.meta_pixel_id !== undefined
          ? sanitizeMetaPixelId(input.meta_pixel_id)
          : current.meta_pixel_id,
      meta_track_page_view: input.meta_track_page_view ?? current.meta_track_page_view,
      meta_track_lead: input.meta_track_lead ?? current.meta_track_lead,
      meta_track_complete_registration:
        input.meta_track_complete_registration ?? current.meta_track_complete_registration,
    };

    const validationErr = validatePlatformTrackingUpdate(next);
    if (validationErr) throw new Error(validationErr);

    await client.query(
      `UPDATE platform_tracking_settings
       SET meta_pixel_enabled = $1,
           meta_pixel_id = $2,
           meta_track_page_view = $3,
           meta_track_lead = $4,
           meta_track_complete_registration = $5,
           updated_at = now()
       WHERE id = (
         SELECT id FROM platform_tracking_settings ORDER BY created_at ASC LIMIT 1
       )`,
      [
        next.meta_pixel_enabled,
        next.meta_pixel_id,
        next.meta_track_page_view,
        next.meta_track_lead,
        next.meta_track_complete_registration,
      ],
    );
    await client.query('COMMIT');
    return next;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
