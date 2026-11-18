import { describe, expect, it } from 'vitest';
import {
  clientBillingDigits,
  documentPatchSql,
  externalDocumentPatch,
  newClientDocumentColumns,
  presentDocumentKeys,
  resolveClientDocumentPatch,
} from './clientDocumentFields.js';

const CPF = '52998224725';
const CNPJ = '64033061000138';

describe('resolveClientDocumentPatch', () => {
  it('o primeiro documento vira a cobrança', () => {
    const body = { cpf: CPF, cnpj: CNPJ };
    const patch = resolveClientDocumentPatch(body, presentDocumentKeys(body), null);
    expect(patch).toMatchObject({
      cpf: CPF,
      cnpj: CNPJ,
      billing_document: 'cpf',
      cpf_cnpj: CPF,
    });
  });

  it('só CNPJ cobra por CNPJ', () => {
    const body = { cnpj: '64.033.061/0001-38' };
    const patch = resolveClientDocumentPatch(body, presentDocumentKeys(body), null);
    expect(patch).toMatchObject({
      cnpj: CNPJ,
      billing_document: 'cnpj',
      cpf_cnpj: CNPJ,
    });
  });

  it('gravar o segundo documento não troca a estrela', () => {
    const body = { cnpj: CNPJ };
    const patch = resolveClientDocumentPatch(body, presentDocumentKeys(body), {
      cpf: CPF,
      cnpj: null,
      billing_document: 'cpf',
      cpf_cnpj: CPF,
    });
    expect(patch).toEqual({ cnpj: CNPJ });
  });

  it('atualizar só o RG não mexe no documento do Asaas', () => {
    const body = { rg: '12.345.678-9' };
    const patch = resolveClientDocumentPatch(body, presentDocumentKeys(body), {
      cpf: CPF,
      cnpj: null,
      billing_document: 'cpf',
      cpf_cnpj: CPF,
    });
    expect(patch).toEqual({ rg: '12.345.678-9' });
  });

  it('corrigir o CPF da estrela atualiza o documento de cobrança', () => {
    const body = { cpf: '390.533.447-05' };
    const patch = resolveClientDocumentPatch(body, presentDocumentKeys(body), {
      cpf: CPF,
      cnpj: CNPJ,
      billing_document: 'cpf',
      cpf_cnpj: CPF,
    });
    expect(patch.billing_document).toBe('cpf');
    expect(patch.cpf_cnpj).toBe('39053344705');
  });

  it('recusa CPF inválido', () => {
    const body = { cpf: '111.111.111-11' };
    expect(() => resolveClientDocumentPatch(body, presentDocumentKeys(body), null)).toThrow(/CPF inválido/);
  });

  it('campo único antigo de 14 dígitos marca CNPJ', () => {
    const body = { cpf_cnpj: CNPJ };
    const patch = resolveClientDocumentPatch(body, presentDocumentKeys(body), null);
    expect(patch).toMatchObject({
      cnpj: CNPJ,
      billing_document: 'cnpj',
      cpf_cnpj: CNPJ,
    });
  });
});

describe('documento de cobrança na fatura', () => {
  it('a estrela ganha de um espelho diferente', () => {
    expect(clientBillingDigits({
      cpf: CPF,
      cnpj: CNPJ,
      billing_document: 'cpf',
      cpf_cnpj: CNPJ,
    })).toBe(CPF);
  });

  it('sem estrela, o espelho antigo continua valendo', () => {
    expect(clientBillingDigits({ cpf: null, cnpj: null, billing_document: null, cpf_cnpj: CPF })).toBe(CPF);
  });

  it('cliente novo com CPF marca a estrela nesse documento', () => {
    expect(newClientDocumentColumns(CPF)).toEqual({
      cpf: CPF,
      cnpj: null,
      billing_document: 'cpf',
      cpf_cnpj: CPF,
    });
  });

  it('link ou loja não troca a estrela nem o espelho', () => {
    const patch = externalDocumentPatch({
      cpf: CPF,
      cnpj: null,
      billing_document: 'cpf',
      cpf_cnpj: CPF,
    }, CNPJ);
    expect(patch).toEqual({ cnpj: CNPJ });
    expect(documentPatchSql(patch, 'client-1')?.text).toContain('cnpj = $1');
    expect(documentPatchSql(patch, 'client-1')?.text).not.toContain('cpf_cnpj');
  });

  it('sem documento, o número recebido vira a estrela', () => {
    expect(externalDocumentPatch({
      cpf: null,
      cnpj: null,
      billing_document: null,
      cpf_cnpj: null,
    }, CNPJ)).toEqual({
      cnpj: CNPJ,
      billing_document: 'cnpj',
      cpf_cnpj: CNPJ,
    });
  });
});
