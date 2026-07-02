# Billing Timeline Report — Sprint 4.0C

## Componente

`SubscriptionBusinessTimeline` — substitui logs técnicos por eventos de negócio.

## Eventos gerados (`buildBusinessTimelineEvents`)

| Evento | Origem |
|--------|--------|
| Assinatura criada | `subscription.created_at` |
| Plano de cobrança preparado | Assinatura ativa sem faturas ainda |
| Alteração de plano agendada | `pending_contract` |
| Primeira / Cobrança gerada | `timeline` com `invoice_id` |
| Pagamento confirmado | `invoice_status: paid` ou `operational_state: paid` |
| Eventos de lifecycle | `merge_source: lifecycle` ou `lifecycle_event` |
| Próxima cobrança agendada | `automation_summary.next_charge_ymd` ou `next_billing_date` |

## O que foi removido da vista principal

- Tentativas de job (`job_attempts/max_attempts`)
- Referências a worker/fila na timeline visível
- Painel operacional técnico (`SubscriptionOperationalTimelinePanel` retirado do fluxo principal)

## Detalhes técnicos

Permanecem no accordion **Informações técnicas** na parte inferior da página:

- Últimas tarefas automáticas (`recent_jobs`)
- Registros de ciclo brutos (`cycles_raw`) quando habilitado
- ID da assinatura para suporte

## Ordenação

Eventos ordenados por `ymd` ascendente, com desduplicação por chave composta.
