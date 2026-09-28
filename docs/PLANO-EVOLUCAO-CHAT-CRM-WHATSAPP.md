# Plano de Evolução — Chat + CRM + WhatsApp

## 1. Objetivo

Evoluir o módulo de Chat + WhatsApp (Uazapi) de forma incremental, preservando o que já funciona, para integrar conversa, CRM (clientes/leads) e financeiro (faturas/cobranças), com foco em SaaS multi-tenant, segurança de vínculo e reaproveitamento de lógica existente.

## 2. Estado atual do recurso

- Criação de instância e conexão via QR Code já operam com Uazapi.
- Backend expõe rotas de chat protegidas por autenticação e feature flag (`tenantAuth` + `requireFeature('chat')`).
- Conversas e mensagens persistem em `chat_conversations`/`chat_messages`, com RLS habilitado por tenant.
- Existe identificação automática parcial por telefone:
  - no upsert de conversa, tenta vincular `client_id` por telefone normalizado;
  - para lead, hoje o vínculo é majoritariamente resolvido em query de leitura (`getConversations`), não persistido de forma consistente em todos os fluxos.
- Frontend (`Chat.tsx`) já possui:
  - abas de Leads/Clientes;
  - carregamento de perfil da conversa (`getConversationProfile`);
  - ações manuais de criar lead e converter lead em cliente.
- Financeiro já possui módulos próprios consolidados (`customer_invoices`, `customer_charges`) e telas/serviços dedicados.

## 3. Problemas atuais / limitações

- Vínculo conversa↔perfil ainda é híbrido (parte persistido, parte resolvido por JOIN em leitura), sujeito a divergência.
- Precedência cliente > lead existe em alguns pontos, mas sem uma política única e explícita no domínio.
- Falta trilha clara de “como foi vinculado” (automático vs manual), reduzindo auditabilidade.
- Foto do WhatsApp é usada mais no contexto da instância/conversa, sem política formal de sincronização com cadastro CRM.
- Atalhos financeiros no chat ainda não são um fluxo padrão de produto (há pontos isolados, sem jornada única).
- Escalabilidade multi-tenant ainda tem acoplamentos por `user_id` + telefone; precisa consolidar regra canônica com escopo de tenant para evitar falso positivo e cruzamento indevido.
- Ausência de etapa formal de higiene de dados de telefone antes do matching automático.
- Não há separação explícita entre “match sugerido” e “vínculo efetivo”.
- Falta regra de unicidade de vínculo da conversa (cliente **ou** lead, nunca ambos).

## 4. O que já existe e pode ser reaproveitado

- **Banco e índices de chat**:
  - `chat_conversations.client_id`, `lead_id`, `phone_number`, `phone_key` e índices auxiliares.
  - `chat_instances.connected_phone` + `phone_key` e índice único por usuário/número.
- **Normalização de telefone**:
  - função de normalização já utilizada no backend do chat.
- **Resolução de perfil**:
  - `getConversationProfile` já prioriza cliente e usa fallback para lead.
- **Fluxo financeiro existente**:
  - serviços e APIs de faturas/cobranças já maduros; devem ser reaproveitados no chat (sem duplicar regras).
- **UI de chat existente**:
  - contexto de conversa selecionada, perfil atual, e pontos de extensão para cards/atalhos.

## 5. Blocos de evolução

### 5.0 Higiene e normalização de telefone

Objetivo: garantir base de dados confiável para evitar match incorreto antes de evoluir vínculo automático.

Escopo:
1. Auditoria de duplicidade por tenant:
   - clientes com mesmo telefone;
   - leads com mesmo telefone;
   - cliente e lead com mesmo telefone.
2. Padronização de telefone:
   - armazenar/operar com somente dígitos;
   - regra explícita de DDI (ex.: padrão `55` quando aplicável no contexto local).
3. Estratégia para inconsistências:
   - quando houver duplicidade/ambiguidade, registrar como “match ambíguo”;
   - não criar vínculo automático nesses casos.

Critério de aceite:
- Relatório de duplicidades por tenant gerado e validado.
- Regra de normalização de telefone definida e documentada.
- Casos ambíguos deixam de gerar vínculo automático.

### 5.1 Identificação automática cliente/lead

Objetivo: toda nova conversa recebida gerar **match sugerido** com regra determinística.

Regra proposta:
1. Normalizar telefone da conversa.
2. Buscar cliente do mesmo escopo (`tenant_id`) com telefone equivalente.
3. Se não houver cliente, buscar lead.
4. Classificar resultado:
   - `high_confidence`: um único candidato inequívoco;
   - `ambiguous`: mais de um candidato possível;
   - `none`: nenhum candidato.
5. Exibir no chat:
   - perfil vinculado quando houver vínculo efetivo;
   - sugestão quando houver apenas match sugerido.

Critérios técnicos:
- Matching estrito por telefone normalizado.
- Em empate (mais de um registro com mesmo telefone), não vincular automaticamente; marcar “pendente de revisão” para vínculo manual.
- Cliente sempre tem precedência sobre lead.
- Matching sempre tenant-scoped; nunca global.

Critério de aceite:
- Conversa com telefone de cliente único gera `match_sugerido=cliente`.
- Conversa com telefone de lead único gera `match_sugerido=lead`.
- Ambiguidade não gera vínculo automático.
- Telefone sem cadastro não gera falso positivo.

### 5.2 Vínculo persistido da conversa

Objetivo: transformar match em vínculo efetivo de forma segura e auditável.

Proposta:
- Definir contrato de vínculo em `chat_conversations`:
  - `client_id` **ou** `lead_id` (regra de exclusividade mútua);
  - `link_source` (auto/manual/system) em metadata;
  - `link_confidence` (high/manual/review) em metadata.
- Separar conceitos:
  - `match_sugerido`: resultado do motor de matching;
  - `vinculo_efetivo`: vínculo persistido usado pelo sistema.
- Toda rotina de upsert/sync deve preservar vínculo manual e só atualizar automático quando permitido.
- Criar endpoint/ação explícita de “vincular conversa” para casos ambíguos.
- Regra de transição de lead para cliente:
  - se lead vinculado for convertido, migrar vínculo para cliente automaticamente;
  - registrar histórico da mudança (origem, data, ator).

Critério de aceite:
- Uma conversa nunca persiste com `client_id` e `lead_id` simultaneamente.
- Vínculo manual sempre prevalece e não é sobrescrito por sync automático.
- Conversão lead→cliente migra vínculo e gera histórico auditável.

### 5.3 Foto do WhatsApp no perfil

Objetivo: aproveitar foto da conversa sem sobrescrever dados CRM de forma arriscada.

Proposta de política:
- Separar conceitos:
  - `foto_externa_whatsapp` (origem provedora);
  - `foto_cadastro_crm` (dado mestre do CRM).
- Fase 1: usar foto WhatsApp apenas como **foto externa** de exibição no chat.
- Fase 2: permitir ação manual “usar foto do WhatsApp no cadastro” (opt-in por usuário autorizado).
- Nunca sobrescrever automaticamente foto manual já definida no CRM.
- Registrar origem e timestamp da última atualização de foto externa.

Critério de aceite:
- Foto externa aparece no chat sem alterar automaticamente a foto do CRM.
- Ação manual de cópia para CRM registra origem e data.
- Não há sobrescrita automática de foto definida manualmente.

### 5.4 Atalhos financeiros no chat

Objetivo: transformar conversa em ponto de ação financeira usando o módulo já existente.

Princípios obrigatórios:
- O chat **não cria regra financeira**.
- O chat **não calcula valor**, **não gera cobrança** e **não acessa gateway** diretamente.
- O chat atua como **orquestrador de navegação e contexto**, sempre reutilizando serviços/rotas de faturamento já existentes.

Proposta:
- **Etapa 1 (obrigatória):**
  - no painel da conversa com `client_id`, listar faturas em aberto;
  - ação “enviar link da fatura em aberto”;
  - ação “copiar link da fatura”.
- **Etapa 2:**
  - botão “nova fatura” com redirecionamento para fluxo existente de faturamento com cliente pré-selecionado.
- Para conversa vinculada a lead sem cliente:
  - exibir CTA de conversão para cliente antes de permitir faturamento.
- Não recriar lógica financeira dentro do chat; apenas consumir serviços/APIs já existentes.

Integração recomendada (sem duplicação):
- Navegação para fluxo existente:
  - `Nova fatura` -> `/customer-invoices/new?client_id={client_id}` (ou rota equivalente já usada pelo módulo de faturas de cliente).
- Listagem de faturas abertas:
  - reutilizar endpoint/serviço já existente de `customer_invoices` filtrando por cliente e status aberto.
- Envio/cópia de link:
  - reutilizar `payment_token` e URL pública já gerada pelo fluxo oficial de faturas.

Adapter leve sugerido:
- `chatFinancialAdapter` (camada de integração, sem regra de negócio):
  - `openInvoiceCreation(clientId)`
  - `getOpenInvoicesByClient(clientId)` (delegando ao service existente)
  - `buildPublicInvoiceLink(paymentToken)`
  - `sendInvoiceLink(...)` (reuso de função de envio já existente)
- Requisito: adapter não pode criar query paralela nem chamar gateway.

Critério de aceite:
- Conversa com cliente vinculado exibe faturas em aberto corretamente.
- Envio/cópia de link utiliza fatura existente sem criar duplicidade.
- “Nova fatura” abre fluxo existente com pré-preenchimento correto.
- Conversa sem cliente vinculado não libera ação financeira indevida.

### 5.5 Preparação para futuras automações

Objetivo: preparar fundação sem implementar automações agora.

Preparações:
- Padronizar eventos de domínio do chat (ex.: `conversation_linked`, `invoice_sent_from_chat`, `lead_created_from_chat`).
- Definir payload mínimo para timeline do cliente.
- Garantir idempotência e rastreabilidade para futuras automações (tarefas, tickets, follow-ups).

Critério de aceite:
- Eventos de domínio mínimos definidos com nomenclatura e payload padrão.
- Pontos de emissão mapeados sem alterar comportamento atual.
- Preparação pronta para timeline e automações futuras.

### Eventos de domínio sugeridos

- `chat_match_client_success`
- `chat_match_lead_success`
- `chat_match_ambiguous`
- `chat_link_manual`
- `chat_link_auto_effective`
- `chat_link_migrated_lead_to_client`
- `chat_invoice_sent`
- `chat_invoice_created`

Objetivo:
- facilitar debug operacional;
- suportar auditoria de vínculo;
- preparar automações futuras com eventos estáveis.

## Mapeamento atual do faturamento (base para integração do chat)

Onde hoje a fatura é criada (estado atual):
- `src/pages/Chat.tsx` chama `financeService.createInvoice(...)` em fluxo próprio de modal.
- `src/services/finance.ts` usa `/api/invoices` (fluxo legado de faturas gerais).

Service central de faturamento a ser priorizado:
- `src/services/customerInvoices.ts` (módulo `customer_invoices`).
- Backend central em `packages/backend/src/controllers/customerInvoicesController.ts` e `packages/backend/src/services/customerBillingService.ts`.

Como o link público é gerado:
- via `payment_token` no fluxo oficial de `customer_invoices` (página pública de pagamento).

Pontos com risco de duplicação no chat:
- modal próprio de criação de fatura no chat com campos/validação próprios;
- uso de `financeService` (legado `/api/invoices`) em vez do módulo `customer_invoices`;
- possibilidade de manter duas jornadas de criação de fatura com regras divergentes.

Ajuste necessário no plano:
- descontinuar criação de fatura “nativa” do chat;
- chat deve apenas disparar o fluxo oficial e consumir dados oficiais de `customer_invoices`.

## 6. Impacto técnico por camada

- **banco**
  - Fase 0: consultas/auditoria de duplicidade por tenant e padronização de telefone.
  - Possível ajuste incremental em `chat_conversations.metadata` (sem ruptura) para armazenar fonte/confiança de vínculo.
  - Regra de integridade para garantir exclusividade de vínculo (`client_id` xor `lead_id`) quando aplicável.
  - Revisão de índices de telefone normalizado para matching em escala.
  - Opcional futuro: coluna dedicada para origem de vínculo (se metadata ficar insuficiente).

- **backend**
  - Consolidar uma única rotina de matching cliente/lead reutilizada por upsert, sync e consultas.
  - Separar “match sugerido” de “vínculo efetivo” no domínio.
  - Tenant scoping obrigatório em toda query de matching (não depender só de `user_id`).
  - Endpoints de vínculo manual (setar/remover vínculo) e regras de precedência.
  - Migração automática de vínculo lead→cliente quando houver conversão.
  - Reuso exclusivo de serviços financeiros existentes para atalhos de chat (sem service paralelo).

- **frontend**
  - Card de perfil unificado (cliente/lead) com estado de vínculo (auto/manual/pendente).
  - Exibir sugestão de match ambíguo para decisão manual.
  - Bloco financeiro contextual no painel da conversa.
  - UX para resolver ambiguidades de telefone sem vínculo automático incorreto.
  - Remover/jubilhar formulário financeiro próprio no chat e usar redirecionamento/deep-link para fluxo oficial.

- **integração Uazapi**
  - Manter criação/conexão estáveis.
  - Padronizar captura de metadados úteis (nome/foto/telefone) para o matching.
  - Evitar acoplamento de regra de negócio CRM ao payload bruto do provedor.

## 7. Riscos e cuidados

- Falso positivo de vínculo por telefone compartilhado/reutilizado.
- Divergência entre vínculo persistido e vínculo resolvido dinamicamente por query.
- Regressão de performance no `getConversations` com JOINs/regex em base grande.
- Vazamento cross-tenant se algum JOIN perder filtro de tenant.
- Sobrescrita indevida de dados CRM (foto, nome) por informação externa.

Mitigações:
- Fase 0 obrigatória antes do vínculo automático efetivo.
- Regra de precedência explícita + fallback para revisão manual.
- Índices e normalização de telefone consistentes.
- Auditoria de tenant-scoping em toda query de matching.
- Regra de exclusividade de vínculo por conversa (cliente ou lead).
- Flags de rollout por etapa.

## 8. Ordem recomendada de implementação

1. Fase 0 — Higiene de telefone.
2. Fase 1 — Matching e vínculo.
3. Fase 2 — UI e perfil.
4. Fase 3 — Financeiro.
5. Fase 4 — Automações.

## 9. Fases sugeridas

- **Fase 0 — Higiene e normalização de telefone**
  - Auditoria de duplicidade por tenant (clientes/leads/cruzado).
  - Definição de normalização canônica (somente dígitos + regra DDI).
  - Bloqueio de auto-vínculo em casos ambíguos.

  **Critério de aceite**
  - Duplicidades mapeadas e classificadas.
  - Regra canônica de telefone aprovada.
  - Auto-vínculo desabilitado para casos ambíguos.

- **Fase 1 — Matching e vínculo determinísticos**
  - Unificar matching no backend.
  - Separar `match_sugerido` de `vinculo_efetivo`.
  - Persistir vínculo com origem/confiança e exclusividade de entidade.
  - Garantir que sync não apague vínculo manual.
  - Aplicar precedência cliente > lead com tenant scoping.

  **Critério de aceite**
  - Conversa com cliente único vincula corretamente.
  - Conversa com lead único vincula corretamente quando não houver cliente.
  - Ambiguidade não vincula automaticamente.
  - Vínculo manual não é sobrescrito.

- **Fase 2 — Experiência de CRM no chat**
  - Melhorar card de perfil (cliente/lead).
  - Fluxo de vínculo manual e tratamento de ambiguidades.
  - Política de foto externa (exibição segura).
  - Migração de vínculo quando lead virar cliente.

  **Critério de aceite**
  - Usuário visualiza status de vínculo (auto/manual/pendente).
  - Ambiguidades podem ser resolvidas manualmente.
  - Foto externa separada da foto CRM.
  - Conversão lead→cliente migra vínculo com histórico.

- **Fase 3 — Financeiro contextual (etapas seguras)**
  - Etapa 1: listar faturas em aberto + enviar link + copiar link.
  - Etapa 2: “nova fatura” via redirecionamento para fluxo existente pré-selecionado.
  - Telemetria de conversão conversa→fatura.
  - Introduzir adapter leve `chatFinancialAdapter` apenas para orquestração.

  **Critério de aceite**
  - Etapa 1 operando sem duplicar lógica financeira nem query paralela.
  - Etapa 2 reutilizando fluxo oficial de faturamento (`customer_invoices`).
  - Conversas sem cliente não executam ação financeira indevida.
  - Nenhum ponto do chat cria cobrança/gateway diretamente.

  **Arquivos-alvo para ajuste (planejamento, sem implementação nesta etapa)**
  - `src/pages/Chat.tsx` (trocar criação própria por navegação/deep-link para fluxo oficial).
  - `src/services/finance.ts` (não usar para criação dentro do chat).
  - `src/services/customerInvoices.ts` (fonte oficial para listagem/consulta de faturas do cliente no chat).
  - `src/pages/CustomerInvoiceNew.tsx` (garantir suporte a pré-seleção por `client_id` via rota/query).

- **Fase 4 — Base para automações**
  - Eventos de domínio padronizados.
  - Timeline de cliente com eventos de conversa.
  - Preparação para tarefas/tickets automáticos.

  **Critério de aceite**
  - Eventos mínimos emitidos com consistência.
  - Timeline pronta para consumo futuro.
  - Base preparada para automações sem refatoração disruptiva.

## 10. Recomendação final

Executar a evolução em pequenos incrementos, começando por **higiene de dados de telefone (Fase 0)**, depois **matching/vínculo determinístico (Fase 1)**, **UX de perfil (Fase 2)** e então **financeiro contextual com reuso (Fase 3)**. Essa ordem reduz risco de inconsistência, evita vínculo indevido entre tenants, preserva o chat já estável e cria base segura para automações futuras (Fase 4).
