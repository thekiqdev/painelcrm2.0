# Plano de execução — Módulo Propostas / Orçamentos

Objetivo: evoluir o módulo com **baixo risco**, **compatível com produção**, em **etapas incrementais**, culminando em **“Gerar fatura”** a partir de proposta aceita e, depois, **automação opcional**.

---

## Princípios

- Não quebrar API existente sem versão ou período de convivência.  
- Preferir **colunas novas** e **defaults** a rewrites de enum no curto prazo.  
- Reutilizar **`customer_invoices` + `customer_invoice_items`** e `createManualInvoice` / serviços já testados.  
- Toda ação sensível (conversão, aceite público) com **checagem no backend**.

---

## Etapa 0 — Alinhamento e higiene (rápida, alto impacto)

| Item | Objetivo | Arquivos prováveis | Risco | Impacto |
|------|----------|-------------------|-------|---------|
| 0.1 | Conectar `/proposals` à API (`getProposals`, filtros por aba) | `src/pages/Proposals.tsx`, `src/services/proposals.ts` | Baixo | Alto (UX real) |
| 0.2 | Corrigir KPI “propostas” no dashboard para contar `proposals` ou renomear métrica | `packages/backend/src/controllers/dashboardController.ts`, `src/pages/Dashboard.tsx` | Baixo | Médio (confiança) |
| 0.3 | Unificar link do Chat com rota real: criar `/proposals/:id` **ou** ajustar link para funil | `src/App.tsx`, `src/pages/Chat.tsx` | Baixo | Médio |

**Critérios de aceite:** listagem mostra propostas do tenant; KPI não mente; link gerado no chat abre detalhe válido.

---

## Etapa 1 — Detalhe e transições mínimas

| Item | Objetivo | Arquivos prováveis | Risco | Impacto |
|------|----------|-------------------|-------|---------|
| 1.1 | Validar transições de `status` no backend (ex.: `draft`→`sent`→`accepted`) | `packages/backend/src/controllers/proposalsController.ts` (+ helper) | Baixo | Médio |
| 1.2 | Preencher `sent_date` ao passar para `sent` se vazio | idem | Baixo | Médio |
| 1.3 | Botões de aceitar/recusar condicionados a permissão e estado | `src/pages/ProposalDetails.tsx` | Baixo | Médio |

**Critérios de aceite:** não é possível saltar estados inválidos via API; UI reflete erros.

---

## Etapa 2 — Funil: dados reais (opcional MVP)

| Item | Objetivo | Arquivos prováveis | Risco | Impacto |
|------|----------|-------------------|-------|---------|
| 2.1 | Substituir `initialDeals` por fetch de propostas filtradas por `funnel_id` | `src/hooks/useFunnelData.ts`, componentes de funil | Médio | Alto |
| 2.2 | Ao mover card (se Kanban suportar), `PATCH` `stage_id` | hooks + API | Médio | Alto |

**Critérios de aceite:** board de tipo `proposals` reflete registros reais; mover estágio persiste.

*Nota:* se o Kanban atual for só visual, limitar escopo a **lista sincronizada** antes de drag-and-drop.

---

## Etapa 3 — Vínculo proposta ↔ fatura (fundação)

| Item | Objetivo | Arquivos prováveis | Risco | Impacto |
|------|----------|-------------------|-------|---------|
| 3.1 | Migration: `customer_invoices.proposal_id UUID NULL REFERENCES proposals(id)` **ou** estender `origin` com `'proposal'` + constraint | `database/init/*.sql` | Médio | Alto |
| 3.2 | Índice único parcial: uma fatura “principal” por proposta (ou permitir N com regra de negócio explícita) | SQL | Médio | Evita duplicidade |
| 3.3 | Expor `proposal_id` no create manual **interno** (só serviço, não público) | `customerBillingService.ts`, `customerInvoicesController.ts` | Médio | Alto |

**Critérios de aceite:** fatura criada a partir de proposta grava vínculo; listagem de detalhe da proposta mostra fatura(s).

---

## Etapa 4 — Botão “Gerar fatura”

| Item | Objetivo | Arquivos prováveis | Risco | Impacto |
|------|----------|-------------------|-------|---------|
| 4.1 | `POST /api/proposals/:id/convert-to-invoice` (nome sugerido) | `proposalsRoutes.ts`, novo handler ou serviço | Médio | Alto |
| 4.2 | Regras: `status === 'accepted'`, `client_id` presente, não convertida (ou política N:1 documentada) | serviço | Médio | Alto |
| 4.3 | Mapear itens JSON → itens fatura (centavos, desconto 0 inicial) | serviço dedicado `proposalToInvoiceMapper` | Médio | Alto |
| 4.4 | Permissão `convert_to_invoice` ou reuso `billing` + `proposals.edit` | `permissions`, UI | Médio | Médio |
| 4.5 | UI: botão na `ProposalDetails` + toast + redirect opcional para fatura | `ProposalDetails.tsx`, rota fatura | Baixo | Alto |

**Critérios de aceite:** uma ação gera fatura consistente com totais; repetição bloqueada ou controlada; erro claro se gateway/CPF faltar.

---

## Etapa 5 — Timeline / auditoria

| Item | Objetivo | Arquivos prováveis | Risco | Impacto |
|------|----------|-------------------|-------|---------|
| 5.1 | Tabela `proposal_events` ou reuso de módulo de atividades se existir | SQL + serviço | Médio | Médio |
| 5.2 | Eventos: `created`, `updated`, `sent`, `accepted`, `rejected`, `invoice_created` | controller | Baixo | Médio |

**Critérios de aceite:** conversão e mudanças críticas deixam rastro com usuário e timestamp.

---

## Etapa 6 — Link público e tracking

| Item | Objetivo | Arquivos prováveis | Risco | Impacto |
|------|----------|-------------------|-------|---------|
| 6.1 | Token opaco em `proposals` ou tabela `proposal_public_links` | SQL | Médio | Alto |
| 6.2 | Rota pública GET + POST aceite (com rate limit) | novas routes públicas | Alto | Alto |
| 6.3 | `viewed_at` / contador | SQL + patch | Baixo | Médio |

**Critérios de aceite:** cliente vê proposta sem login; aceite registra evidência mínima; não vaza dados de outros tenants.

---

## Etapa 7 — Automação pós-aceite (configurável)

| Item | Objetivo | Risco | Impacto |
|------|----------|-------|---------|
| 7.1 | Config tenant: `off` \| `draft_invoice` \| `issue_charge` | Médio | Alto |
| 7.2 | Job ou hook após `accepted` | Médio | Alto |

**Critérios de aceite:** padrão `off`; modos avançados exigem feature flag e documentação.

---

## Etapa 8 — CPQ leve / templates (longo prazo)

- Biblioteca de blocos, templates por produto, linhas opcionais.  
- Possível alinhamento com módulo de **contratos** (snapshot HTML) ou catálogo.

**Critérios de aceite:** definidos em RFC separado após Etapas 0–4 estáveis.

---

## Ordem recomendada

`0 → 1 → 3 → 4 → 5 → 2 → 6 → 7 → 8`

*(Etapa 2 pode subir se o funil for prioridade comercial imediata.)*

---

## Resumo de riscos por fase

- **0–1:** baixo.  
- **3–4:** médio (integridade financeira, centavos, gateway).  
- **6:** alto (superfície de ataque pública).  
- **7:** médio/alto (efeitos colaterais em cobrança).
