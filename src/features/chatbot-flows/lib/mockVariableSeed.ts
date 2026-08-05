/**
 * Seed mock de variáveis do catálogo para o simulador do editor (S10).
 * Espelha chaves canônicas + aliases flat do runtime BE.
 */
export function buildMockFlowVariableSeed(now = new Date()): Record<string, string> {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const iso = `${y}-${m}-${day}`;
  const formatted = `${day}/${m}/${y}`;

  const bag: Record<string, string> = {
    'system.date': iso,
    'system.date_formatted': formatted,
    'system.name': 'PainelCRM',

    'contact.name': 'Maria Silva',
    contact_name: 'Maria Silva',
    client_name: 'Maria Silva',
    display_name: 'Maria Silva',
    'contact.phone': '5511999990000',
    canonical_phone: '5511999990000',
    contact_phone: '5511999990000',
    'contact.email': 'maria@exemplo.com',
    contact_email: 'maria@exemplo.com',
    client_email: 'maria@exemplo.com',

    'conversation.id': 'sim-conversation-id',
    conversation_id: 'sim-conversation-id',
    'conversation.column_name': 'Em atendimento',
    column_name: 'Em atendimento',
    'conversation.board_name': 'Pipeline WhatsApp',
    board_name: 'Pipeline WhatsApp',

    'agent.name': 'Ana Operadora',
    operator_name: 'Ana Operadora',
    'agent.team_name': 'Comercial',
    team_name: 'Comercial',

    'tenant.name': 'Empresa Demo',
    company_name: 'Empresa Demo',
    tenant_name: 'Empresa Demo',
    'system.tenant_name': 'Empresa Demo',
    'tenant.domain': 'demo.painelcrm.local',
    'system.tenant_domain': 'demo.painelcrm.local',
  };

  return bag;
}

/** Mescla seed sem sobrescrever keys já definidas pelo flow. */
export function mergeMockVariableSeed(
  existing: Record<string, unknown>,
  seed: Record<string, string> = buildMockFlowVariableSeed()
): Record<string, unknown> {
  const out = { ...existing };
  for (const [k, v] of Object.entries(seed)) {
    if (out[k] == null || out[k] === '') out[k] = v;
  }
  return out;
}
