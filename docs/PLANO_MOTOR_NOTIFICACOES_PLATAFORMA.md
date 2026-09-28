# Motor de Notificações da Plataforma (PainelCRM) — Plano refinado para aprovação final

**Versão:** refinada (escopo travado para primeiro rollout)  
**Natureza:** planejamento apenas — **sem implementação** nesta etapa.

---

## 1) Resumo executivo atualizado

O PainelCRM passará a ter um **Motor de Notificações da Plataforma**, dedicado a notificar **contas (tenants) e seus administradores** sobre **conta, acesso, plano e cobrança da própria plataforma** — não sobre clientes finais do tenant.

A **primeira entrega operacional (MVP)** fica **explicitamente limitada** a:

- **Somente notificações transacionais automáticas** disparadas por eventos reais do sistema.
- **Somente canal WhatsApp** (envio real).
- **Sem** e-mail ativo, **sem** SMS, **sem** anúncios/comunicados em massa, **sem** campanhas, **sem** jornadas, **sem** builder avançado e **sem** segmentação de audiência neste rollout.

Anúncios em massa e e-mail são **produtos/fases posteriores**, documentados como evolução, **não** como parte do primeiro MVP.

A **base técnica** do motor já existente (renderer strict, orquestração, histórico, retry, flags) pode ser **reaproveitada em código**, mas o **domínio de dados** (tabelas, rotas, `event_key`, templates, UI) permanece **estritamente separado** do motor transacional do tenant.

---

## 2) Decisões fechadas do MVP inicial

| Decisão | Escolha fechada |
|--------|------------------|
| Natureza do MVP | Apenas **transacional automático** da plataforma |
| Canal no MVP | **Apenas WhatsApp** — único canal ativado no primeiro rollout |
| E-mail | **Fora** do MVP; entra **somente** em fase própria **após** provider real e hardening |
| SMS | **Fora** do escopo por ora |
| Anúncios / comunicados em massa | **Fora** do MVP; **fase posterior** com produto próprio (segmentação, snapshot, batch, monitor) |
| Campanhas, jornadas, builder avançado | **Fora** do MVP |
| Segmentação de destinatários (audiências) | **Fora** do MVP (é conceito de anúncio; transacional resolve destinatário a partir do evento) |
| Dono dos modelos da plataforma | **Exclusivamente Super Admin** |
| Edição de templates da plataforma por tenants | **Proibida** |
| Mistura com motor do tenant | **Proibida** (ver secção 3) |

**Regra de ouro do primeiro rollout:** *se não for transacional automático da plataforma via WhatsApp, não entra no MVP.*

---

## 3) Separação inequívoca: motor do tenant × motor da plataforma

### 3.A — Motor transacional do **tenant** (já existente no produto)

- **Quem notifica:** o tenant (empresa cliente do PainelCRM).
- **Quem recebe:** clientes finais do tenant (ex.: lead/cliente do CRM).
- **Domínio de negócio:** propostas, contratos, faturas **do tenant**.
- **Onde opera:** API e UI no **painel do tenant** (ex.: configurações de notificações do tenant).
- **Catálogo de eventos:** chaves do tipo `proposal.*`, `contract.*`, `invoice.*` (escopo tenant).
- **Persistência:** tabelas atuais do motor do tenant (`notification_event_catalog`, `notification_outbound_deliveries`, preferências/overrides do tenant, etc.) — referência em `docs/notifications-engine/README.md`.

### 3.B — Motor transacional da **plataforma** (novo domínio)

- **Quem notifica:** o PainelCRM (operador da plataforma).
- **Quem recebe:** tenant / administrador da conta na plataforma (e eventualmente contatos de faturamento quando fizer sentido por evento).
- **Domínio de negócio:** conta, acesso, plano, cobrança **SaaS da plataforma**.
- **Onde opera:** API e UI no **Super Admin**, com rotulagem explícita **“Plataforma”**.
- **Catálogo de eventos:** chaves com prefixo estável `platform.*` (ex.: `platform.billing.payment_confirmed`), **sem** reutilizar chaves do tenant.
- **Persistência:** **tabelas novas** do domínio plataforma (nomes sugeridos na secção 5); **não** gravar entregas da plataforma em `notification_outbound_deliveries` do tenant.

### 3.C — Mesma base técnica, zero mistura de domínio

Pode-se **extrair ou duplicar com critério** componentes como:

- `strictMergeRenderer` (ou equivalente),
- classificação de erro / retry,
- padrão de `idempotency_key`,
- worker de reenvio.

Porém **obrigatório**:

- **Tabelas separadas** para catálogo, templates, entregas e tentativas da plataforma.
- **Rotas separadas** (ex.: prefixo `/api/superadmin/platform-notifications/...` — nome final na implementação).
- **Event keys e templates separados**; nenhum `event_key` compartilhado entre os dois motores.
- **UI separada**; não reutilizar telas do motor do tenant como se fossem da plataforma.

### 3.D — Legados que **não** são o motor da plataforma

Para evitar ambiguidade operacional e de produto:

| Artefato | Papel | Relação com o novo motor |
|----------|--------|---------------------------|
| `message_templates` / `message_logs` | Legado de mensagens por usuário/conversa | **Não** é fonte de verdade dos templates da plataforma |
| `whatsapp_message_templates` / categorias de templates de chat | Templates de **atendimento/chat do tenant** | **Não** confundir com templates transacionais da plataforma |
| `notifications` (in-app super admin) | Avisos internos no painel | **Independente** do motor outbound da plataforma |
| Motor `notifications-engine` do tenant | Transacional externo para clientes do tenant | **Domínio diferente**; apenas inspiração técnica |

---

## 4) Arquitetura consolidada (MVP)

### 4.1 Fluxo único no MVP

`módulo da plataforma (auth, billing, subscription…)` → **persistência confirmada** → publicação do evento `platform.*` → resolução de template (padrão + override Super Admin) → render strict → persistência de delivery → **dispatch WhatsApp** → tentativas / histórico.

### 4.2 Componentes no escopo do MVP (modelo lógico)

1. Catálogo de eventos da plataforma + whitelist de merge fields por `event_key`.
2. Templates sistema (seed/migração) + override operacional do Super Admin.
3. Filas/histórico: deliveries + attempts (domínio plataforma).
4. Dispatcher **WhatsApp** + normalização de texto (reuso do padrão atual).
5. Feature flags / kill switch **específicos da plataforma** (não reaproveitar flags do tenant sem namespacing claro).
6. API + UI Super Admin **enxuta** (secção 9).

### 4.3 Fora do modelo de dados do MVP

- Tabelas de **campanha**, **audiência**, **itens de envio em massa** — **somente** na fase de anúncios (secção 10).
- Canal **e-mail** no orquestrador — **desativado** até fase de e-mail; modelagem pode prever `channel` no catálogo, mas **sem** rotas de envio ativas para `email` no MVP.

### 4.4 Nota técnica (remetente WhatsApp da plataforma)

O dispatcher atual do tenant associa envio a **instância WhatsApp de um usuário do tenant**. O motor da plataforma precisará de **estratégia explícita** de remetente (ex.: usuário/sistema dedicado da plataforma, instância operacional PainelCRM). Isto é **requisito de desenho** na implementação; não altera o escopo funcional do MVP, mas é risco a endereçar cedo (secção 12).

---

## 5) Modelagem refinada (MVP apenas)

Nomes indicativos (ajustáveis na implementação, mantendo o isolamento):

### 5.1 `platform_notification_event_catalog`

- `event_key` (PK lógico, único)
- `module` (ex.: `platform_auth`, `platform_billing`)
- `description`
- `default_channel` — no MVP: valor fixo `whatsapp` em todos os eventos ativos
- `merge_fields` (jsonb **array** — whitelist oficial por evento)
- `is_active`, `version` (ou `updated_at` + controle de migração)

### 5.2 `platform_notification_template_system`

- `event_key`, `channel`, `locale` (único composto)
- `subject_template` (nullable no WhatsApp)
- `body_template`
- `version`, `is_active`

### 5.3 `platform_notification_template_overrides` (operacional Super Admin)

- FK ao template sistema (ou tupla evento/canal/locale)
- `body_template`, `subject_template` opcional
- `is_active`, `updated_by`, `updated_at`

### 5.4 `platform_notification_deliveries`

- `event_key`, `entity_type`, `entity_id` (referência de negócio, ex.: `tenant_billing`, uuid)
- `idempotency_key` **único**
- `channel` — MVP: sempre `whatsapp`
- destinatário: `recipient_type`, `recipient_address` (telefone normalizado)
- `status`, corpo/assunto renderizados, `metadata`, `actor`
- `sent_at`, política de `dispatch_not_before` se necessário

### 5.5 `platform_notification_delivery_attempts`

- Igual conceito ao motor atual: histórico por tentativa, erro, duração, resposta do provider.

**Não criar no MVP:** tabelas `platform_announcement_*`.

---

## 6) Catálogo inicial reduzido do MVP (`platform.*`)

Princípio: **menos eventos, mais estáveis**, ligados a pontos de código **já claros** (pós-commit / webhook consolidado).

### 6.1 Incluídos no primeiro rollout (núcleo mínimo)

| `event_key` | Quando dispara (conceito) | Fonte madura no código hoje |
|-------------|---------------------------|-----------------------------|
| `platform.account.welcome` | Conta (tenant + admin) criada com sucesso; primeira mensagem de boas-vindas | Registro/checkout: `authController.register`, `registerOrganizationController`, `planPurchaseController.postCompleteSignupTrial` (ajustar **um** ponto canônico por fluxo para evitar duplicidade) |
| `platform.billing.charge_created` | Cobrança SaaS (`tenant_billing`) gerada com valor e meio; existe link ou contexto de pagamento | `subscribePlan` / fluxo de invoice após `postPlanPurchase` |
| `platform.billing.payment_confirmed` | Pagamento confirmado no agregado `tenant_billing` / ativação | `paymentDomainService.applyPaymentEvent` + `activatePlanFromBilling` |

**Sobre “link de login / acesso”:** no MVP, **não** é obrigatório um evento separado. O template de `platform.account.welcome` deve permitir `{{auth.login_link}}` (URL absoluta da tela de login da aplicação), gerada a partir de configuração (`FRONTEND_URL` / equivalente). Evento dedicado `platform.auth.login_link_issued` **só** fará sentido quando existir fluxo explícito de emissão de link (magic link, convite), **fora** do núcleo mínimo até existir produto.

### 6.2 Candidatos à “segunda onda” do transacional (ainda **sem** anúncios)

**Não** parte do primeiro deploy de produção; entram **após** o núcleo estar estável e auditado ponto-a-ponto:

| `event_key` | Condição para incluir |
|-------------|------------------------|
| `platform.trial.started` | Após definir **um** ponto canônico pós-criação do trial e garantir idempotência |
| `platform.plan.activated` | Se for redundante com `payment_confirmed`, **fundir** mensagens; caso contrário, só se houver transição de estado **única** e auditável separada do webhook de pagamento |
| `platform.billing.due_reminder` | Só com job/cron ou regra **única** de “X dias antes do vencimento” sem duplicar e-mails/WhatsApp de gateway |
| `platform.billing.overdue` | Só se a transição para `overdue` em `tenant_billing` for **única**, idempotente e testada |
| `platform.auth.password_reset_requested` / `…completed` | **Apenas** quando existir fluxo público maduro de reset (hoje **não** há fluxo dedicado equivalente no `authRoutes`) |

### 6.3 Explicitamente **fora** do MVP inicial

- Qualquer `platform.trial.expiring` / `platform.trial.expired` que dependa de **job agendado** sem o job da plataforma fechado e testado end-to-end.
- `platform.plan.changed` sem auditoria dos **pontos de emissão** (upgrade/downgrade podem ter vários caminhos).
- Suspensão/reativação como **linha de mensagem separada**, até haver contrato único de estado (`tenants.status`, `suspension_reason`) e testes — podem entrar na “segunda onda”.
- Todos os eventos de **anúncio** (`platform.announcement.*`).

---

## 7) Catálogo futuro expandido (visão além do MVP)

### 7.1 Transacional da plataforma (evolução)

- Acesso: convite, magic link, reset de senha (quando existir fluxo).
- Plano: mudança efetiva, cancelamento, fim de período.
- Trial: expirando (cron), expirado, consumido.
- Conta: suspensa, reativada, validações pendentes.
- Billing: falha de pagamento, lembrete fino, reembolso (se aplicável).

### 7.2 Anúncios / comunicados (segundo produto — secção 10)

- `platform.announcement.general`
- `platform.announcement.feature_release`
- `platform.announcement.maintenance`
- `platform.announcement.admin_notice`

### 7.3 Canais futuros

- E-mail transacional (fase própria, provider real).
- SMS apenas se houver requisito de negócio e compliance.

---

## 8) Merge fields da plataforma — governança clara

### 8.1 Namespaces oficiais (MVP)

| Namespace | Uso |
|-----------|-----|
| `platform.*` | Marca, links de suporte, textos institucionais |
| `tenant.*` | Dados da conta cliente na plataforma |
| `plan.*` | Plano contratado / exibido |
| `billing.*` | Cobrança SaaS (`tenant_billing` e derivados) |
| `auth.*` | Links de autenticação (login, reset quando existir) |

**Fora do MVP:** namespace `announcement.*` (só com produto de anúncios).

### 8.2 Whitelist por `event_key`

- Cada evento possui lista **fechada** em `platform_notification_event_catalog.merge_fields`.
- Template **só** pode conter placeholders que existem nessa lista.
- **Não** permitir placeholders “livres” no MVP.

### 8.3 Validação **strict** — salvar e preview

- **Salvar** template (sistema ou override): rejeitar se houver placeholder fora da whitelist do evento ou sintaxe inválida.
- **Preview:** validar whitelist; para chaves **obrigatórias** ausentes no payload de teste, retornar erro explícito (não simular silenciosamente).

### 8.4 Comportamento no **dispatch** (envio real)

| Situação | Comportamento |
|----------|----------------|
| Placeholder **inválido** (não whitelist) | **Falha** de render; delivery **não** enviado; log/attempt com motivo |
| Chave **obrigatória** ausente no contexto | **Falha** de render (strict); mesmo tratamento |
| Chave **opcional** ausente | Definir por contrato do evento: ou proibir opcionais no MVP, ou permitir string vazia **explicitamente** no contrato |
| Chave presente com **string vazia** permitida | Renderizar vazio; **sem** erro; opcionalmente log `warn` operacional |

### 8.5 Exemplos de merge fields (alinhados ao pedido)

- `{{platform.name}}`
- `{{tenant.name}}`
- `{{tenant.admin_name}}`
- `{{plan.name}}`
- `{{billing.amount}}`
- `{{billing.due_date}}`
- `{{billing.payment_link}}`
- `{{auth.login_link}}`
- `{{auth.reset_link}}` (só em eventos de reset, quando o fluxo existir)

**Regra:** `{{auth.reset_link}}` **não** aparece na whitelist de eventos até o fluxo de reset existir.

---

## 9) Proposta de UX inicial do Super Admin (MVP enxuto)

### 9.1 Governança: Super Admin como dono exclusivo dos modelos

- Templates **padrão** nascem por **seed/migração** (baseline).
- **Super Admin** edita **override operacional** (texto; canal futuro quando existir e-mail), com auditoria (`updated_by`, timestamps).
- **Nenhum** usuário de tenant acessa CRUD desses templates.
- Overrides **não** alteram o seed original: restaurar padrão = desativar override ou reaplicar cópia da baseline.
- **Confusão proibida:** isto **não** é template de WhatsApp de chat nem `message_templates` legado.

### 9.2 Escopo da primeira UI

1. **Catálogo** de notificações transacionais da plataforma (lista de `event_key`, módulo, ativo).
2. **Editor** de template (override operacional sobre o padrão; diff simples opcional).
3. **Preview** com payload de teste (validação strict).
4. **Histórico** básico de entregas (filtros: evento, status, período, tenant opcional).
5. **Configurações globais** do motor da plataforma (ligar/desligar envio real, kill switch, allowlist piloto se necessário).

### 9.3 Fora da primeira UI

- Campanhas, segmentação, snapshot de audiência, monitor de lote, funis visuais.
- Qualquer tela que pareça “marketing automation”.

### 9.4 Navegação e labels obrigatórios (clareza de domínio)

Sugestão de hierarquia no Super Admin:

- **Plataforma → Notificações transacionais**  
  - Catálogo  
  - Templates / editor  
  - Histórico  
  - Configurações do motor  

**Não** usar rótulos genéricos como só “Notificações” sem o qualificador **Plataforma**.

**Motor do tenant** permanece no painel do cliente: ex.: **Configurações → Notificações (clientes)** ou label já existente no produto — **nunca** misturar com o menu acima.

### 9.5 Como evitar confusão (checklist de produto)

| Risco | Mitigação no MVP |
|-------|-------------------|
| Confundir com templates de chat | Menu separado; copy “transacional da plataforma”; sem picker de `whatsapp_message_templates` |
| Confundir com motor do tenant | Prefixo `platform.*`; tabelas e rotas dedicadas; cores/copy “Plataforma” |
| Confundir com legado `message_templates` | Não referenciar na UI; migração futura opcional **não** bloqueia MVP |
| Confundir anúncio com transacional | Anúncios **não** aparecem no menu até a fase própria |

---

## 10) Anúncios em massa — fase posterior (segundo produto)

**Declaração fechada:** anúncios/comunicados **não** fazem parte do MVP do motor da plataforma.

Quando (e somente quando) o transacional estiver estável em produção, uma **fase dedicada** introduzirá:

1. **Segmentação** de audiência (filtros por plano, status, trial, inadimplência, etc.).
2. **Snapshot** de audiência no momento do envio (congelar destinatários).
3. **Batching** (filas, limites, throttling).
4. **Monitor** de progresso (enviados, falhas, retries).
5. **Histórico de campanha** (quem recebeu, quando, status).

Modelagem típica futura (referência, **não** MVP): `platform_announcement_campaigns`, `platform_announcement_audiences`, `platform_announcement_dispatch_items`.

**Canal no produto de anúncios:** inicialmente WhatsApp na visão de produto; e-mail **só** após fase de provider — **nunca** em paralelo ao MVP transacional sem critério.

---

## 11) Plano por fases ajustado

| Fase | Conteúdo |
|------|----------|
| **0 — Aprovação** | Este documento; congelar MVP da secção 2 e catálogo da secção 6.1 |
| **1 — Núcleo técnico plataforma** | Tabelas MVP, APIs Super Admin, renderer/ orquestrador **somente** `channel=whatsapp`, flags próprias |
| **2 — Primeiro rollout transacional** | Wire dos **três** eventos 6.1 + templates + histórico + observabilidade mínima |
| **3 — Segunda onda transacional** | Eventos 6.2 conforme auditoria; trial/plan/billing reminders **só** com idempotência e testes |
| **4 — Autenticação avançada** | Reset de senha / magic link como **novos** `event_key` quando fluxos existirem |
| **5 — E-mail** | Provider real, adapter, templates `channel=email`, rollout **separado** do WhatsApp |
| **6 — Anúncios em massa** | Produto completo secção 10 (sem misturar pipeline com transacional) |
| **7 — Evolução** | Métricas, aprovação em duas mãos, preferências finas, etc. |

---

## 12) Riscos e cuidados de produção

1. **Mistura de domínio** tenant/plataforma → tabelas e rotas dedicadas; code review com checklist da secção 3.
2. **Duplicidade de envio** → `idempotency_key` única por evento + entidade + canal + versão do contrato se necessário.
3. **Múltiplos pontos de disparo** (ex.: vários fluxos de registro) → unificar **um** emissor por evento ou prefixar chaves com sufixo de origem **só** se necessário; preferir consolidar.
4. **Remetente WhatsApp da plataforma** → definir instância/usuário técnico; não assumir instância do tenant.
5. **Strict merge** → falhas de render são preferíveis a mensagens silenciosamente erradas.
6. **Scope creep** → anúncios e e-mail fora do MVP; mudanças exigem revisão explícita deste documento.
7. **Legado** → não “encaixar” o MVP em `message_templates` ou templates de chat sem plano de migração.
8. **Observabilidade** → no mínimo: contagem por status, últimos erros, latência simples (como no superadmin do motor tenant, mas **namespace** plataforma).

---

## 13) Recomendação objetiva do canal inicial

**Decisão fechada:** o **único** canal ativado no MVP do motor da plataforma é **WhatsApp**.

**E-mail** não entra “junto” nem como opção paralela no mesmo rollout: entra **somente** na **fase 5**, com **provider real**, testes de entrega, reputação/DMARC (conforme provider) e feature flag **independente**.

**SMS** permanece fora até requisito explícito de negócio.

---

### Encerramento

Este plano está **refinado para aprovação final** antes da execução: MVP transacional da plataforma **somente** em **WhatsApp**, **sem** anúncios em massa, **sem** e-mail ativo, com **separação estrita** de domínio em relação ao motor do tenant e aos legados, e catálogo de eventos **mínimo** (secção 6.1) com evolução controlada (6.2 e 7).

**Não inclui implementação** — apenas especificação e decisões de escopo.
