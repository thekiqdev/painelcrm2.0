import { describe, expect, it } from 'vitest';
import { extractPlaceholders, renderStrictTemplates } from './strictMergeRenderer.js';

describe('strictMergeRenderer', () => {
  it('extracts dotted placeholders', () => {
    expect(extractPlaceholders('{{tenant.name}} x {{client.name}}')).toEqual(['tenant.name', 'client.name']);
  });

  it('renders when all keys allowed and present', () => {
    const r = renderStrictTemplates({
      subjectTemplate: null,
      bodyTemplate: 'Olá {{client.name}} — {{tenant.name}}',
      context: { 'client.name': 'Maria', 'tenant.name': 'Acme' },
      allowedMergeFields: ['client.name', 'tenant.name'],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.body).toBe('Olá Maria — Acme');
  });

  it('fails on disallowed placeholder', () => {
    const r = renderStrictTemplates({
      subjectTemplate: null,
      bodyTemplate: '{{evil}}',
      context: { evil: 'x' },
      allowedMergeFields: ['tenant.name'],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.disallowedPlaceholders).toContain('evil');
  });

  it('fails on missing context key', () => {
    const r = renderStrictTemplates({
      subjectTemplate: null,
      bodyTemplate: '{{client.name}}',
      context: {},
      allowedMergeFields: ['client.name'],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missingKeys).toContain('client.name');
  });

  it('allows empty string value', () => {
    const r = renderStrictTemplates({
      subjectTemplate: null,
      bodyTemplate: '{{client.name}}',
      context: { 'client.name': '' },
      allowedMergeFields: ['client.name'],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.body).toBe('');
  });

  it('preserves line breaks in rendered body', () => {
    const r = renderStrictTemplates({
      subjectTemplate: null,
      bodyTemplate: 'Linha 1\n\nLinha 2\n{{tenant.name}}',
      context: { 'tenant.name': 'Acme' },
      allowedMergeFields: ['tenant.name'],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.body).toBe('Linha 1\n\nLinha 2\nAcme');
  });
});
