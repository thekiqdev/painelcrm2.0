import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

vi.mock('../utils/db.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock('./media/mediaLibraryService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./media/mediaLibraryService.js')>();
  return {
    ...actual,
    getMediaAssetForOutgoingSend: vi.fn(),
  };
});

import { pool } from '../utils/db.js';
import {
  getMediaAssetForOutgoingSend,
  isExcludedFromMediaLibrary,
} from './media/mediaLibraryService.js';
import { resolveOutgoingMediaPayload } from './outgoingMediaPayloadResolver.js';
import { buildMediaRawSignedRelativeUrl } from './media/mediaUrlSigner.js';
import { saveBuffer } from './media/mediaLocalStorageAdapter.js';

const mockedQuery = pool.query as unknown as ReturnType<typeof vi.fn>;
const mockedGetAsset = getMediaAssetForOutgoingSend as unknown as ReturnType<typeof vi.fn>;

describe('S33.1 resolveOutgoingMediaPayload media v1', () => {
  let tmpRoot: string;
  const prevRoot = process.env.MEDIA_STORAGE_ROOT;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'media-s331-'));
    process.env.MEDIA_STORAGE_ROOT = tmpRoot;
    mockedQuery.mockReset();
    mockedGetAsset.mockReset();
    mockedQuery.mockResolvedValue({ rows: [] });
  });

  afterEach(async () => {
    if (prevRoot === undefined) delete process.env.MEDIA_STORAGE_ROOT;
    else process.env.MEDIA_STORAGE_ROOT = prevRoot;
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('resolve por assetId lê disco e devolve data URI', async () => {
    const storageKey = 'tenants/t1/library/tenant/t1/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.png';
    await saveBuffer(storageKey, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    mockedGetAsset.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      tenantId: '22222222-2222-4222-8222-222222222222',
      scope: 'library',
      storageKey,
      mimeType: 'image/png',
      sizeBytes: 8,
      checksum: null,
      originalFilename: 'logo.png',
      status: 'ready',
      relativeUrl: buildMediaRawSignedRelativeUrl(storageKey),
      createdBy: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const resolved = await resolveOutgoingMediaPayload({
      type: 'image',
      assetId: '11111111-1111-4111-8111-111111111111',
      tenantId: '22222222-2222-4222-8222-222222222222',
    });

    expect(resolved.strategy).toBe('data_uri');
    expect(resolved.mimeType).toBe('image/png');
    expect(resolved.fileForProvider.startsWith('data:image/png;base64,')).toBe(true);
    expect(resolved.persistedUrl).toContain('/api/media/v1/raw');
  });

  it('resolve por URL relativa media v1', async () => {
    const storageKey = 'tenants/t1/library/tenant/t1/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pdf';
    await saveBuffer(storageKey, Buffer.from('%PDF-1.4 mock'));
    const relativeUrl = buildMediaRawSignedRelativeUrl(storageKey);

    const resolved = await resolveOutgoingMediaPayload({
      type: 'document',
      fileUrl: relativeUrl,
      mimeType: 'application/pdf',
    });

    expect(resolved.strategy).toBe('data_uri');
    expect(resolved.fileForProvider.startsWith('data:application/pdf;base64,')).toBe(true);
  });

  it('assetId inexistente falha', async () => {
    mockedGetAsset.mockResolvedValue(null);
    await expect(
      resolveOutgoingMediaPayload({
        type: 'image',
        assetId: '11111111-1111-4111-8111-111111111111',
        tenantId: '22222222-2222-4222-8222-222222222222',
      }),
    ).rejects.toThrow(/media_asset_not_found/);
  });

  it('inbound temp continua excluído da library (D32.2)', () => {
    expect(isExcludedFromMediaLibrary('flow_inbound_temp')).toBe(true);
  });
});
