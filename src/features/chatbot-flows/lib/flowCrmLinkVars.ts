/**
 * Helpers FE — vínculo CRM (S26).
 */
export type CrmLinkKind = 'client' | 'lead' | 'unlinked';

export function classifyCrmLinkKind(opts: {
  clientId?: string | null;
  leadId?: string | null;
}): CrmLinkKind {
  if (opts.clientId) return 'client';
  if (opts.leadId) return 'lead';
  return 'unlinked';
}

export function buildCrmLinkMapped(opts: {
  kind: CrmLinkKind;
  clientId?: string | null;
  leadId?: string | null;
  clientName?: string | null;
  leadName?: string | null;
}): Record<string, string> {
  const mapped: Record<string, string> = {
    'crm.link_kind': opts.kind,
    crm_link_kind: opts.kind,
    'client.id': opts.clientId || '',
    client_id: opts.clientId || '',
    'lead.id': opts.leadId || '',
    lead_id: opts.leadId || '',
  };
  if (opts.clientName) {
    mapped['client.name'] = opts.clientName;
    mapped.client_name = opts.clientName;
  }
  if (opts.leadName) {
    mapped['lead.name'] = opts.leadName;
    mapped.lead_name = opts.leadName;
  }
  return mapped;
}

export type CrmConvertMode = 'to_lead' | 'to_client';
export type CrmConvertOutHandle = 'default' | 'already_client' | 'error';
export type CrmConvertResult = 'created' | 'linked' | 'unchanged';

export function classifyCrmConvertOutcome(opts: {
  mode: CrmConvertMode;
  clientId?: string | null;
  leadId?: string | null;
  hasIdentity?: boolean;
}): { outHandle: CrmConvertOutHandle; result: CrmConvertResult | 'error'; error?: string } {
  const mode = opts.mode === 'to_client' ? 'to_client' : 'to_lead';
  const hasIdentity = opts.hasIdentity !== false;
  if (mode === 'to_lead') {
    if (opts.clientId) {
      return { outHandle: 'already_client', result: 'unchanged', error: 'already_client' };
    }
    if (opts.leadId) return { outHandle: 'default', result: 'unchanged' };
    if (!hasIdentity) {
      return { outHandle: 'error', result: 'error', error: 'insufficient_identity' };
    }
    return { outHandle: 'default', result: 'created' };
  }
  if (opts.clientId) return { outHandle: 'default', result: 'unchanged' };
  if (opts.leadId) return { outHandle: 'default', result: 'created' };
  if (!hasIdentity) {
    return { outHandle: 'error', result: 'error', error: 'insufficient_identity' };
  }
  return { outHandle: 'default', result: 'created' };
}

export function buildCrmConvertMapped(opts: {
  mode: CrmConvertMode;
  outHandle: CrmConvertOutHandle;
  result: CrmConvertResult | 'error' | '';
  clientId?: string | null;
  leadId?: string | null;
  clientName?: string | null;
  leadName?: string | null;
  error?: string;
}): Record<string, string> {
  const kind =
    opts.outHandle === 'already_client' || opts.clientId
      ? 'client'
      : opts.leadId
        ? 'lead'
        : 'unlinked';
  const mapped = buildCrmLinkMapped({
    kind: opts.outHandle === 'error' && !opts.clientId && !opts.leadId ? 'unlinked' : kind,
    clientId: opts.clientId,
    leadId: opts.outHandle === 'already_client' ? null : opts.leadId,
    clientName: opts.clientName,
    leadName: opts.leadName,
  });
  mapped['crm.convert_mode'] = opts.mode;
  mapped.crm_convert_mode = opts.mode;
  mapped['crm.convert_result'] = opts.result === 'error' ? '' : String(opts.result || '');
  mapped.crm_convert_result = mapped['crm.convert_result'];
  mapped['crm.convert_error'] = opts.error || '';
  mapped.crm_convert_error = opts.error || '';
  if (opts.outHandle === 'already_client' || opts.mode === 'to_client') {
    // lead limpo quando já cliente / convert to client
    if (opts.mode === 'to_client' && opts.outHandle === 'default') {
      mapped['lead.id'] = '';
      mapped.lead_id = '';
    }
  }
  return mapped;
}
