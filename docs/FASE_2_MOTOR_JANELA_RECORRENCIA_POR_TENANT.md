        # Fase 2 - Motor de janela local por tenant

        ## Objetivo da fase

        Ativar a regra real de janela local no motor de recorrencia para que a geracao de invoices respeite:

        - `next_billing_date <= hoje local do tenant`
        - e, para `next_billing_date == hoje local`, somente apos `recurring_generate_time_local`

        Sem alterar UI e sem separar ainda o horario de notificacao.

        ## Regra final de elegibilidade implementada

        A assinatura/job e considerada elegivel quando:

        1. `next_billing_date < local_now_ymd`, ou
        2. `next_billing_date == local_now_ymd` **e** `local_now_hhmm >= recurring_generate_time_local_effective`

        Caso contrario:

        - `future_local_date`: ainda nao chegou o dia local
        - `too_early_local_time`: chegou o dia local, mas ainda nao chegou a hora local configurada

        O timezone e horario usados sao resolvidos pelo helper central (`resolveTenantBillingPreferences`), com fallback explicito e rastreavel.

        ## Scheduler (`enqueueRenewalJobs`)

        O scheduler continua rodando com alta frequencia, mas agora:

        - calcula a janela local efetiva por assinatura
        - **nao enfileira** assinaturas fora da janela local
        - registra decisao real de skip por janela (`time_window_scheduler_skip_outside_window`)
        - registra elegibilidade em modo verbose (`time_window_scheduler_eligible`)

        Assim, o enqueue deixa de depender apenas de `CURRENT_DATE` do banco como criterio final.

        ## Worker (`processNextBatch`)

        O worker agora revalida a mesma regra de janela local antes de gerar invoice:

        - se elegivel, segue fluxo normal
        - se fora da janela, **nao gera invoice** e faz requeue com `retry_at`

        Evento de log da revalidacao: `time_window_worker_check`  
        Evento de requeue por janela: `time_window_worker_requeued_outside_window`

        ## Regra de requeue adotada

        Quando o job esta fora da janela local, ele e reagendado para:

        - `retry_at = now() + 15 minutos`

        Comportamento:

        - status volta para `pending`
        - lock e limpo (`locked_at`, `locked_by`)
        - job nao falha e nao e cancelado por estar cedo

        Essa estrategia evita loop agressivo, preserva simplicidade operacional e garante nova tentativa proxima ao horario alvo local.

        ## Idempotencia

        As garantias existentes foram preservadas:

        - `cycle_key` continua evitando duplicidade por ciclo
        - validacoes de invoice existente por assinatura/periodo permanecem ativas
        - jobs completados continuam finalizados como `completed`
        - requeue por janela reutiliza o mesmo job (sem criar job duplicado)

        Resultado: nao ha geracao dupla da mesma cobranca por causa da janela local.

        ## Jobs pendentes antigos (pre-Fase 2)

        Nao foi necessaria limpeza manual.

        Com a Fase 2:

        - jobs `pending` antigos passam naturalmente pela revalidacao do worker
        - se estiverem cedo, recebem `retry_at` e aguardam janela
        - quando a janela abre, seguem processamento normal

        Ou seja, a adaptacao e implicita e retrocompativel.

        ## O que nao muda nesta fase

        Ainda fora de escopo da Fase 2:

        - UI em Configuracoes > Faturas
        - agendamento separado de notificacao
        - uso de `invoice_notify_same_as_generation` e `invoice_notify_time_local` no motor outbound
        - `dispatch_not_before` e fila dedicada de notificacao por tenant

        ## Preparacao para Fase 3

        Com o motor ja respeitando horario local no backend:

        - a Fase 3 pode focar na UI de configuracao do tenant
        - sem alterar a regra central de processamento ja ativada na Fase 2
