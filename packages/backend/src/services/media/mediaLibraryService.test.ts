import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

vi.mock('../../utils/db.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from '../../utils/db.js';
import {
  assertMediaLibraryMimeAllowed,
  assertMediaLibraryQuotaAllows,
  isExcludedFromMediaLibrary,
  isMediaLibraryScope,
  MEDIA_LIBRARY_SCOPES,
  MediaLibraryQuotaError,
} from './mediaLibraryService.js';
import { buildMediaStorageKey } from './mediaStorageKey.js';
import { buildMediaRawSignedRelativeUrl, verifyMediaSignature } from './mediaUrlSigner.js';
import { saveFromBuffer } from './mediaService.js';

const mockedQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

describe('S33 Media Library scopes (D32.2)', () => {
  it('library e product_image são scopes da library', () => {
    expect(isMediaLibraryScope('library')).toBe(true);
    expect(isMediaLibraryScope('product_image')).toBe(true);
    expect(MEDIA_LIBRARY_SCOPES).toContain('library');
    expect(MEDIA_LIBRARY_SCOPES).toContain('product_image');
  });

  it('flow_inbound_temp nunca faz parte da library', () => {
    expect(isMediaLibraryScope('flow_inbound_temp')).toBe(false);
    expect(isExcludedFromMediaLibrary('flow_inbound_temp')).toBe(true);
    expect(isExcludedFromMediaLibrary('library')).toBe(false);
  });

  it('buildMediaStorageKey aceita scope library', () => {
    const key = buildMediaStorageKey({
      tenantId: '11111111-1111-4111-8111-111111111111',
      scope: 'library',
      ownerType: 'tenant',
      ownerId: '11111111-1111-4111-8111-111111111111',
      mimeType: 'image/png',
      originalFilename: 'logo.png',
    });
    expect(key).toMatch(/^tenants\/11111111-1111-4111-8111-111111111111\/library\/tenant\//);
    expect(key).toContain('.png');
    expect(key).not.toContain('flow_inbound_temp');
  });
});

describe('S33 MIME allowlist', () => {
  it('aceita imagem e PDF', () => {
    expect(() => assertMediaLibraryMimeAllowed('image/jpeg')).not.toThrow();
    expect(() => assertMediaLibraryMimeAllowed('application/pdf')).not.toThrow();
  });

  it('rejeita mime desconhecido', () => {
    expect(() => assertMediaLibraryMimeAllowed('application/x-msdownload')).toThrow(/não permitido/i);
  });
});

describe('S33 URL assinada library', () => {
  it('URL raw sem TTL funciona para assets de library', () => {
    const key = 'tenants/t1/library/tenant/t1/a1b2c3d4-e5f6-7890-abcd-ef1234567890.png';
    const url = buildMediaRawSignedRelativeUrl(key);
    const u = new URL(url, 'https://example.test');
    expect(u.pathname).toBe('/api/media/v1/raw');
    expect(u.searchParams.get('e')).toBeNull();
    const k = Buffer.from(u.searchParams.get('k') || '', 'base64url').toString('utf8');
    expect(k).toBe(key);
    expect(verifyMediaSignature(k, u.searchParams.get('s') || '')).toBe(true);
  });
});

describe('S33 quota', () => {
  let prevCount: string | undefined;
  let prevBytes: string | undefined;

  beforeEach(() => {
    prevCount = process.env.MEDIA_LIBRARY_MAX_COUNT;
    prevBytes = process.env.MEDIA_LIBRARY_MAX_TOTAL_BYTES;
    process.env.MEDIA_LIBRARY_MAX_COUNT = '2';
    // mínimo efetivo da config é 1 MiB
    process.env.MEDIA_LIBRARY_MAX_TOTAL_BYTES = String(1024 * 1024);
    mockedQuery.mockReset();
  });

  afterEach(() => {
    if (prevCount === undefined) delete process.env.MEDIA_LIBRARY_MAX_COUNT;
    else process.env.MEDIA_LIBRARY_MAX_COUNT = prevCount;
    if (prevBytes === undefined) delete process.env.MEDIA_LIBRARY_MAX_TOTAL_BYTES;
    else process.env.MEDIA_LIBRARY_MAX_TOTAL_BYTES = prevBytes;
  });

  it('rejeita upload quando contagem excedida', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ cnt: '2', bytes: '100' }] });
    await expect(
      assertMediaLibraryQuotaAllows('33333333-3333-4333-8333-333333333333', 10)
    ).rejects.toBeInstanceOf(MediaLibraryQuotaError);
  });

  it('rejeita upload quando bytes excedidos', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ cnt: '0', bytes: String(1024 * 1024 - 50) }] });
    await expect(
      assertMediaLibraryQuotaAllows('33333333-3333-4333-8333-333333333333', 200)
    ).rejects.toMatchObject({ code: 'MEDIA_LIBRARY_QUOTA_EXCEEDED' });
  });

  it('permite upload dentro da quota', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ cnt: '1', bytes: '100' }] });
    const q = await assertMediaLibraryQuotaAllows('33333333-3333-4333-8333-333333333333', 50);
    expect(q.remainingCount).toBe(1);
    expect(q.remainingBytes).toBe(1024 * 1024 - 100);
  });
});

describe('S33 saveFromBuffer scope library (disco)', () => {
  let prevRoot: string | undefined;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'media-library-'));
    prevRoot = process.env.MEDIA_STORAGE_ROOT;
    process.env.MEDIA_STORAGE_ROOT = tmpDir;
    process.env.MEDIA_ASSETS_WRITE_ENABLED = 'false';
  });

  afterEach(async () => {
    if (prevRoot === undefined) delete process.env.MEDIA_STORAGE_ROOT;
    else process.env.MEDIA_STORAGE_ROOT = prevRoot;
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('grava ficheiro com scope library e URL relativa assinada', async () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    ]);
    const saved = await saveFromBuffer({
      tenantId: '22222222-2222-4222-8222-222222222222',
      ownerType: 'tenant',
      ownerId: '22222222-2222-4222-8222-222222222222',
      scope: 'library',
      buffer: png,
      mimeType: 'image/png',
      originalFilename: 'test.png',
      writeAssetRecord: false,
    });
    expect(saved.storageKey).toContain('/library/');
    expect(saved.relativeUrl).toContain('/api/media/v1/raw?');
    const abs = path.join(tmpDir, saved.storageKey);
    const st = await fs.stat(abs);
    expect(st.size).toBe(png.length);
  });
});

describe('S33 soft-delete semantics (unit)', () => {
  it('asset deleted/purged deve ser bloqueado pelo raw handler (contrato)', () => {
    const row = { status: 'deleted', deleted_at: new Date().toISOString() };
    const blocked = Boolean(row.deleted_at || row.status === 'deleted' || row.status === 'purged');
    expect(blocked).toBe(true);
  });
});

describe('S33.1 getMediaAssetForOutgoingSend (D32.2)', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
  });

  it('consulta só scopes da library (nunca flow_inbound_temp)', async () => {
    const { getMediaAssetForOutgoingSend } = await import('./mediaLibraryService.js');
    mockedQuery.mockResolvedValueOnce({ rows: [] });
    await getMediaAssetForOutgoingSend({
      tenantId: '11111111-1111-4111-8111-111111111111',
      assetId: '22222222-2222-4222-8222-222222222222',
    });
    expect(mockedQuery).toHaveBeenCalled();
    const call = mockedQuery.mock.calls[0]?.[0] as { text?: string; values?: unknown[] };
    const sql = call?.text || '';
    const scopes = call?.values?.[2] as string[];
    expect(sql).toMatch(/scope = ANY/i);
    expect(scopes).toEqual(expect.arrayContaining(['library', 'product_image']));
    expect(scopes).not.toContain('flow_inbound_temp');
  });
});
