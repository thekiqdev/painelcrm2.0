import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  buildAbsoluteMediaRawUrl,
  enrichInboundMediaForWaitInput,
  isFlowInboundTempLibraryScope,
  persistFlowInboundTempMedia,
} from './flowInboundTempMedia.js';
import {
  buildMediaRawSignedRelativeUrl,
  signMediaStorageKey,
  verifyMediaSignature,
  MEDIA_RAW_SIGNED_PATH,
} from '../media/mediaUrlSigner.js';
import { buildWebhookOutBody } from './flowHttpActions.js';
import { interpolateTemplate } from './flowRuntimeEngine.js';

describe('S32.1 media URL signer TTL', () => {
  it('assina e verifica com expiresAtUnix', () => {
    const key = 'tenants/t1/flow_inbound_temp/conversation/c1/a.pdf';
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const s = signMediaStorageKey(key, exp);
    expect(verifyMediaSignature(key, s, exp)).toBe(true);
    expect(verifyMediaSignature(key, s)).toBe(false);
    expect(verifyMediaSignature(key, s, exp + 1)).toBe(false);
  });

  it('buildMediaRawSignedRelativeUrl inclui e=', () => {
    const key = 'tenants/t1/flow_inbound_temp/conversation/c1/a.pdf';
    const exp = 1_900_000_000;
    const url = buildMediaRawSignedRelativeUrl(key, { expiresAtUnix: exp });
    expect(url.startsWith(`${MEDIA_RAW_SIGNED_PATH}?`)).toBe(true);
    const u = new URL(url, 'https://example.test');
    expect(u.searchParams.get('e')).toBe(String(exp));
    expect(u.searchParams.get('k')).toBeTruthy();
    expect(u.searchParams.get('s')).toBeTruthy();
    expect(
      verifyMediaSignature(
        key,
        u.searchParams.get('s') || '',
        Number(u.searchParams.get('e'))
      )
    ).toBe(true);
  });

  it('assinatura legada sem e continua válida', () => {
    const key = 'tenants/t1/product_image/product/p1/x.png';
    const s = signMediaStorageKey(key);
    expect(verifyMediaSignature(key, s)).toBe(true);
    expect(verifyMediaSignature(key, s, null)).toBe(true);
  });
});

describe('S32.1 persistFlowInboundTempMedia', () => {
  let prevRoot: string | undefined;
  let prevBase: string | undefined;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flow-inbound-'));
    prevRoot = process.env.MEDIA_STORAGE_ROOT;
    prevBase = process.env.API_PUBLIC_BASE_URL;
    process.env.MEDIA_STORAGE_ROOT = tmpDir;
    process.env.API_PUBLIC_BASE_URL = 'https://crm.example.com';
    process.env.MEDIA_ASSETS_WRITE_ENABLED = 'false';
  });

  afterEach(async () => {
    if (prevRoot === undefined) delete process.env.MEDIA_STORAGE_ROOT;
    else process.env.MEDIA_STORAGE_ROOT = prevRoot;
    if (prevBase === undefined) delete process.env.API_PUBLIC_BASE_URL;
    else process.env.API_PUBLIC_BASE_URL = prevBase;
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('download mock → URL assinada no nosso domínio', async () => {
    const pdf = Buffer.from('%PDF-1.4 mock extrato');
    const fetchImpl = vi.fn(async () => {
      return new Response(pdf, {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      });
    }) as unknown as typeof fetch;

    const r = await persistFlowInboundTempMedia({
      tenantId: '11111111-1111-4111-8111-111111111111',
      conversationId: '22222222-2222-4222-8222-222222222222',
      sessionId: '33333333-3333-4333-8333-333333333333',
      sourceUrl: 'https://uazapi.example/file/extrato.pdf',
      mimeHint: 'application/pdf',
      originalFilename: 'extrato_inss.pdf',
      fetchImpl,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.absoluteUrl.startsWith('https://crm.example.com/api/media/v1/raw?')).toBe(true);
    expect(r.absoluteUrl).toContain('e=');
    expect(r.storageKey).toContain('/flow_inbound_temp/');
    expect(r.mimeType).toBe('application/pdf');
    expect(r.sizeBytes).toBe(pdf.length);
    expect(fetchImpl).toHaveBeenCalledOnce();

    const abs = path.join(tmpDir, r.storageKey);
    const onDisk = await fs.readFile(abs);
    expect(onDisk.equals(pdf)).toBe(true);
  });

  it('falha de download remota → reason clara', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 403 })) as unknown as typeof fetch;
    const r = await persistFlowInboundTempMedia({
      tenantId: '11111111-1111-4111-8111-111111111111',
      sourceUrl: 'https://uazapi.example/gone.pdf',
      fetchImpl,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('remote_http_403');
  });

  it('enrichInboundMediaForWaitInput sobrescreve url da mídia aceite', async () => {
    const pdf = Buffer.from('%PDF-1.4 enrich');
    const fetchImpl = vi.fn(async () => {
      return new Response(pdf, {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      });
    }) as unknown as typeof fetch;

    const enriched = await enrichInboundMediaForWaitInput({
      tenantId: '11111111-1111-4111-8111-111111111111',
      conversationId: '22222222-2222-4222-8222-222222222222',
      sessionId: 's1',
      waitNodeData: { accept: 'media', media_kinds: ['document'], variable: 'arquivo' },
      inboundMedia: [
        {
          type: 'document',
          url: 'https://cdn.whatsapp.net/extrato.pdf',
          fileName: 'extrato_inss.pdf',
          mimetype: 'application/pdf',
        },
      ],
      fetchImpl,
    });

    expect(enriched.ok).toBe(true);
    if (!enriched.ok) return;
    const url = String(enriched.inboundMedia?.[0]?.url || '');
    expect(url.startsWith('https://crm.example.com/api/media/v1/raw?')).toBe(true);
    expect(url).not.toContain('whatsapp.net');
  });

  it('accept:text não baixa', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const enriched = await enrichInboundMediaForWaitInput({
      tenantId: '11111111-1111-4111-8111-111111111111',
      conversationId: '22222222-2222-4222-8222-222222222222',
      sessionId: 's1',
      waitNodeData: { accept: 'text' },
      inboundMedia: [
        { type: 'document', url: 'https://cdn.example/a.pdf', mimetype: 'application/pdf' },
      ],
      fetchImpl,
    });
    expect(enriched.ok).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('S32.1 webhook_out + helpers', () => {
  it('buildAbsoluteMediaRawUrl usa API_PUBLIC_BASE_URL', () => {
    const prev = process.env.API_PUBLIC_BASE_URL;
    process.env.API_PUBLIC_BASE_URL = 'https://api.me.test';
    expect(buildAbsoluteMediaRawUrl('/api/media/v1/raw?k=1&s=2')).toBe(
      'https://api.me.test/api/media/v1/raw?k=1&s=2'
    );
    if (prev === undefined) delete process.env.API_PUBLIC_BASE_URL;
    else process.env.API_PUBLIC_BASE_URL = prev;
  });

  it('flow_inbound_temp ≠ library', () => {
    expect(isFlowInboundTempLibraryScope('flow_inbound_temp')).toBe(true);
    expect(isFlowInboundTempLibraryScope('product_image')).toBe(false);
  });

  it('webhook_out custom com URL nossa (contrato §3)', () => {
    const ourUrl =
      'https://crm.example.com/api/media/v1/raw?k=abc&s=sig&e=1900000000';
    const vars = {
      cpf: '42362903400',
      'arquivo.url': ourUrl,
      'arquivo.nome': 'extrato_inss.pdf',
      'arquivo.tipo': 'application/pdf',
      arquivo: {
        url: ourUrl,
        nome: 'extrato_inss.pdf',
        tipo: 'application/pdf',
      },
    };
    const body = buildWebhookOutBody({
      payloadMode: 'custom',
      bodyTemplate: JSON.stringify({
        cpf: '{{cpf}}',
        arquivo: {
          nome: '{{arquivo.nome}}',
          tipo: '{{arquivo.tipo}}',
          url: '{{arquivo.url}}',
        },
      }),
      variables: vars,
      conversationId: 'c1',
      tenantId: 't1',
      includeSessionVars: false,
    });
    const parsed = JSON.parse(body);
    expect(parsed).toEqual({
      cpf: '42362903400',
      arquivo: {
        nome: 'extrato_inss.pdf',
        tipo: 'application/pdf',
        url: ourUrl,
      },
    });
    expect(parsed.arquivo.url).toContain('/api/media/v1/raw');
    expect(parsed.arquivo.url).not.toMatch(/whatsapp|uazapi/i);
    expect(interpolateTemplate('{{arquivo.url}}', vars)).toBe(ourUrl);
  });
});

describe('S32.1 expiry semantics (unit)', () => {
  it('URL expirada: verify ok mas e no passado → caller deve 410', () => {
    const key = 'tenants/t1/flow_inbound_temp/conversation/c1/a.pdf';
    const exp = Math.floor(Date.now() / 1000) - 10;
    const s = signMediaStorageKey(key, exp);
    expect(verifyMediaSignature(key, s, exp)).toBe(true);
    expect(Math.floor(Date.now() / 1000) > exp).toBe(true);
  });
});
