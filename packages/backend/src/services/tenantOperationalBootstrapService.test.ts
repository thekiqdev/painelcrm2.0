import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
const mockConnect = vi.fn();
const mockRelease = vi.fn();

vi.mock('../utils/db.js', () => ({
  pool: {
    connect: () => mockConnect(),
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

vi.mock('../utils/kanbanRlsTx.js', () => ({
  beginKanbanTxWithRls: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./whatsappTemplateDefaultsService.js', () => ({
  ensureWhatsAppTemplateDefaults: vi.fn().mockResolvedValue(undefined),
}));

import {
  ensureDefaultPrincipalTeam,
  ensureDefaultAtendimentoKanbanBoard,
  ensureTenantOperationalBootstrap,
  TENANT_BOOTSTRAP_DEFAULT_BOARD_NAME,
  TENANT_BOOTSTRAP_DEFAULT_TEAM_SLUG,
  TENANT_BOOTSTRAP_KANBAN_COLUMNS,
} from './tenantOperationalBootstrapService.js';
import { ensureWhatsAppTemplateDefaults } from './whatsappTemplateDefaultsService.js';

function makeClient() {
  return { query: mockQuery };
}

describe('tenantOperationalBootstrapService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue({
      query: mockQuery,
      release: mockRelease,
    });
  });

  it('cria equipe principal quando inexistente e adiciona admin', async () => {
    const client = makeClient();
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'team-1' }] })
      .mockResolvedValueOnce({ rowCount: 1 });

    const result = await ensureDefaultPrincipalTeam(client as never, 'tenant-1', 'user-1');

    expect(result.created).toBe(true);
    expect(result.id).toBe('team-1');
    expect(result.memberAdded).toBe(true);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO teams'),
      expect.arrayContaining([TENANT_BOOTSTRAP_DEFAULT_TEAM_SLUG]),
    );
  });

  it('reutiliza equipe existente sem duplicar', async () => {
    const client = makeClient();
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'existing-team' }] })
      .mockResolvedValueOnce({ rowCount: 0 });

    const result = await ensureDefaultPrincipalTeam(client as never, 'tenant-1', 'user-1');

    expect(result.created).toBe(false);
    expect(result.id).toBe('existing-team');
    expect(mockQuery.mock.calls.some((c) => String(c[0]).includes('INSERT INTO teams'))).toBe(false);
  });

  it('cria board Atendimento e colunas padrão', async () => {
    const client = makeClient();
    mockQuery.mockImplementation((sql: string) => {
      if (String(sql).includes('INSERT INTO chat_kanban_boards')) {
        return Promise.resolve({ rows: [] });
      }
      if (String(sql).includes('INSERT INTO chat_kanban_columns')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    const result = await ensureDefaultAtendimentoKanbanBoard(client as never, 'tenant-1', 'user-1');

    expect(result.created).toBe(true);
    expect(result.columnsEnsured).toBe(TENANT_BOOTSTRAP_KANBAN_COLUMNS.length);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO chat_kanban_boards'),
      expect.arrayContaining([TENANT_BOOTSTRAP_DEFAULT_BOARD_NAME]),
    );
  });

  it('não cria segundo board se Atendimento já existe', async () => {
    const client = makeClient();
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'board-existing' }] });
    for (let i = 0; i < TENANT_BOOTSTRAP_KANBAN_COLUMNS.length; i++) {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: `col-${i}` }] });
    }

    const result = await ensureDefaultAtendimentoKanbanBoard(client as never, 'tenant-1', 'user-1');

    expect(result.created).toBe(false);
    expect(result.boardId).toBe('board-existing');
    expect(result.columnsEnsured).toBe(0);
    expect(mockQuery.mock.calls.some((c) => String(c[0]).includes('INSERT INTO chat_kanban_boards'))).toBe(
      false,
    );
  });

  it('ensureTenantOperationalBootstrap chama templates WhatsApp', async () => {
    mockQuery.mockImplementation((sql: string) => {
      const s = String(sql);
      if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') {
        return Promise.resolve({ rows: [] });
      }
      if (s.includes('INSERT INTO teams')) {
        return Promise.resolve({ rows: [{ id: 'team-1' }] });
      }
      if (s.includes('INSERT INTO team_members')) {
        return Promise.resolve({ rowCount: 1 });
      }
      if (s.includes('INSERT INTO chat_kanban_boards') || s.includes('INSERT INTO chat_kanban_columns')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    const result = await ensureTenantOperationalBootstrap({
      tenantId: 'tenant-1',
      adminUserId: 'user-1',
    });

    expect(ensureWhatsAppTemplateDefaults).toHaveBeenCalledWith('tenant-1');
    expect(result.whatsappTemplates.ensured).toBe(true);
    expect(mockRelease).toHaveBeenCalled();
  });
});
