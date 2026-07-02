/**
 * Billing Engine V2 — Sprint 2.4B: Golden Dataset permanente.
 */
import type { GoldenScenarioDef } from './types.js';

export const GOLDEN_SCENARIOS: GoldenScenarioDef[] = [
  // Grupo A — Recorrência e plano
  { id: 'recurrence_monthly', group: 'A', name: 'Recorrência mensal', description: 'Ciclo mensal padrão', tags: ['recurrence', 'financial'] },
  { id: 'recurrence_annual', group: 'A', name: 'Recorrência anual', description: 'Ciclo anual', tags: ['recurrence', 'financial'] },
  { id: 'no_discount', group: 'A', name: 'Sem desconto', description: 'Itens sem desconto', tags: ['financial'] },
  { id: 'discount_percent', group: 'A', name: 'Desconto percentual', description: 'Desconto percentual no item', tags: ['financial'] },
  { id: 'discount_fixed', group: 'A', name: 'Desconto fixo', description: 'Desconto fixo em centavos', tags: ['financial'] },
  { id: 'with_taxes', group: 'A', name: 'Impostos', description: 'Item com impostos', tags: ['financial'] },
  { id: 'no_taxes', group: 'A', name: 'Sem impostos', description: 'Item sem impostos', tags: ['financial'] },
  { id: 'multiple_items', group: 'A', name: 'Múltiplos itens', description: 'Vários itens recorrentes', tags: ['financial', 'items'] },
  { id: 'single_item', group: 'A', name: 'Item único', description: 'Um único item', tags: ['items'] },
  { id: 'item_paused', group: 'A', name: 'Item pausado', description: 'Item pausado excluído da cobrança', tags: ['items'] },
  { id: 'item_removed', group: 'A', name: 'Item removido', description: 'Item arquivado excluído', tags: ['items'] },
  { id: 'contract_updated', group: 'A', name: 'Contrato atualizado', description: 'Snapshot contratual atualizado', tags: ['functional'] },
  { id: 'due_date_change', group: 'A', name: 'Alteração de vencimento', description: 'Due date customizado', tags: ['functional'] },
  { id: 'frequency_change', group: 'A', name: 'Alteração de frequência', description: 'Frequência de cobrança alterada', tags: ['functional'] },
  { id: 'upgrade', group: 'A', name: 'Upgrade', description: 'Valor maior pós-upgrade', tags: ['financial'] },
  { id: 'downgrade', group: 'A', name: 'Downgrade', description: 'Valor menor pós-downgrade', tags: ['financial'] },
  { id: 'plan_revision', group: 'A', name: 'Billing Plan revision', description: 'Revisão do plano', tags: ['migration'] },
  { id: 'item_revision', group: 'A', name: 'Billing Item revision', description: 'Revisão do item', tags: ['migration'] },
  { id: 'trial', group: 'A', name: 'Trial', description: 'Período trial ativo', tags: ['functional'] },
  { id: 'prorata', group: 'A', name: 'Pró-rata', description: 'Modo pró-rata no item', tags: ['financial'] },

  // Grupo B — Gateway e notificações
  { id: 'no_gateway', group: 'B', name: 'Cliente sem gateway', description: 'Sem gateway configurado', tags: ['gateway'] },
  { id: 'gateway_configured', group: 'B', name: 'Gateway configurado', description: 'Gateway Asaas ativo', tags: ['gateway'] },
  { id: 'gateway_payment_refused', group: 'B', name: 'Gateway recusando pagamento', description: 'Simulação de recusa (metadata)', tags: ['gateway'] },
  { id: 'notification_disabled', group: 'B', name: 'Notificação desabilitada', description: 'Sem canais de notificação', tags: ['notifications'] },
  { id: 'notification_enabled', group: 'B', name: 'Notificação habilitada', description: 'Email habilitado', tags: ['notifications'] },
  { id: 'notification_whatsapp', group: 'B', name: 'WhatsApp', description: 'Canal WhatsApp', tags: ['notifications'] },
  { id: 'notification_email', group: 'B', name: 'Email', description: 'Canal email', tags: ['notifications'] },
  { id: 'no_channels', group: 'B', name: 'Sem canais', description: 'Nenhum canal configurado', tags: ['notifications'] },

  // Grupo C — Operacional e datas
  { id: 'job_delayed', group: 'C', name: 'Job atrasado', description: 'last_job_at no passado', tags: ['scheduler', 'worker'] },
  { id: 'retry', group: 'C', name: 'Retry', description: 'Contexto de retry documentado', tags: ['worker'] },
  { id: 'reprocess', group: 'C', name: 'Reprocess', description: 'Reprocessamento manual', tags: ['worker'] },
  { id: 'manual_execution', group: 'C', name: 'Execução manual', description: 'execution_mode manual', tags: ['operational'] },
  { id: 'scheduler', group: 'C', name: 'Scheduler', description: 'Modo scheduler', tags: ['scheduler'] },
  { id: 'worker', group: 'C', name: 'Worker', description: 'Modo worker', tags: ['worker'] },
  { id: 'month_change', group: 'C', name: 'Troca de mês', description: 'Virada de mês', tags: ['functional'] },
  { id: 'leap_year', group: 'C', name: 'Ano bissexto', description: '29/fev ano bissexto', tags: ['functional'] },
  { id: 'day_31', group: 'C', name: 'Dia 31', description: 'Anchor dia 31', tags: ['functional'] },
  { id: 'february', group: 'C', name: 'Fevereiro', description: 'Período em fevereiro', tags: ['functional'] },
  { id: 'timezone', group: 'C', name: 'Timezone', description: 'Datas com timezone explícito', tags: ['functional'] },
  { id: 'dst', group: 'C', name: 'DST', description: 'Horário de verão (metadata)', tags: ['functional'] },

  // Grupo D — Stress e concorrência (cenários funcionais; volumes no StressRunner)
  { id: 'stress_100', group: 'D', name: '100 recorrências', description: 'Stress 100 iterações', tags: ['stress'] },
  { id: 'stress_500', group: 'D', name: '500 recorrências', description: 'Stress 500 iterações', tags: ['stress'] },
  { id: 'stress_1000', group: 'D', name: '1000 recorrências', description: 'Stress 1000 iterações', tags: ['stress'] },
  { id: 'parallel_execution', group: 'D', name: 'Execução paralela', description: 'Cenários em paralelo', tags: ['stress'] },
  { id: 'concurrency', group: 'D', name: 'Concorrência', description: 'Múltiplas projeções simultâneas', tags: ['stress'] },
  { id: 'idempotency', group: 'D', name: 'Idempotência', description: 'Mesmo hash em reexecução', tags: ['stress'] },
  { id: 'double_click', group: 'D', name: 'Duplo clique', description: 'Dupla execução rápida', tags: ['stress'] },
  { id: 'two_workers', group: 'D', name: 'Dois workers', description: 'Dois workers simultâneos', tags: ['stress'] },
];

export const STRESS_ITERATION_LEVELS = [100, 500, 1000, 5000] as const;

export function getGoldenScenarioById(id: string): GoldenScenarioDef | undefined {
  return GOLDEN_SCENARIOS.find((s) => s.id === id);
}

export function getGoldenScenariosByGroup(group: GoldenScenarioDef['group']): GoldenScenarioDef[] {
  return GOLDEN_SCENARIOS.filter((s) => s.group === group);
}
