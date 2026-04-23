# PLANO REFINADO — Motor Central de Notificações do Tenant

## 1) Resumo executivo atualizado

Este plano consolida uma implantação **segura, incremental e com escopo travado** para o Motor Central de Notificações.

Decisão central desta versão:

- A **primeira entrega funcional** cobre **apenas notificações transacionais externas**
- Apenas os módulos: **propostas**, **contratos** e **faturas**
- Canal inicial recomendado: **WhatsApp**
- **E-mail fica fora da ativação inicial** até provider real estar pronto
- Sem SMS, sem campanhas, sem automações avançadas, sem jornadas

O objetivo é colocar em produção uma versão pequena, estável e auditável, sem misturar naturezas de notificação diferentes.

---

## 2) Decisões fechadas da primeira entrega

## 2.1 Escopo funcional travado (MVP de produção)

Inclui:

- Notificações transacionais externas
- Eventos dos módulos `proposals`, `contracts`, `invoices`
- Catálogo de eventos
- Catálogo de templates padrão
- Override por tenant (sem alterar template padrão)
- Renderer de merge fields
- Dispatcher por canal (inicialmente WhatsApp)
- Fila/log básico + histórico de sucesso/falha

Não inclui:

- SMS
- Campanhas
- Jornadas e regras condicionais complexas
- Automações avançadas
- Cobertura de todos os módulos
- Unificação imediata de notificações operacionais e in-app

## 2.2 Fronteira de release

A primeira release deve ser tratada como **produto mínimo operacional**, não como fundação para “entregar tudo”.

---

## 3) Separação de naturezas de notificação

## 3.1 Grupo A — Notificações transacionais externas (escopo da primeira entrega)

Exemplos:

- `invoice.created`, `invoice.paid`
- `proposal.sent`, `proposal.accepted`
- `contract.sent`, `contract.signed`

Destino típico:

- cliente e, quando configurado, responsável interno

## 3.2 Grupo B — Notificações operacionais internas (fora da primeira entrega funcional)

Exemplos:

- falha de envio
- erro de automação
- conexão perdida
- alerta para operador/equipe/admin

Destino típico:

- equipe interna, operador, admin do tenant

## 3.3 Grupo C — Notificações in-app (fora da primeira entrega funcional)

Exemplos:

- avisos internos no painel
- feed/badge de notificações da plataforma

Destino típico:

- usuários internos autenticados no sistema

Regra arquitetural: o motor pode suportar os 3 grupos no futuro, mas o MVP implementa apenas o **Grupo A**.

---

## 4) Arquitetura consolidada (MVP + evolução)

## 4.1 Componentes obrigatórios da primeira fase funcional

1. `event_catalog` (fonte única de eventos)
2. `template_catalog` (templates padrão por evento/canal)
3. `tenant_notification_config` (enable/disable + canal + destinatários)
4. `tenant_template_override` (cópia editável por tenant)
5. `merge_renderer` (validação + render seguro)
6. `channel_dispatcher` (adapter por canal)
7. `delivery_queue` + `delivery_log` (com sucesso/falha)

## 4.2 Fluxo de processamento

`módulo de origem` -> persiste estado -> publica evento -> resolve config/template/destinatários -> renderiza -> enfileira entrega -> dispatch -> loga resultado -> retry básico

## 4.3 Princípios de segurança

- isolamento por tenant em todo o fluxo
- idempotência por envio
- publicação de evento só após persistência confirmada
- template sem execução dinâmica
- rastreabilidade completa de tentativas

---

## 5) Contrato do evento publicado

Todo evento publicado para o motor deve conter no mínimo:

- `tenant_id`
- `event_key`
- `entity_type`
- `entity_id`
- `occurred_at`
- `actor`
- `idempotency_key`

Payload opcional adicional:

- `context_ref` (referência para carregar dados de merge)
- `metadata` (dados auxiliares)

Regras obrigatórias de publicação:

- publicar evento **somente após** persistência confirmada no módulo de origem
- não publicar evento em estado parcial/transação aberta
- evitar publicação duplicada com `idempotency_key`
- se ocorrer retry de publicação, manter a mesma chave de idempotência

---

## 6) Modelagem refinada

## 6.1 Estruturas principais

1. `notification_event_catalog`
- `event_key` único, módulo, ação, descrição, ativo, versão

2. `notification_template_catalog` (padrões do sistema)
- `event_key`, `channel`, `locale`, `subject_template`, `body_template`, `version`, `is_active`

3. `tenant_notification_preferences`
- `tenant_id`, `event_key`, `enabled`, `primary_channel`, `fallback_channel`, `recipient_policy`

4. `tenant_notification_template_overrides`
- `tenant_id`, `event_key`, `channel`, `locale`, `base_template_id`, `subject_template`, `body_template`, `is_active`

5. `notification_deliveries`
- evento, destinatário, canal, status, payload renderizado, tentativas, erro, timestamps

6. `notification_delivery_attempts`
- histórico de cada tentativa (request/response resumido, duração, erro)

## 6.2 Reaproveitamento controlado do legado

- `message_templates` e `message_logs` coexistem durante transição
- novo motor grava em tabelas novas sem quebrar rotas legadas
- migração progressiva por módulo/evento

---

## 7) Regra arquitetural: template padrão vs override do tenant

Decisão fechada:

- **Template padrão do sistema é imutável**
- Tenant nunca edita o padrão diretamente
- Tenant opera sobre **override/cópia**

Capacidades do tenant (MVP UI):

- customizar assunto
- customizar corpo
- ativar/desativar notificação
- restaurar para padrão
- comparar override vs padrão (diff simples)

Objetivo: impedir sobrescrita acidental do catálogo oficial e garantir consistência entre tenants.

---

## 8) Estratégia de destinatários (refinada)

## 8.1 Tipos de destinatário

1. **Derivados automaticamente do evento** (obrigatórios quando existir vínculo)
- Ex.: `proposal.sent` -> cliente da proposta

2. **Configuráveis pelo tenant** (opcionais)
- Ex.: incluir responsável interno em `invoice.paid`

3. **Internos do sistema/equipe** (fora do escopo transacional inicial, mas modelado)
- Ex.: falha operacional -> admin/equipe/operador

## 8.2 Regras por categoria

- `proposal.sent`: obrigatório cliente; opcional responsável interno
- `invoice.paid`: obrigatório cliente; opcional responsável interno/equipe financeira
- `contract.sent` / `contract.signed`: obrigatório signatário/cliente conforme evento; opcional responsável interno

## 8.3 Fallback de destinatário

- Se destinatário obrigatório não puder ser resolvido, o envio fica `failed` com motivo explícito
- Se destinatário opcional não existir, segue envio para obrigatórios
- Não “inventar” destinatário por heurística silenciosa

---

## 9) Governança de merge fields

## 9.1 Padrão de namespace e nomenclatura

- padrão: `{{namespace.campo}}`
- exemplos oficiais:
  - `{{tenant.name}}`
  - `{{client.name}}`
  - `{{invoice.number}}`
  - `{{proposal.total}}`
  - `{{contract.sign_link}}`

## 9.2 Registro por módulo/evento

Cada módulo registra:

- lista oficial de campos por `event_key`
- tipo esperado do campo
- disponibilidade por canal (quando houver diferença)

## 9.3 Validação e comportamento

No salvar template:

- placeholder inválido bloqueia salvamento

No preview:

- destacar placeholders inválidos com erro explícito
- mostrar placeholders válidos sem valor com aviso

No envio real:

- placeholder inválido: falhar render e logar erro
- campo ausente no contexto: falhar render (modo strict do MVP)
- campo vazio válido: renderizar vazio (sem erro), com log de warning opcional

Regra de consistência:

- mesmo `event_key` usa a mesma definição de fields em todos os canais (salvo exceções documentadas)

---

## 10) UX inicial do tenant (fase 1 enxuta)

Escopo da UI inicial:

1. lista de notificações por módulo/evento
2. canal associado
3. ativar/desativar
4. editar template do tenant (override)
5. ver merge fields disponíveis
6. preview simples
7. histórico/log básico

Fora da UI inicial:

- regras condicionais complexas
- automação avançada
- jornadas longas
- editor avançado complexo

Princípio: interface curta, clara e operacional para transacionais.

---

## 11) Plano por fases ajustado

## Fase 1 — Arquitetura e contratos (concluída)

- diagnóstico da base
- fechamento de escopo e decisões
- contrato de evento e fronteiras do MVP

## Fase 2 — Núcleo mínimo do motor

- criar catálogo de eventos, templates padrão, preferências do tenant
- criar renderer, dispatcher e log básico
- sem ativação em produção ainda

## Fase 3 — MVP transacional (propostas, contratos, faturas)

- publicar eventos dos 3 módulos com contrato mínimo
- ligar templates padrão + override tenant
- ativar envio por canal inicial recomendado
- habilitar histórico de sucesso/falha

## Fase 4 — Hardening de produção

- métricas essenciais, alertas, retry básico por erro transitório
- painéis operacionais mínimos
- rollout por feature flag e tenant piloto

## Fase 5 — Expansão controlada

- incluir e-mail no motor após provider real
- ampliar para outros módulos transacionais

## Fase 6+ — Futuro

- notificações operacionais internas
- notificações in-app integradas
- SMS, campanhas, automações avançadas

---

## 12) Riscos e cuidados de produção

- **Duplicidade de envio**: resolver com `idempotency_key` + chave única de entrega
- **Evento prematuro**: publicar apenas pós-commit do módulo de origem
- **Vazamento entre tenants**: filtros rígidos por `tenant_id` e revisão de RLS
- **Template inválido em produção**: validação estrita no salvar + preview obrigatório
- **Expansão de escopo não controlada**: bloquear backlog fora do recorte MVP
- **Canal com maturidade diferente**: ativação sequencial por canal, nunca simultânea sem readiness

---

## 13) Recomendação objetiva do canal inicial mais seguro

Decisão recomendada para a primeira entrega:

- **Iniciar pelo WhatsApp como canal transacional inicial**

Justificativa:

- já existe provider operacional (`UazAPI`) em uso
- já existe fluxo de envio real e infraestrutura de templates WhatsApp madura
- e-mail atualmente está em stub (`sendEmailMessage` sem provider real)

Decisão complementar:

- e-mail só entra no motor após fase dedicada de implementação/validação de provider real (SMTP/API), com rollout próprio.

---

## Catálogo transacional inicial (MVP travado)

## Propostas

- `proposal.sent` -> cliente (obrigatório), responsável interno (opcional)
- `proposal.accepted` -> cliente (obrigatório), responsável interno (opcional)
- `proposal.rejected` -> cliente (obrigatório), responsável interno (opcional)

## Contratos

- `contract.sent` -> signatário/cliente (obrigatório), responsável interno (opcional)
- `contract.signed` -> cliente/signatário (obrigatório), responsável interno (opcional)

## Faturas

- `invoice.created` -> cliente (obrigatório)
- `invoice.due_soon` -> cliente (obrigatório), responsável interno (opcional)
- `invoice.overdue` -> cliente (obrigatório), responsável interno (opcional)
- `invoice.paid` -> cliente (obrigatório), responsável interno (opcional)

---

## Fechamento desta versão refinada

Este documento está pronto para aprovação final de execução com:

- escopo inicial fechado e pequeno
- separação clara de tipos de notificação
- contrato de evento obrigatório
- decisão objetiva de canal inicial
- regras firmes de template padrão vs override
- governança de merge fields e destinatários
- plano por fases sem ambiguidade
