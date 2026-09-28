# Refatoração UX — detalhe da fatura recorrente

## Problema anterior

No detalhe da fatura com assinatura, a área principal misturava **linguagem comercial** com **diagnóstico operacional**: fila de jobs, worker, scheduler, `cycle_key`, `CURRENT_DATE`, `completion_outcome`, mensagens longas do backend e códigos como `next_billing_after_db_today`. Isso é útil para suporte e desenvolvimento, mas **polui a visão do utilizador final** e transmite incerteza desnecessária em estados normais.

## Nova estrutura da tela

1. **Assinatura recorrente** (`InvoiceRecurrenceBlock`): próxima cobrança, periodicidade, valor recorrente de referência (quando aplicável), estado da assinatura em linguagem simples, texto introdutório comercial, alertas amigáveis (sem âmbar para estados meramente informativos), botão **Alterar próxima cobrança** quando a fatura está paga e ligada à assinatura.
2. **Esta cobrança** (`CustomerInvoiceDetail`): período coberto, vencimento, valor e status **desta** fatura, com nota de que não mudam ao alterar a próxima data da assinatura.
3. **Histórico de cobranças**: tabela compacta (Fatura, Período, Vencimento, Valor, Status, Ações), sem colunas operacionais extra.
4. **Detalhes técnicos da recorrência**: secção colapsável **fechada por defeito**, visível apenas para utilizadores com perfil operacional no produto (`is_tenant_admin`, `can_manage_plan` ou `is_super_admin`). Contém IDs, `cycle_key`, outcomes, JSON de conclusão, tabela `subscription_cycles`, textos brutos de diagnóstico e contadores de fila.

Nenhuma alteração foi feita ao **motor de recorrência** nem às regras de geração de faturas no backend; apenas apresentação e copy no frontend.

## Regras de copy

- Substituir referências a **worker**, **scheduler**, **job**, **CURRENT_DATE**, **PostgreSQL** e códigos internos por frases curtas e comerciais (ver `src/lib/recurrenceInsightFriendly.ts`).
- Estados normais (próxima data futura, aguardar janela, ciclo já faturado) usam **tom informativo** (ícone de informação, fundo neutro), não alerta âmbar.
- Âmbar e vermelho ficam para **atenção real** (ex.: falha, reagendamento que exige atenção, assinatura inativa).

### Exemplos

| Antes (técnico) | Depois (amigável) |
|-----------------|-------------------|
| Data posterior a hoje no calendário do PostgreSQL (`CURRENT_DATE`) | A próxima cobrança ainda está agendada para uma data futura. Nenhuma ação é necessária. |
| Cobrança na fila — worker | A cobrança está aguardando processamento automático. |
| Ciclo concluído na tabela de jobs | Este ciclo já possui uma fatura vinculada. |

## Visão principal vs. detalhes técnicos

| Visão principal | Detalhes técnicos (colapsado, só perfil operacional) |
|-----------------|------------------------------------------------------|
| Status comercial / badge | `completion_outcome`, `result_invoice_id`, mensagens brutas |
| Próxima cobrança, periodicidade | `subscription_id`, IDs de job, `cycle_key` |
| Mensagens curtas amigáveis | `problem_hint_pt` bruto, `last_result_summary_pt` bruto |
| Fila descrita sem jargão | `is_queued`, `pending_jobs_count`, motivos de enfileiramento com código e `message_pt` da API |
| — | JSON `completion_detail_parsed`, tabela de ciclos `subscription_cycles` |

## Critérios de aceite

- [x] Ecrã visualmente mais limpo para o utilizador final.
- [x] Na visão principal não aparecem worker, scheduler, job, CURRENT_DATE, `completion_outcome` nem códigos internos.
- [x] Bloco de assinatura foca em próxima cobrança, periodicidade e estado amigável.
- [x] Dados fixos da fatura atual estão no bloco **Esta cobrança**, separados da assinatura.
- [x] Histórico de cobranças permanece acessível, com colunas enxutas.
- [x] Detalhes técnicos permanecem disponíveis para perfis operacionais, colapsados e discretos.
- [x] Sem mudanças no motor de recorrência ou na geração de faturas no backend.
- [x] `npm run build` passa.

## Ficheiros principais

- `src/components/invoices/InvoiceRecurrenceBlock.tsx`
- `src/pages/CustomerInvoiceDetail.tsx`
- `src/lib/recurrenceInsightFriendly.ts`
