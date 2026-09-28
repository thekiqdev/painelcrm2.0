import { describe, expect, it } from 'vitest';
import {
  isContractRevisionAllowed,
  isDocumentFrozen,
  isDraftStatus,
  isPendingSignatureStatus,
} from './contractLifecycle.js';

describe('contractLifecycle freeze / revisão', () => {
  it('rascunho e enviado sem assinatura permanecem editáveis', () => {
    expect(isDraftStatus('DRAFT')).toBe(true);
    expect(isPendingSignatureStatus('PENDING_SIGNATURE')).toBe(true);
    expect(isContractRevisionAllowed('DRAFT')).toBe(true);
    expect(isContractRevisionAllowed('PENDING_SIGNATURE')).toBe(true);
    expect(isDocumentFrozen('DRAFT')).toBe(false);
    expect(isDocumentFrozen('PENDING_SIGNATURE')).toBe(false);
  });

  it('congela após qualquer assinatura ou encerramento', () => {
    for (const status of ['PARTIALLY_SIGNED', 'ACTIVE', 'INACTIVE', 'EXPIRED', 'CANCELLED']) {
      expect(isContractRevisionAllowed(status)).toBe(false);
      expect(isDocumentFrozen(status)).toBe(true);
    }
  });
});
