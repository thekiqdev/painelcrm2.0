import { strict as assert } from 'assert';
import { saveFromBuffer } from '../services/media/mediaService.js';
import { getMediaRawBySignedKey } from '../services/media/mediaController.js';
import { signMediaStorageKey } from '../services/media/mediaUrlSigner.js';
import { resolveAbsolutePath } from '../services/media/mediaLocalStorageAdapter.js';

type MockRes = {
  statusCode: number;
  headers: Record<string, string>;
  body: Buffer | string;
  type: (t: string) => MockRes;
  status: (c: number) => MockRes;
  setHeader: (k: string, v: string) => void;
  send: (b: Buffer | string) => void;
};

function makeRes(): MockRes {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    type(t: string) {
      this.headers['content-type'] = t;
      return this;
    },
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    setHeader(k: string, v: string) {
      this.headers[k.toLowerCase()] = v;
    },
    send(b: Buffer | string) {
      this.body = b;
    },
  };
}

async function run(): Promise<void> {
  const fakeImage = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
  const saved = await saveFromBuffer({
    tenantId: 'test-tenant',
    ownerType: 'product',
    ownerId: 'product-1',
    scope: 'product_image',
    buffer: fakeImage,
    mimeType: 'image/png',
    originalFilename: 'a.png',
  });

  assert(saved.relativeUrl.startsWith('/api/media/v1/raw?'), 'relativeUrl deve usar endpoint novo');
  assert(!saved.relativeUrl.includes('localhost'), 'relativeUrl não pode conter localhost');

  const k = Buffer.from(saved.storageKey, 'utf8').toString('base64url');
  const s = signMediaStorageKey(saved.storageKey);

  const okReq = { query: { k, s } };
  const okRes = makeRes();
  await getMediaRawBySignedKey(okReq as any, okRes as any);
  assert.equal(okRes.statusCode, 200, 'GET /api/media/v1/raw deveria retornar 200');
  assert(Buffer.isBuffer(okRes.body), 'corpo deve ser buffer');

  const invalidSigReq = { query: { k, s: `${s}x` } };
  const invalidSigRes = makeRes();
  await getMediaRawBySignedKey(invalidSigReq as any, invalidSigRes as any);
  assert.equal(invalidSigRes.statusCode, 400, 'assinatura inválida deve retornar 400');

  let blocked = false;
  try {
    resolveAbsolutePath('../evil.png');
  } catch {
    blocked = true;
  }
  assert(blocked, 'storageKey com ../ deve ser bloqueado');

  const missingKey = 'tenants/test-tenant/product_image/product/not-found/nope.png';
  const missingReq = {
    query: {
      k: Buffer.from(missingKey, 'utf8').toString('base64url'),
      s: signMediaStorageKey(missingKey),
    },
  };
  const missingRes = makeRes();
  await getMediaRawBySignedKey(missingReq as any, missingRes as any);
  assert.equal(missingRes.statusCode, 404, 'arquivo inexistente deve retornar 404');

  console.log('OK: media service base tests passed');
  console.log(
    JSON.stringify(
      {
        storageKey: saved.storageKey,
        relativeUrl: saved.relativeUrl,
        checksum: saved.checksum,
        sizeBytes: saved.sizeBytes,
      },
      null,
      2
    )
  );
}

void run();
