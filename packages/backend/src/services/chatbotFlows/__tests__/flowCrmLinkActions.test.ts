import { describe, expect, it } from 'vitest';
import { classifyCrmLinkKind } from '../flowCrmLinkActions.js';

describe('classifyCrmLinkKind', () => {
  it('prioriza cliente sobre lead', () => {
    expect(classifyCrmLinkKind({ clientId: 'c1', leadId: 'l1' })).toBe('client');
  });

  it('retorna lead sem cliente', () => {
    expect(classifyCrmLinkKind({ clientId: null, leadId: 'l1' })).toBe('lead');
  });

  it('retorna unlinked sem vínculo', () => {
    expect(classifyCrmLinkKind({})).toBe('unlinked');
  });
});
