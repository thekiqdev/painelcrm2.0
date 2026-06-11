# AUDIT_SIGNUP_WIZARD_LOOP_AND_LEAD_NAME

**Modo:** READ ONLY  
**Data:** 2026-05-24  
**Contexto:** Após sprints E2 (verificação WhatsApp) e E3 (estratégia de signup), observados dois sintomas no fluxo `/cadastro`:

1. Wizard aparenta entrar em loop entre nome, e-mail, senha e quantidade de usuários, sem avançar corretamente.
2. Card no Ops Kanban permanece com o título **"Solicitante"** em vez do nome informado pelo usuário.

**Escopo:** investigação estática do código — sem alterações.

---

## Resumo executivo

| Problema | Causa raiz provável | Classificação |
|----------|---------------------|---------------|
| Loop wizard | Desalinhamento entre `stepIndex` (macro-etapas), `leadSubStep` (sub-etapas do lead) e hidratação via `?lead=`; `useEffect` de retomada reexecuta em mudanças de `params`/`user` e força `leadSubStep='credentials'` quando o e-mail já está finalizado, mesmo na etapa **plan**; caminho `continue_lead` navega para `step=plan` mas **Volta** do plano reabre credenciais; URL nem sempre atualizada após avanço (`setStepIndex(1)` sem `navigate`) | **A)** state machine inconsistente + **B)** efeito duplicado / re-hidratação |
| Nome "Solicitante" no Kanban | Lead criado/atualizado em `POST /contact/capture` com placeholder **persistido** em `acquisition_leads.name`; Kanban sincronizado nesse momento via `acquisition.lead.created`; após credenciais o caminho dominante E2 é `continue_lead`, que **atualiza** o lead mas **não** dispara `postSignupStep` nem evento de sync adicional; re-capture ao voltar para verificação pode **regravar** "Solicitante" | **C)** lead criado cedo demais + **D)** sync incompleto após UPDATE + **E)** placeholder persistido |

---

## Parte 1 — Loop do wizard

### 1.1 State machine esperada (pós-E2)

```text
Telefone (identity)
    ↓
Código WhatsApp (verification)
    ↓
Nome + e-mail + senha (credentials)
    ↓
Plano + quantidade de usuários (plan)
    ↓
Conversão / trial (conversion)
```

**Macro-etapas** (`WIZARD_STEP_IDS`): `lead` (0) → `plan` (1) → `conversion` (2).  
**Sub-etapas do lead** (`leadSubStep`): `identity` → `verification` → `credentials`.

### 1.2 Arquivos e funções auditados

| Artefato | Arquivo | Papel |
|----------|---------|-------|
| Página wizard | `src/pages/AcquisitionSignupFlow.tsx` | `stepIndex`, `leadSubStep`, `handleNext`, `handleBack`, efeitos de retomada |
| Resolução de etapa | `src/lib/acquisitionSignupResume.ts` | `resolveWizardStepFromLead()`, `normalizeResumeNavigation()`, `shouldSkipSignupStepOnResume()` |
| Draft de senha | `src/lib/acquisitionSignupCredentialDraft.ts` | `sessionStorage` — **somente senha**, não etapa |
| Form inicial | `src/components/acquisition/onboarding/types.ts` | `INITIAL_SIGNUP_FORM` |

### 1.3 Estados gravados vs restaurados

| Estado | Onde vive | Gravado? | Restaurado? |
|--------|-----------|----------|-------------|
| `stepIndex` | React `useState` | Não em storage | Inferido de URL `?step=` e/ou `current_stage` do lead via API |
| `leadSubStep` | React `useState` | Não em storage | Inferido: se lead tem e-mail real → força `'credentials'` |
| `leadId` | React + URL `?lead=` | Parcial (`setLeadId` após capture; URL atualizada só em alguns caminhos) | `params.get('lead')` + `GET /leads/:id` |
| `form` (nome, email, phone, senha, plano, users) | React `useState` | Senha em `acquisition_signup_credential_draft` | Autofill de URL, lead API, usuário logado |
| Verificação WhatsApp | React (`phoneVerificationId`, `verificationCode`, flags) | Não | Perdido em refresh — usuário refaz verificação |

**Não existe** persistência de `currentStep` / `currentSubstep` em `sessionStorage` no wizard (exceto senha e sessão pós-ativação).

### 1.4 Fluxo real encontrado (caminho E2 típico)

```text
1. identity → send-code → verification
2. verify-code → captureVerifiedPhoneContact()
      POST /contact/capture  (name = "Solicitante")
      setLeadId (state; URL ainda pode ser /cadastro sem ?lead=)
3. credentials → POST /contact/resolve
      → action: continue_lead (lead já existe com e-mail finalizado)
      → navigate /cadastro?lead={id}&step=plan
4. useEffect de retomada dispara (params mudou):
      emailReady = true  → setLeadSubStep('credentials')   ← conflito
      setStepIndex(1)    → plan (quantidade de usuários)
5. UI mostra plan; leadSubStep interno = credentials (latente)
6. Usuário clica Voltar no plan:
      setStepIndex(0) + setLeadSubStep('credentials')
      → volta para nome/e-mail/senha
7. Re-submit → continue_lead → plan de novo  ⟲ loop percebido
```

**Fluxo alternativo (sem `continue_lead`):**

```text
credentials → resolve (new_lead) → postSignupStep('contact')
      → setStepIndex(1) SEM atualizar URL
URL permanece /cadastro (sem ?lead=) → refresh perde progresso;
efeito sem leadParam redefine stepIndex para 0.
```

### 1.5 `useEffect` que altera etapa após submit

```153:234:src/pages/AcquisitionSignupFlow.tsx
  useEffect(() => {
    const leadParam = params.get('lead');
    const stepParam = params.get('step');
    // ...
    if (!leadParam) {
      setResumeHydrating(false);
      setStepIndex(resolveWizardStepFromLead(stepParam, null));
      return;
    }
    // fetch GET /leads/:id
    // ...
    if (emailReady) setLeadSubStep('credentials');
  // ...
    setStepIndex(resolveWizardStepFromLead(stepParam, leadPayload));
  }, [params, user, navigate]);
```

**Problemas identificados:**

1. **`emailReady` ignora `stepIndex`:** sempre força `credentials` quando o lead já tem e-mail real, inclusive ao retomar em `step=plan`.
2. **Dependência `user`:** qualquer mudança no contexto de auth reexecuta hidratação completa (form + etapa).
3. **Segundo efeito** (linhas 236–241) ajusta `stepIndex` por `form.plan_id` quando **não** há `?lead=` — pode competir com o primeiro.
4. **`handleBack` do plano** (linhas 724–726) decrementa `stepIndex` e reabre `credentials` — mecanismo direto do loop plan ↔ credenciais.

### 1.6 `resolveWizardStepFromLead` — inferência por estágio

```108:125:src/lib/acquisitionSignupResume.ts
export function resolveWizardStepFromLead(
  urlStep: string | null | undefined,
  lead: PublicAcquisitionLeadSnapshot | null | undefined,
): number {
  if (urlStep) {
    return resolveWizardStepIndex(urlStep, lead?.selected_plan_id ?? null);
  }
  const stage = lead?.current_stage;
  if (stage === 'contact_captured') return 1;  // pula macro-etapa lead
  // ...
  return 0;
}
```

Com `current_stage = contact_captured` e sem `?step=` na URL, o wizard **assume etapa plan (1)** mesmo que o usuário ainda esteja visualmente na sub-etapa credentials — reforça o desalinhamento.

### 1.7 Resposta — classificação do loop

| Opção | Aplica? | Evidência |
|-------|---------|-----------|
| **A) State machine inconsistente** | **Sim (primária)** | `stepIndex` vs `leadSubStep` independentes; estágio `contact_captured` mapeia para plan; `handleBack` plan→credentials |
| **B) Efeito duplicado** | **Sim (secundária)** | Dois `useEffect` em `stepIndex`; retomada reexecuta em `[params, user]` |
| **C) Restore sessionStorage** | **Parcial** | Não restaura etapa; draft de senha não causa loop; URL `?lead=` **sim** re-dispara hidratação |
| **D) Double submit** | **Parcial** | `contact/resolve` + `signup/step` (contact) podem resolver duas vezes no caminho `new_lead`; no E2 dominante (`continue_lead`) o segundo resolve é **pulado** |
| **E) Outro** | — | — |

**Classificação final (loop):** **A + B**, com **C** (URL/retomada) como amplificador.

---

## Parte 2 — Persistência local (signup)

### 2.1 sessionStorage

| Chave | Quem grava | Quem lê | Quando limpa | Pode voltar etapa? |
|-------|------------|---------|--------------|-------------------|
| `acquisition_signup_credential_draft` | `saveSignupCredentialDraft()` em `AcquisitionSignupFlow` | `inspectCredentialDraft()` no onboarding operacional | `clearSignupCredentialDraft()` | **Não** — só senha |
| `acquisition_provision_password_ui_reason` | `setProvisionPasswordUiReason()` | `getStoredProvisionPasswordUiReason()` | `setProvisionPasswordUiReason('hidden')` | Não |
| `acquisition_onboarding_session` | `AcquisitionSignupFlow` após `activate/trial` | `AcquisitionOperationalOnboarding`, redirects | Fluxo onboarding | Não no wizard |
| `painelcrm.onboardingSession` | `onboardingSessionStorage.ts` (avatar) | Mesmo módulo | `clearOnboardingSessionDraft()` | Não |

### 2.2 localStorage

| Chave | Quem grava | Quem lê | Relação signup |
|-------|------------|---------|----------------|
| `painelcrm_signup_strategy_v1` | `signupStrategy.ts` | `loadSignupStrategy()` | Estratégia checkout vs exclusive — **não** etapa wizard |
| `painelcrm_signup_entry_v1` | `signupEntry.ts` | `loadSignupEntryConfig()` | URLs de entrada — **não** etapa wizard |
| `painelcrm_signup_cache_epoch` | `invalidateSignupCaches()` | Validação de epoch em strategy/entry | Invalidação cross-tab (E3.1.1) — **não** etapa wizard |
| `painelcrm_signup_strategy_session_epoch` | `signupStrategy.ts` | Mesmo módulo | Epoch de sessão strategy |

**Conclusão:** nenhuma chave de storage persiste `stepIndex` ou `leadSubStep`. O que **pode** forçar regressão de etapa é a **URL** (`?lead=`, ausência de `?step=`) combinada com o `useEffect` de retomada — não o `sessionStorage` do wizard em si.

---

## Parte 3 — Criação do lead (fluxo E2)

### 3.1 Linha do tempo

| Momento | Endpoint / ação | Lead em `acquisition_leads`? | Nome |
|---------|-----------------|------------------------------|------|
| Telefone (identity) | `POST /phone/send-code` | Não | — |
| Código (verification) | `POST /phone/verify-code` | Não | — |
| **Após verificação** | **`POST /contact/capture`** | **Sim — INSERT ou UPDATE** | **`"Solicitante"`** (placeholder) |
| Credenciais | `POST /contact/resolve` | UPDATE (upsert por e-mail) | Nome real se enviado |
| Avanço wizard | `POST /signup/step` (contact/plan/checkout) | UPDATE estágio | Repassa `name` do form |

### 3.2 `POST /contact/capture`

Frontend (`captureVerifiedPhoneContact`):

```316:328:src/pages/AcquisitionSignupFlow.tsx
    const captureRes = await apiClient.post(
      '/api/public/acquisition/contact/capture',
      {
        name: ACQUISITION_CAPTURE_NAME_PLACEHOLDER,
        phone: form.lead_phone.replace(/\D/g, ''),
        lead_id: leadId || undefined,
        phone_verification_id: phoneVerificationId,
      },
    );
```

Backend (`captureAcquisitionPhoneContact`):

- Lead novo: `insertAcquisitionLead({ name, email: pending+...@signup.painelcrm.local, stage: contact_captured })`
- Lead existente: `poolTouchNamePhone` → `SET name = COALESCE(NULLIF($2,''), name)` — **"Solicitante" não é vazio, sobrescreve nome anterior**
- Em ambos: `void publishAcquisitionLeadCreated(lead)` → sync Ops Kanban

**Resposta:** o lead é criado **depois da verificação**, **antes** do nome real e **antes** das credenciais.

---

## Parte 4 — Origem de "Solicitante"

| Campo | Valor |
|-------|-------|
| **Arquivo** | `src/components/acquisition/onboarding/constants.ts` |
| **Constante** | `ACQUISITION_CAPTURE_NAME_PLACEHOLDER = 'Solicitante'` |
| **Linha** | 88 |
| **Comentário no código** | *"Nome temporário no capture (API exige name); substituído na etapa de credenciais."* |
| **Uso** | `AcquisitionSignupFlow.tsx` → `POST /contact/capture` (linha 324) |

**Natureza do valor:**

| Tipo | Aplica? |
|------|---------|
| Placeholder de UI | Não — não é label de input |
| Fallback de exibição | Não diretamente |
| **Valor persistido no capture** | **Sim** — gravado em `acquisition_leads.name` e em `metadata.display.name` no primeiro sync do Kanban |

---

## Parte 5 — Atualização do lead após nome / e-mail

### 5.1 Existe UPDATE?

**Sim.** `POST /contact/resolve` → `resolveAcquisitionContact()` → `upsertAcquisitionLeadContact()`:

```149:151:packages/backend/src/acquisition/acquisitionLeadRepository.ts
    `UPDATE acquisition_leads
     SET name = COALESCE($2, name),
```

No caminho E2 típico, após `finalizeAcquisitionLeadEmail`, `findAcquisitionLeadByEmail` encontra o mesmo lead → ação **`continue_lead`** → UPDATE com `input.name`.

### 5.2 Empresa

**Não** há campo `company` em `acquisition_leads` no signup. Nome da empresa é coletado depois, em `/onboarding/acquisition` (`provision` / `company`).

### 5.3 O que **não** acontece no `continue_lead`

Quando `shouldSkipSignupStepOnResume(resolveRes.data.action)` é verdadeiro, o frontend:

- Navega para `resume_path` (ex.: `?lead=&step=plan`)
- **Não** chama `postSignupStep('contact')`

Logo **não** dispara `publishAcquisitionSignupStarted` nem `publishAcquisitionStageChanged` nesse passo — apenas o UPDATE silencioso do resolve.

### 5.4 Re-capture perigoso

Se o usuário volta de `credentials` → `verification` (`handleBack`) e verifica de novo:

- `captureVerifiedPhoneContact()` reenvia `name: "Solicitante"`
- `poolTouchNamePhone` **sobrescreve** nome real por "Solicitante"
- `publishAcquisitionLeadCreated` dispara sync novamente com nome placeholder

---

## Parte 6 — Sync Ops Kanban

### 6.1 `syncAcquisitionLeadToOpsKanban()`

Arquivo: `packages/backend/src/services/superadminOpsKanbanLeadService.ts`

| Cenário | Comportamento |
|---------|---------------|
| Card **não** existe | INSERT em `chat_kanban_cards` com `metadata` de `buildLeadCardMetadata(lead)` |
| Card **já** existe | `moveOpsCardWithAutomations()` com `metadataPatch` — **merge** de metadata, move coluna se necessário |

`buildLeadCardMetadata` inclui `display.name: lead.name` (linha 76).

**Não existe coluna `title` em `chat_kanban_cards`.** O título na UI vem do enrichment query.

### 6.2 Quando o sync roda

| Evento | Handler | Momento típico E2 |
|--------|---------|-------------------|
| `acquisition.lead.created` | `handleOpsKanbanAcquisitionLeadCreated` | **Capture** (nome = Solicitante) |
| `acquisition.signup.started` | `handleOpsKanbanAcquisitionSignupStarted` | `postSignupStep` — **pulado** em `continue_lead` |
| `acquisition.stage.changed` | `handleOpsKanbanAcquisitionStageChanged` | Mudança de estágio — **pulado** se não houver `signup/step` |

### 6.3 Título exibido no Kanban

```31:42:src/utils/chatKanbanCardDisplay.ts
export function kanbanCardTitle(card: ChatKanbanBoardCard): string {
  const d =
    card.conv_display_name?.trim() ||
    card.op_lead_name?.trim() ||
    // ...
```

`op_lead_name` vem do JOIN em `acquisition_leads.name` (`kanbanCardEnrichmentQuery.ts`).

**Se o card mostra "Solicitante":** o valor está em **`acquisition_leads.name`** (fonte primária da UI). `chat_kanban_cards.metadata.display.name` pode estar igualmente desatualizado se o sync pós-resolve não ocorreu, mas a UI prioriza o JOIN.

---

## Parte 7 — Relação lead × card

### 7.1 Modelo de dados

```text
acquisition_leads
  id, name, email, phone, current_stage, metadata_json, ...

chat_kanban_cards
  id, acquisition_lead_id, metadata (jsonb), column_id, ...
  (sem coluna title)

Enrichment (query):
  al.name AS op_lead_name
```

### 7.2 Por que os valores divergem do esperado

| Campo | Valor esperado após credenciais | Valor observado |
|-------|--------------------------------|-----------------|
| `acquisition_leads.name` | Nome informado | Pode permanecer **"Solicitante"** se: (1) resolve não atualizou; (2) re-capture sobrescreveu; (3) usuário manteve nome pré-preenchido "Solicitante" da hidratação |
| `metadata.display.name` | Nome informado | Atualiza **somente** quando `syncAcquisitionLeadToOpsKanban` roda após UPDATE — **não garantido** no `continue_lead` |
| `op_lead_name` (UI) | Nome informado | Espelha `acquisition_leads.name` no SELECT |

**Divergência principal:** lead criado cedo com placeholder + sync imediato no Kanban; atualização de nome no resolve **não** aciona obrigatoriamente novo sync; re-capture pode reverter o nome.

---

## Parte 8 — Fluxo esperado vs real

### 8.1 Esperado (produto)

```text
Telefone → Código → (lead provisório opcional) → Nome + e-mail
    → UPDATE acquisition_leads
    → Sync card
    → Card mostra nome real (nunca "Solicitante")
```

### 8.2 Real (código atual)

```text
Telefone → Código → POST /contact/capture
    → INSERT lead name="Solicitante"
    → acquisition.lead.created → Kanban "Solicitante"

Credenciais → POST /contact/resolve (continue_lead)
    → UPDATE name (se sucesso)
    → SEM postSignupStep → SEM signup.started sync
    → navigate ?step=plan
    → useEffect força leadSubStep=credentials (latente)

Plano ↔ Credenciais (loop se Voltar)
Card: acquisition_leads.name ainda "Solicitante" se UPDATE falhou ou foi revertido
```

---

## Classificação final

| ID | Descrição | Loop wizard | Nome Kanban |
|----|-----------|-------------|-------------|
| **A** | State machine inconsistente | **Primária** | — |
| **B** | Restore / efeito indevido (URL + useEffect) | **Secundária** | — |
| **C** | Lead criado cedo demais | — | **Primária** |
| **D** | Card não sincroniza UPDATE | — | **Secundária** |
| **E** | Placeholder permanente | — | **Primária** (persistido, não só UI) |
| **F** | Outro | Re-capture sobrescreve nome (amplifica C/E) | Re-capture |

### Síntese em uma linha

O wizard **oscila** porque macro-etapa (`stepIndex`) e sub-etapa (`leadSubStep`) são hidratados de forma independente e o **Voltar** do plano reabre credenciais; o Kanban mostra **"Solicitante"** porque esse texto é **gravado no capture pós-E2** e o pipeline Ops **sincroniza cedo**, sem sync obrigatório após o resolve que deveria substituir o nome.

---

## Anexo — Mapa de arquivos

| Área | Caminho |
|------|---------|
| Wizard UI | `src/pages/AcquisitionSignupFlow.tsx` |
| Placeholder | `src/components/acquisition/onboarding/constants.ts` |
| Resume / step index | `src/lib/acquisitionSignupResume.ts` |
| Draft senha | `src/lib/acquisitionSignupCredentialDraft.ts` |
| Capture API | `packages/backend/src/acquisition/acquisitionPhoneCaptureService.ts` |
| Resolve API | `packages/backend/src/acquisition/acquisitionContactIntelligenceService.ts` |
| Repository UPDATE | `packages/backend/src/acquisition/acquisitionLeadRepository.ts` |
| Signup step orchestration | `packages/backend/src/acquisition/signupOrchestrationService.ts` |
| Outbox → Kanban | `packages/backend/src/acquisition/acquisitionOutbox.ts` |
| Sync Kanban | `packages/backend/src/services/superadminOpsKanbanLeadService.ts` |
| Título card UI | `src/utils/chatKanbanCardDisplay.ts` |
| Enrichment query | `packages/backend/src/services/kanbanCardEnrichmentQuery.ts` |

---

## Nota

Este documento é **somente investigação**. Correções sugeridas (fora do escopo) incluiriam: alinhar hidratação `leadSubStep` com `stepIndex`; atualizar URL em todo avanço; evitar persistir placeholder no capture ou re-sync após resolve; não sobrescrever nome em re-capture quando já há nome real.
