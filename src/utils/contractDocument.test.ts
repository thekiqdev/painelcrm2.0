import { describe, expect, it } from 'vitest';
import { isContractDraft, isContractRevisionAllowed } from './contractDocument';

describe('isContractRevisionAllowed', () => {
  it('permite rascunho e enviado sem assinatura', () => {
    expect(isContractDraft('DRAFT')).toBe(true);
    expect(isContractRevisionAllowed('DRAFT')).toBe(true);
    expect(isContractRevisionAllowed('PENDING_SIGNATURE')).toBe(true);
  });

  it('bloqueia após qualquer assinatura ou encerramento', () => {
    expect(isContractRevisionAllowed('PARTIALLY_SIGNED')).toBe(false);
    expect(isContractRevisionAllowed('ACTIVE')).toBe(false);
    expect(isContractRevisionAllowed('INACTIVE')).toBe(false);
    expect(isContractRevisionAllowed('EXPIRED')).toBe(false);
    expect(isContractRevisionAllowed('CANCELLED')).toBe(false);
  });
});
