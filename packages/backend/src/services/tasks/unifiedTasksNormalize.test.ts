import { describe, expect, it } from 'vitest';

import { normalizeTaskStatus } from './unifiedTasksService.js';

describe('normalizeTaskStatus', () => {
  it('standalone: pending → todo, completed → done', () => {
    expect(normalizeTaskStatus('pending', 'standalone')).toBe('todo');
    expect(normalizeTaskStatus('completed', 'standalone')).toBe('done');
    expect(normalizeTaskStatus('cancelled', 'standalone')).toBe('done');
  });

  it('project: review/waiting → waiting, done → done', () => {
    expect(normalizeTaskStatus('todo', 'project')).toBe('todo');
    expect(normalizeTaskStatus('review', 'project')).toBe('waiting');
    expect(normalizeTaskStatus('waiting', 'project')).toBe('waiting');
    expect(normalizeTaskStatus('blocked', 'project')).toBe('waiting');
    expect(normalizeTaskStatus('done', 'project')).toBe('done');
    expect(normalizeTaskStatus('completed', 'project')).toBe('done');
  });

  it('client/lead: PT/EN comuns', () => {
    expect(normalizeTaskStatus('Pendente', 'client')).toBe('todo');
    expect(normalizeTaskStatus('Concluída', 'lead')).toBe('done');
    expect(normalizeTaskStatus('pending', 'client')).toBe('todo');
  });
});
