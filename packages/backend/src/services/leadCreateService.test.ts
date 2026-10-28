import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

import { pool } from '../utils/db.js';
import {
  LeadValidationError,
  insertLead,
  prepareLeadFields,
  resolveTenantLeadStatus,
} from './leadCreateService.js';

const query = vi.mocked(pool.query);

describe('prepareLeadFields', () => {
  it('painel usa source Outros e aceita status livre', () => {
    const lead = prepareLeadFields({ name: 'Maria', status: 'Qualquer' }, 'Outros');
    expect(lead.source).toBe('Outros');
    expect(lead.status).toBe('Qualquer');
    expect(lead.profile_id).toBeNull();
  });

  it('API usa source API quando a origem vem vazia', () => {
    const lead = prepareLeadFields({ name: 'Maria', source: '  ' }, 'API');
    expect(lead.source).toBe('API');
  });

  it('rejeita CPF curto', () => {
    expect(() => prepareLeadFields({ name: 'Maria', cpf_cnpj: '123' }, 'API')).toThrow(LeadValidationError);
    expect(() => prepareLeadFields({ name: 'Maria', cpf_cnpj: '123' }, 'API')).toThrow(/11/);
  });

  it('aceita CPF de 11 dígitos', () => {
    const lead = prepareLeadFields({ name: 'Maria', cpf_cnpj: '123.456.789-01' }, 'API');
    expect(lead.cpf_cnpj).toBe('12345678901');
  });

  it('guarda observação em texto e ignora só espaços', () => {
    const lead = prepareLeadFields({ name: 'Maria', observacao: '  Veio do site  ' }, 'API');
    expect(lead.observacao).toBe('Veio do site');
    expect(prepareLeadFields({ name: 'Maria', observacao: '   ' }, 'API').observacao).toBeNull();
  });
});

describe('resolveTenantLeadStatus', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('devolve o nome da fase como está no CRM', async () => {
    query.mockResolvedValue({ rows: [{ name: 'Novo' }], rowCount: 1 } as never);
    await expect(resolveTenantLeadStatus('tenant-1', 'novo')).resolves.toBe('Novo');
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('lower(btrim(ls.name))');
    expect(sql).not.toContain('ls.user_id = $1');
  });

  it('rejeita fase que não existe na conta', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 } as never);
    await expect(resolveTenantLeadStatus('tenant-1', 'Fantasma')).rejects.toThrow('Status de lead não encontrado.');
  });
});

describe('insertLead', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('grava o user_id informado e não o perfil quando vem nulo', async () => {
    query.mockResolvedValue({ rows: [{ id: 'lead-1' }], rowCount: 1 } as never);
    const prepared = prepareLeadFields({ name: 'Maria' }, 'API');
    await insertLead('owner-1', { ...prepared, profile_id: null });
    const params = query.mock.calls[0]?.[1] as unknown[];
    expect(String(query.mock.calls[0]?.[0])).toMatch(/INSERT INTO leads/i);
    expect(params[0]).toBe('owner-1');
    expect(params[5]).toBe('API');
    expect(params[8]).toBeNull();
  });
});
