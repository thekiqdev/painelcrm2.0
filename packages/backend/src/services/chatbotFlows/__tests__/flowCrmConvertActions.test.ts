import { describe, expect, it } from 'vitest';
import { classifyCrmConvertOutcome } from '../flowCrmConvertActions.js';

describe('classifyCrmConvertOutcome', () => {
  it('to_lead + client → already_client', () => {
    expect(
      classifyCrmConvertOutcome({
        mode: 'to_lead',
        clientId: 'c1',
        leadId: 'l1',
        hasIdentity: true,
      })
    ).toMatchObject({ outHandle: 'already_client', result: 'unchanged' });
  });

  it('to_lead + lead → default unchanged', () => {
    expect(
      classifyCrmConvertOutcome({
        mode: 'to_lead',
        leadId: 'l1',
        hasIdentity: true,
      })
    ).toMatchObject({ outHandle: 'default', result: 'unchanged' });
  });

  it('to_lead sem identidade → error', () => {
    expect(
      classifyCrmConvertOutcome({
        mode: 'to_lead',
        hasIdentity: false,
      })
    ).toMatchObject({ outHandle: 'error', error: 'insufficient_identity' });
  });

  it('to_client + client → default unchanged', () => {
    expect(
      classifyCrmConvertOutcome({
        mode: 'to_client',
        clientId: 'c1',
        hasIdentity: false,
      })
    ).toMatchObject({ outHandle: 'default', result: 'unchanged' });
  });

  it('to_client unlinked sem identidade → error', () => {
    expect(
      classifyCrmConvertOutcome({
        mode: 'to_client',
        hasIdentity: false,
      })
    ).toMatchObject({ outHandle: 'error', error: 'insufficient_identity' });
  });
});
