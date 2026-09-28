/**
 * Seed mínimo para teste de HTTP no editor (S14).
 * O FE envia variáveis; isto completa chaves vazias.
 */
export function buildMockFlowVariableSeedForTest(
  now = new Date()
): Record<string, string> {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return {
    'system.date': `${y}-${m}-${day}`,
    'system.date_formatted': `${day}/${m}/${y}`,
    'system.name': 'PainelCRM',
    'contact.name': 'Maria Silva',
    contact_name: 'Maria Silva',
    'contact.phone': '5511999990000',
    contact_phone: '5511999990000',
    'conversation.id': 'test-conversation-id',
    conversation_id: 'test-conversation-id',
    'agent.name': 'Ana Operadora',
    'tenant.name': 'Empresa Demo',
    company_name: 'Empresa Demo',
  };
}
