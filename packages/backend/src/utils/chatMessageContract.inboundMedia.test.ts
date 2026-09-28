import { describe, expect, it } from 'vitest';
import {
  isOurSignedMediaUrl,
  isRealInboundMediaFileUrl,
  mediaItemsHaveRealFileUrl,
  type ChatMediaItem,
} from './chatMessageContract.js';

describe('chat inbound media URL helpers (Sprint 1)', () => {
  it('detecta URL assinada nossa', () => {
    expect(isOurSignedMediaUrl('/api/media/v1/raw?k=abc&s=xyz')).toBe(true);
    expect(isOurSignedMediaUrl('https://crm.example/api/media/v1/raw?k=1&s=2')).toBe(true);
    expect(isOurSignedMediaUrl('https://free.uazapi.com/file/x.pdf')).toBe(false);
  });

  it('http(s) remoto conta como ficheiro real', () => {
    expect(
      isRealInboundMediaFileUrl('https://free.uazapi.com/file/doc.pdf', 'document')
    ).toBe(true);
  });

  it('thumbnail data:image em documento NÃO conta como ficheiro', () => {
    const thumb = 'data:image/jpeg;base64,/9j/4AAQ';
    expect(isRealInboundMediaFileUrl(thumb, 'document')).toBe(false);
    expect(
      mediaItemsHaveRealFileUrl([{ type: 'document', url: thumb, persistentStub: true }])
    ).toBe(false);
  });

  it('data:application/pdf conta como ficheiro', () => {
    expect(isRealInboundMediaFileUrl('data:application/pdf;base64,JVBERi0=', 'document')).toBe(
      true
    );
  });

  it('imagem data:image é renderizável', () => {
    expect(isRealInboundMediaFileUrl('data:image/png;base64,iVBOR', 'image')).toBe(true);
  });

  it('lista com só stub de documento → sem ficheiro real', () => {
    const items: ChatMediaItem[] = [
      {
        type: 'document',
        url: 'data:image/jpeg;base64,abc',
        fileName: 'proposta.pdf',
        persistentStub: true,
      },
    ];
    expect(mediaItemsHaveRealFileUrl(items, 'document')).toBe(false);
  });

  it('lista com URL nossa → tem ficheiro real', () => {
    const items: ChatMediaItem[] = [
      { type: 'document', url: '/api/media/v1/raw?k=x&s=y', fileName: 'a.pdf' },
    ];
    expect(mediaItemsHaveRealFileUrl(items)).toBe(true);
  });
});
