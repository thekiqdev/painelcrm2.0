import { describe, expect, it } from 'vitest';
import {
  evalConditionRule,
  migrateConditionGraph,
  migrateLegacyConditionData,
  normalizeConditionCases,
  pickConditionHandle,
  type ConditionCase,
} from './conditionHelpers.js';

describe('conditionHelpers S17', () => {
  it('migra data legado para cases[0]', () => {
    const migrated = migrateLegacyConditionData({
      variable: 'name',
      operator: 'eq',
      value: 'vip',
    });
    const cases = normalizeConditionCases(migrated.cases);
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({
      id: 'c1',
      join: 'and',
      conditions: [{ variable: 'name', operator: 'eq', value: 'vip' }],
    });
  });

  it('migra edges true/false → case:/else', () => {
    const g = migrateConditionGraph({
      nodes: [
        {
          id: 'c1',
          type: 'condition',
          data: { variable: 'x', operator: 'eq', value: '1' },
        },
      ],
      edges: [
        { id: 'e1', source: 'c1', target: 'a', sourceHandle: 'true' },
        { id: 'e2', source: 'c1', target: 'b', sourceHandle: 'false' },
      ],
    });
    expect((g.nodes![0] as { data: { cases: unknown[] } }).data.cases).toHaveLength(1);
    expect(g.edges).toEqual([
      { id: 'e1', source: 'c1', target: 'a', sourceHandle: 'case:c1' },
      { id: 'e2', source: 'c1', target: 'b', sourceHandle: 'else' },
    ]);
  });

  it('operadores eq/neq/contains/exists/empty', () => {
    const vars = { name: 'Ana', tag: 'VIP-x', empty: '' };
    expect(evalConditionRule({ variable: 'name', operator: 'eq', value: 'Ana' }, vars)).toBe(true);
    expect(evalConditionRule({ variable: 'name', operator: 'neq', value: 'Ana' }, vars)).toBe(false);
    expect(evalConditionRule({ variable: 'tag', operator: 'contains', value: 'vip' }, vars)).toBe(
      true
    );
    expect(evalConditionRule({ variable: 'name', operator: 'exists', value: '' }, vars)).toBe(true);
    expect(evalConditionRule({ variable: 'empty', operator: 'empty', value: '' }, vars)).toBe(true);
    expect(evalConditionRule({ variable: 'missing', operator: 'empty', value: '' }, vars)).toBe(
      true
    );
  });

  it('pickConditionHandle: primeiro case OR/AND e else', () => {
    const cases: ConditionCase[] = [
      {
        id: 'vip',
        name: 'VIP',
        join: 'and',
        conditions: [{ variable: 'name', operator: 'eq', value: 'vip' }],
      },
      {
        id: 'ana',
        name: 'Ana',
        join: 'or',
        conditions: [
          { variable: 'name', operator: 'eq', value: 'Ana' },
          { variable: 'name', operator: 'eq', value: 'ana' },
        ],
      },
    ];
    const data = { cases };
    expect(pickConditionHandle(data, { name: 'vip' })).toBe('case:vip');
    expect(pickConditionHandle(data, { name: 'Ana' })).toBe('case:ana');
    expect(pickConditionHandle(data, { name: 'outro' })).toBe('else');
  });
});
