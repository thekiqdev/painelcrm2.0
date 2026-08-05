/**
 * Sujeito do teste no editor (S12) — cliente ou lead de exemplo.
 */
export type FlowTestSubjectKind = 'none' | 'client' | 'lead';

export type FlowTestSubject = {
  kind: FlowTestSubjectKind;
  /** ID do cliente ou lead selecionado. */
  id: string | null;
  label: string;
  /** clients.id — só preenchido para kind=client (faturas). */
  clientId: string | null;
  name: string;
  phone: string;
  email: string;
};

export const EMPTY_TEST_SUBJECT: FlowTestSubject = {
  kind: 'none',
  id: null,
  label: 'Dados mock',
  clientId: null,
  name: '',
  phone: '',
  email: '',
};

/** Sobrescreve seed mock com dados do cliente/lead escolhido. */
export function applyTestSubjectToVariables(
  variables: Record<string, unknown>,
  subject: FlowTestSubject | null | undefined
): Record<string, unknown> {
  if (!subject || subject.kind === 'none') return variables;
  const out = { ...variables };
  const name = subject.name.trim();
  const phone = subject.phone.trim();
  const email = subject.email.trim();

  if (name) {
    out['contact.name'] = name;
    out.contact_name = name;
    out.client_name = name;
    out.display_name = name;
  }
  if (phone) {
    out['contact.phone'] = phone;
    out.canonical_phone = phone;
    out.contact_phone = phone;
  }
  if (email) {
    out['contact.email'] = email;
    out.contact_email = email;
    out.client_email = email;
  }
  if (subject.kind === 'client' && subject.clientId) {
    out['client.id'] = subject.clientId;
    out.client_id = subject.clientId;
  }
  if (subject.kind === 'lead' && subject.id) {
    out['lead.id'] = subject.id;
    out.lead_id = subject.id;
  }
  return out;
}
