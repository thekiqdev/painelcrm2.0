# 01 — Escopo de produto e canais

**Pacote:** [whatsapp-official-sa-dispatch](./README.md)  
**Data:** 2026-08-03  
**Status:** **D1 FECHADO** (2026-08-03)  
**Depende de:** —  
**Bloqueia:** 02–11 (implementação depende do ADR; escopo produto já decidido)

---

## 1. Objetivo

Fechar o **escopo de produto** da implantação do disparo via API oficial Meta no Super Admin, sem misturar trilhos (UazAPI vs Meta, plataforma vs tenant, transacional vs marketing).

---

## 2. Pedido de produto (entrada)

1. Disparo de mensagens no **Kanban de registro** (Ops Kanban).
2. Disparo de **mensagens padrão do sistema**: nova senha, pagamento criado, atrasado, pago, etc.
3. Campanhas e **anúncios** da plataforma no plano oficial.
4. Builder de modelos com botões/links/variáveis e edição local ↔ Meta.

---

## 3. Achados já mapeados (baseline)

### 3.1 Dois trilhos WhatsApp

| Trilho | Provider | Uso atual |
|--------|----------|-----------|
| Não oficial | UazAPI | Motores de notificação (tenant + plataforma), Ops via gateway, reset/troca senha, anúncios |
| Oficial | Meta Cloud Graph | Conta Super Admin, templates HSM, campanhas, webhook, chat oficial |

### 3.2 Dois motores de notificação

| Motor | Domínio | Prefixos / exemplos | v1 oficial? |
|-------|---------|---------------------|-------------|
| Plataforma | SaaS / Super Admin | `platform.auth.*`, `platform.billing.*`, `platform.account.*`, trial, tickets | **SIM — todo o catálogo** |
| Tenant CRM | Clientes do tenant | `invoice.*`, `proposal.*`, `contract.*`, `appointment.*` | **NÃO** |

### 3.3 Kanban de registro

- Rota UI: `/superadmin/operacao/kanbans`
- Tenant virtual Ops + boards Aquisição, Recovery, Onboarding, Expansão, Reativação, Engajamento Trial
- Envio automático existente (checkout abandonado / Phase2) via **gateway → UazAPI**, não Meta
- **v1:** automações **+ envio manual no card**

---

## 4. Perguntas — respostas (D1)

| # | Pergunta | Resposta |
|---|----------|----------|
| 1 | SA only vs tenant CRM? | **Só Super Admin / plataforma.** Sem oficial no tenant/cliente. |
| 2 | Fallback UazAPI? | **Não.** Se o fluxo optar por API oficial, **sem fallback** UazAPI. UazAPI só se o fluxo permanecer deliberadamente no não-oficial. |
| 3 | Nova senha? | Incluída no **catálogo completo** `platform.*` (reset e demais eventos de auth da plataforma). |
| 4 | Pagamentos? | **SaaS** (`platform.billing.charge.created` / `.overdue` / `payment_confirmed`) — não `invoice.*` CRM. |
| 5 | Kanban? | Automações Ops **+ envio manual no card**. |
| 6 | Campanhas? | **Entram no plano.** |
| 7 | Anúncios? | **Entram no plano**, com wizard oficial (ver §5 e [04C](./04C_BUILDER_ANUNCIOS_CAPACIDADES_META.md)). |
| 8 | Fase Modelos gate? | **Sim.** Sync → enviar → vincular → APPROVED antes de disparar. |

---

## 5. Matriz de escopo (fechada)

| Caso de uso | Incluir v1? | Canal alvo | Notas |
|-------------|-------------|------------|-------|
| Ops Kanban — automação coluna | **sim** | Meta (oficial) | HSM vinculado |
| Ops Kanban — envio manual no card | **sim** | Meta | Template picker / vínculo |
| **Todo** catálogo platform-notifications | **sim** | Meta | Inclui senha, billing, account, trial, plan, tickets, etc. |
| Reset senha WhatsApp | **sim** | Meta | Parte do catálogo |
| Troca senha logada | **sim** | Meta | Parte do catálogo SA (alinhar publish) |
| Conta criada / boas-vindas | **sim** | Meta | |
| Cobrança SaaS criada / atrasada / paga | **sim** | Meta | |
| Trial / plano ativado / tickets | **sim** | Meta | Catálogo completo |
| `invoice.*` (tenant CRM) | **não** | — | Fora — plataforma do cliente |
| Propostas / contratos / agenda tenant | **não** | — | Fora |
| Fase Modelos (04B) como gate | **sim** | — | Obrigatório |
| Campanhas Meta | **sim** | Meta | No plano; evoluir com builder |
| Anúncios Super Admin | **sim** | Meta (quando canal oficial) | Wizard: criar → submeter HSM → APPROVED → liberar Enviar |
| Builder botões/menus/variáveis | **sim** | Meta | Ver [04C](./04C_BUILDER_ANUNCIOS_CAPACIDADES_META.md) |
| Editar modelo no SA e na Meta | **sim** | Meta | Create existe; **update** a investigar (04C) |

---

## 6. Requisitos de produto adicionais (amarrados ao D1)

Detalhados em [04B](./04B_CICLO_VIDA_MODELOS.md) e [04C](./04C_BUILDER_ANUNCIOS_CAPACIDADES_META.md):

1. **Wizard anúncio oficial:** escolher API oficial → criar anúncio → step envia modelo à Meta → quando status APPROVED → libera botão Enviar.
2. **Builder rico:** botões, menus/listas conforme disponibilidade Meta, links, nome de cliente e demais variáveis — inventariar API e expor na plataforma.
3. **Modelos editáveis:** editar no sistema e propagar/resubmeter na Meta.

---

## 7. Riscos residuais (escopo fechado, execução ainda)

- Sem fallback UazAPI: falha Meta = falha de entrega (precisa observabilidade forte — [09](./09_OBSERVABILIDADE_ROLLBACK.md)).
- PIX button UazAPI sem parity Meta em alguns eventos.
- Duplicar disparos anúncio + campanha + kanban no mesmo lead.
- Edição de HSM na Meta pode exigir reaprovação / novo nome (04C).
- Builder “todas opções Meta” é esforço contínuo — priorizar por fase no 04C.

---

## 8. Decisão D1 (fechada)

| Campo | Valor |
|-------|-------|
| Escopo v1 | **Super Admin only.** Todo catálogo de mensagens plataforma SA; Ops Kanban (auto + manual no card); campanhas; anúncios com wizard oficial; Fase Modelos; builder/edição de modelos (04C). |
| Fora de escopo | Plataforma do **cliente** (tenant CRM): `invoice.*`, propostas, contratos, agenda; WABA/oficial por tenant; fallback automático UazAPI em fluxos oficiais. **Futuro:** [PLAN_FUTURO_TENANT.md](./PLAN_FUTURO_TENANT.md). |
| Política UazAPI | Só em fluxos que **não** migraram para oficial. Oficial = Meta apenas. |
| Owner produto | (preencher nome) |
| Data de fechamento | **2026-08-03** |

**ADR:** [11_ADR_DECISOES.md](./11_ADR_DECISOES.md) § D1  

**Próximo documento:** [02_CONTA_META_E_REMETENTE.md](./02_CONTA_META_E_REMETENTE.md) · investigação builder/anúncios [04C](./04C_BUILDER_ANUNCIOS_CAPACIDADES_META.md)
