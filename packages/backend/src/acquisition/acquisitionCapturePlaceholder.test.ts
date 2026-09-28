import { describe, expect, it } from 'vitest';
import {
  isAcquisitionCaptureNamePlaceholder,
  normalizeCaptureNameForStorage,
  resolveLeadNameAfterCapture,
} from './acquisitionCapturePlaceholder.js';

describe('acquisitionCapturePlaceholder E2.1', () => {
  it('Solicitante não é persistido', () => {
    expect(normalizeCaptureNameForStorage('Solicitante')).toBeNull();
    expect(isAcquisitionCaptureNamePlaceholder('Solicitante')).toBe(true);
  });

  it('re-capture preserva nome real', () => {
    expect(resolveLeadNameAfterCapture('Maria Silva', 'Solicitante')).toBe('Maria Silva');
    expect(resolveLeadNameAfterCapture(null, 'Solicitante')).toBeNull();
    expect(resolveLeadNameAfterCapture('Solicitante', 'João')).toBe('João');
  });
});
