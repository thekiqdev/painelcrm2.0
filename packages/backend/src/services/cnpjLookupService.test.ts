import { describe, expect, it, vi } from 'vitest';
import { CnpjLookupError, lookupCnpj } from './cnpjLookupService.js';

const CNPJ = '64033061000138';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('lookupCnpj', () => {
  it('recusa CNPJ inválido sem chamar a Brasil API', async () => {
    const fetchImpl = vi.fn();
    await expect(lookupCnpj('11111111111111', fetchImpl as unknown as typeof fetch)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('devolve razão social e nome fantasia', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { razao_social: '  CARITAS  ', nome_fantasia: ' Fantasia ' }),
    );
    await expect(lookupCnpj(CNPJ, fetchImpl as unknown as typeof fetch)).resolves.toEqual({
      razao_social: 'CARITAS',
      nome_fantasia: 'Fantasia',
    });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(`/cnpj/v1/${CNPJ}`);
  });

  it('nome fantasia vazio volta nulo', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { razao_social: 'Empresa', nome_fantasia: '  ' }));
    await expect(lookupCnpj(CNPJ, fetchImpl as unknown as typeof fetch)).resolves.toEqual({
      razao_social: 'Empresa',
      nome_fantasia: null,
    });
  });

  it('CNPJ inexistente não inventa razão social', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(404, { message: 'não encontrado' }));
    await expect(lookupCnpj(CNPJ, fetchImpl as unknown as typeof fetch)).rejects.toBeInstanceOf(CnpjLookupError);
  });

  it('falha da consulta não devolve dados', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    });
    await expect(lookupCnpj(CNPJ, fetchImpl as unknown as typeof fetch)).rejects.toMatchObject({
      statusCode: 503,
    });
  });
});
