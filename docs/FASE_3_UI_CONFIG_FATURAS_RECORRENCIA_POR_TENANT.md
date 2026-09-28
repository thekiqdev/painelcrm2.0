# Fase 3 - UI de configuracao em Configuracoes > Faturas

## Onde a UI foi implementada

A interface foi implementada em:

- `src/components/settings/BillingSection.tsx`

Mantendo a navegacao existente de `Configuracoes > Faturas`, sem criar tela isolada.

## Campos expostos ao tenant

Foram expostos os campos persistidos na Fase 1:

- `timezone` (select de timezone IANA)
- `recurring_generate_time_local` (input `time`, formato `HH:mm`)
- `invoice_notify_same_as_generation` (switch)
- `invoice_notify_time_local` (input `time`, exibido apenas quando o switch esta desligado)

## Consumo de API GET/PUT

Servico frontend criado:

- `src/services/tenantBillingPreferences.ts`

Endpoints usados:

- `GET /api/me/tenant/billing-preferences`
- `PUT /api/me/tenant/billing-preferences`

Comportamento:

- ao abrir a secao, a UI faz GET e preenche os campos
- em erro de carga, mostra alerta e botao de tentar novamente
- ao salvar, envia PUT com payload alinhado ao backend
- em sucesso/erro, mostra feedback via toast

## Validacao de frontend

Foi adicionada validacao basica para UX, sem substituir o backend:

- timezone obrigatoria e validada contra lista de opcoes da UI
- horarios no padrao `HH:mm`
- quando `notificar no mesmo horario = false`, `invoice_notify_time_local` passa a ser obrigatorio

O backend continua como fonte final de validacao.

## UX do toggle "notificar no mesmo horario"

- switch ligado: horario de notificacao fica oculto
- switch desligado: campo de horario de notificacao aparece e torna-se obrigatorio

Isso reduz ambiguidade e deixa a regra clara para o tenant.

## Textos de apoio adicionados

A secao inclui avisos claros de comportamento:

1. O horario de geracao ja esta ativo no motor de recorrencia.
2. O horario de notificacao separado esta apenas configuravel nesta fase, mas o envio desacoplado ainda nao foi ativado no motor outbound.

## O que ainda NAO esta ativo no motor

Continua fora da Fase 3:

- agendamento separado real de notificacao por tenant no outbound
- fila dedicada de notificacao por horario
- `dispatch_not_before` por preferencia de notificacao

## Riscos remanescentes

- lista de timezones e controlada no frontend; casos fora da lista devem ser raros e continuam protegidos pela validacao backend
- interpretacao operacional de "horario de notificacao" depende da ativacao da fase de outbound desacoplado

## O que entra na Fase 4

Evolucao esperada:

- ativar o uso real de `invoice_notify_same_as_generation` e `invoice_notify_time_local` no motor de notificacoes
- definir estrategia de agendamento desacoplado no outbound por tenant/timezone
