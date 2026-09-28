import { describe, expect, it } from 'vitest';
import { humanizeMediaUploadError } from '@/utils/humanizeMediaUploadError';

describe('humanizeMediaUploadError', () => {
  it('mapeia 413 / entity too large', () => {
    expect(humanizeMediaUploadError('413 Request Entity Too Large', { status: 413 })).toMatch(
      /demasiado grande/i,
    );
    expect(humanizeMediaUploadError(new Error('Request Entity Too Large'))).toMatch(/demasiado grande/i);
  });

  it('mapeia limite Multer / API', () => {
    expect(humanizeMediaUploadError('Arquivo muito grande.')).toMatch(/demasiado grande/i);
  });

  it('não devolve HTML do nginx', () => {
    const html = '<html><head><title>413</title></head><body>Request Entity Too Large</body></html>';
    const msg = humanizeMediaUploadError(html);
    expect(msg).not.toMatch(/<html/i);
    expect(msg).toMatch(/demasiado grande|não foi possível enviar/i);
  });

  it('preserva mensagem útil sem HTML', () => {
    expect(humanizeMediaUploadError('Tipo de arquivo não permitido na Media Library.')).toBe(
      'Tipo de arquivo não permitido na Media Library.',
    );
  });
});
