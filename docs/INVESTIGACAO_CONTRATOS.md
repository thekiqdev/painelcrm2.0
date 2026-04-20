# Investigação completa — Funcionalidade de contratos

**Data da análise:** 16/04/2026 (ambiente do repositório `painelcrm`).  
**Escopo:** contratos comerciais no CRM (tabelas `contracts`, `contract_templates`, `contract_signers`, `contract_events`).  
**Excluído de escopo:** uso da palavra “contrato” em outros contextos (contrato de mensagem do chat, contrato de API de gateway, contratação de plano SaaS), salvo quando impacta links ou templates de notificação.

**Integração Perfex:** não há referências a Perfex no código pesquisado; o módulo é **nativo** deste monólito (backend Express + React).

---

## 1. Resumo executivo

O sistema já possui **uma base sólida de dados** e **API interna autenticada** para contratos e modelos, com **isolamento multi-tenant** (queries e RLS). O fluxo de negócio de **assinatura eletrônica ponta a ponta não está implementado**: não existem rotas públicas, tokens, captura de assinatura que persista `signed_at`/`signature_data`, nem distinção operacional entre **link de visualização** e **link de assinatura**.

A UI cobre **listagem**, **criação/edição** com editor rico, **assinantes** e **mudança de status** para `PENDING_SIGNATURE`, mas o “envio para assinatura” é **apenas mudança de estado + evento na timeline** — sem e-mail/WhatsApp automático nesse passo (exceto o fluxo paralelo do Chat ao **criar** rascunho).

Sobre **modelos não permanentes**: a persistência em banco **existe** (`contract_templates`). O problema percebido pelo produto provavelmente vem da **falta de interface para CRUD de modelos** (botão “Modelos” na listagem **não navega** para lugar nenhum) e de **bugs de estado** no React ao selecionar template (`handleTemplateSelect` usa `formData` potencialmente obsoleto). Não é necessário “inventar persistência”, e sim **expor o CRUD** e corrigir consistência de UI/permissões.

---

## 2. Arquitetura atual encontrada

### 2.1 Backend

- **Contratos:** `contractsController` — CRUD com `assertModulePermission` para create/edit/delete; listagem e get por **tenant** (`JOIN users.tenant_id`).
- **Modelos:** `contractTemplatesController` — CRUD com escopo **tenant** nas queries; **sem** `assertModulePermission`; qualquer usuário autenticado do tenant que satisfaça o `WHERE user_id IN (tenant)` pode alterar linhas de template de colegas (ver §7).
- **Signatários / eventos:** controllers dedicados; verificação de acesso por **`contracts.user_id = req.userId` (criador)** — **inconsistente** com o restante do módulo (ver §7 e gaps).
- **Rotas:** montadas em `/api/contracts` e `/api/contract-templates` com `tenantAuthCrm`.

### 2.2 Frontend

- Rotas `/contracts*`: **todas** protegidas por `AuthGuard` (`src/App.tsx`).
- Páginas: `Contracts.tsx`, `NewContract.tsx`, `ContractDetails.tsx`, aba em `ClientProfile.tsx`, diálogo em `Chat.tsx`.
- Serviço HTTP: `src/services/contracts.ts`.

### 2.3 Banco de dados

- Definição principal: `database/init/07_create_contracts.sql`.
- Enum de status: `database/init/02_create_enums.sql`.
- RLS: `database/init/57_rls_tenant_isolation.sql` (políticas por tenant / `user_id` do contrato).

### 2.4 Notificações / templates de mensagem

- `messageTemplatesController` declara `resource_type: 'contracts'` e ações como `sent_for_signature`, com exemplos usando `{{contract_link}}`.
- O Chat, ao criar contrato, chama `messagesService.send` com `contract_link: ${origin}/contracts/${id}` — link **interno autenticado**, inadequado como “portal do cliente”.

### 2.5 PDF / HTML

- Conteúdo é **HTML** em `content_html`, exibido no painel com `sanitizeHtml`.
- “Exportar PDF” na UI aparece como item de menu **sem implementação** (`ContractDetails.tsx`, `Contracts.tsx`).
- Não foi encontrada geração server-side de PDF do contrato (apenas menções a PDF em outros módulos: boleto, WhatsApp documento, etc.).

---

## 3. Fluxo atual ponta a ponta (sequencial)

| # | Etapa | O que acontece hoje |
|---|--------|---------------------|
| 1 | **Origem** | Usuário autenticado: menu Contratos, perfil do cliente, ou Chat (diálogo rápido). |
| 2 | **Criação** | `POST /api/contracts` grava `user_id` = criador, gera `contract_number` único **por criador**, `status` default `DRAFT` (ou conforme body). Opcionalmente `template_id`, `content_html`, `variables`, `signature_settings`. |
| 3 | **Assinantes** | `POST /api/contracts/:id/signers` (múltiplas linhas em `contract_signers`). |
| 4 | **Persistência de conteúdo** | HTML em `contracts.content_html`; modelo referenciado por `template_id` mas a UI copia o HTML do modelo para o contrato ao selecionar — funciona como **snapshot inicial** no campo do contrato (desde que o passo de seleção funcione corretamente). |
| 5 | **“Envio para assinatura”** | Em `NewContract.tsx`: `PATCH` com `status: 'PENDING_SIGNATURE'` + recria signers + `POST` evento `SENT_FOR_SIGNATURE`. **Não** gera link público, **não** envia e-mail/WhatsApp automático nesse passo. |
| 6 | **Acesso público** | **Inexistente.** Nenhuma rota frontend sem `AuthGuard` para contrato. |
| 7 | **Assinatura** | **Inexistente** no backend público. Campos `signed_at` / `signature_data` não são atualizados por código encontrado. |
| 8 | **Atualização de status por assinatura** | **Não automatizada.** Status pode ser alterado manualmente na UI (`ContractDetails` → ações / updates). |
| 9 | **Visualização posterior** | Apenas **painel autenticado** (`ContractDetails`), HTML sanitizado. |
| 10 | **Auditoria** | Tabela `contract_events` + timeline na UI; depende de chamadas explícitas (`createContractEvent`). Não há log de IP/UA para assinatura (não há assinatura). |

---

## 4. Modelos de contrato (investigação específica)

| Pergunta | Resposta |
|----------|----------|
| Já existe estrutura para modelos? | **Sim:** tabela `contract_templates` + `/api/contract-templates`. |
| São persistidos? | **Sim**, em PostgreSQL (`content_html`, `variables_schema`, `is_active`, `user_id`). |
| CRUD completo na API? | **Sim** (GET/POST/PATCH/DELETE). |
| CRUD na UI? | **Não** na prática: não há página ligada ao botão “Modelos” em `Contracts.tsx`. |
| Editor / builder? | **Reutilização** do `RichTextEditor` em `NewContract.tsx` para o **contrato**; modelos só seriam editados se uma tela chamar a API. |
| Versionamento? | **Não** (uma linha por modelo; `updated_at`). |
| Associação modelo ↔ contrato emitido? | **Sim:** `contracts.template_id` (FK `ON DELETE SET NULL`). |
| Cópia congelada no envio? | **Parcial:** o sistema confia em `content_html` gravado no contrato. Não há coluna dedicada “snapshot” nem bloqueio de edição pós-envio. |
| Risco ao editar modelo depois? | Contratos **antigos** não são atualizados automaticamente pelo modelo se `content_html` já foi copiado para o contrato. Contratos que dependessem só do modelo (sem HTML preenchido) poderiam ficar inconsistentes — hoje o fluxo copia HTML na seleção. |
| Placeholders / merge fields? | UI permite inserir `{{variavel}}` manualmente; `variables` é JSONB no contrato; **não há motor centralizado** de substituição no backend ao renderizar para terceiros. |

**Provável causa de “modelos não ficam permanentes”:**

1. **Ausência de tela** para criar/listar modelos → sensação de “não salvou”.  
2. **Bug de estado** em `handleTemplateSelect`: usa `setFormData({ ...formData, ... })` com `formData` possivelmente desatualizado (closure), podendo **não aplicar** o HTML do modelo de forma confiável.  
3. **Permissões permissivas** no template podem gerar confusão se um usuário espera modelo “da empresa” mas o registro está sob `user_id` de outro colega.

---

## 5. Link de assinatura (investigação específica)

| Aspecto | Estado atual |
|---------|----------------|
| Rota | **Não existe** rota pública de assinatura. |
| Token/slug | **Não há** colunas nem serviço de token para signers. |
| Autenticação | Assinatura implícita seria **login no painel** — inaceitável para cliente final. |
| Expiração | **Não aplicável** (sem link). |
| Único por contrato / signatário | **Não modelado.** |
| Multidomínio / SaaS | Links atuais nas notificações usam `window.location.origin` → **origem do operador**, não necessariamente domínio do tenant/cliente. |
| Reenvio | UI menciona “Reenviar convites” em `ContractDetails` **sem handler** — não reenvia nada. |
| Revogação | **Não há** conceito de revogar token. |

**Estratégia compatível com a arquitetura atual:** adicionar camada **pública mínima** (novas rotas + colunas de token com hash, ver `docs/PLANO_FECHAMENTO_CONTRATOS.md`), mantendo `/api/contracts` intacto para o painel.

---

## 6. Link de visualização (investigação específica)

| Aspecto | Estado atual |
|---------|----------------|
| Página pública | **Não.** |
| Página interna | **Sim:** `/contracts/:id` (`ContractDetails`). |
| PDF | **Stub** na UI. |
| HTML | **Sim**, sanitizado no painel. |
| Distinção view vs sign | **Não implementada.** |
| Após assinado | Mesma tela interna; sem mudança automática ligada a assinatura real. |

**Link “correto” hoje para operador:** `/contracts/{uuid}` (autenticado).  
**Link “correto” para cliente:** **ainda não definido no produto** — precisa ser rota pública com token de leitura.

---

## 7. Banco de dados e persistência (levantamento)

### 7.1 Tabelas e papéis

- **`contracts`:** documento principal; FK `client_id → clients(id)`; `responsible_id → users(id)`; `template_id → contract_templates(id)` `ON DELETE SET NULL`.  
- **`contract_templates`:** modelos por `user_id` (criador), não `tenant_id` explícito — escopo tenant é **derivado** do usuário.  
- **`contract_signers`:** partes; sem token.  
- **`contract_events`:** timeline; `metadata` JSONB.

### 7.2 Status (`contract_status`)

`DRAFT`, `PENDING_SIGNATURE`, `PARTIALLY_SIGNED`, `ACTIVE`, `INACTIVE`, `EXPIRED`, `CANCELLED`.

**Transições:** principalmente manuais ou pela UI de edição; **nenhuma** máquina de estados no servidor validando transição.

### 7.3 Inconsistências / riscos de modelagem

- **`contracts.user_id`:** significa **criador**, não “dono da empresa”; OK para auditoria, mas combinado com signers/events só por criador gera **comportamento errado em equipe**.  
- **`client_id` obrigatório vs lead:** no Chat, o código envia `client_id: currentClient?.id || currentLead?.id`; lead está em tabela **`leads`**, não `clients` — risco de **violação de FK** ou vínculo incorreto se o backend aceitar UUID inexistente em `clients`.  
- **`signature_settings`:** JSON livre (`require_otp`, `require_terms`, etc.) **sem enforcement** no servidor.  
- **Sem `tenant_id` nas tabelas de contrato:** isolamento depende de **JOIN** com `users` — funciona no app atual, mas complica políticas e relatórios; aceitável se mantido consistente.

---

## 8. Segurança e regras de negócio

| Risco | Severidade | Evidência / nota |
|-------|------------|------------------|
| Acesso de pessoa errada via link público | **N/A hoje** | Não há link público; risco futuro se tokens forem fracos ou previsíveis. |
| Usuário do tenant edita template de colega | **Médio** | `UPDATE contract_templates … AND user_id IN (tenant)` sem checagem de papel. |
| Colega vê contrato mas não gerencia signers | **Alto (UX/ops)** | Listagem por tenant vs signers/events só para `contract.user_id`. |
| Contrato alterado após “enviado” | **Médio** | `updateContract` não impede editar `content_html` em `PENDING_SIGNATURE`. |
| Assinatura reaproveitada / repudiável | **Alto (futuro)** | Sem captura de evidência (IP, UA, hash do documento). |
| Notificação com link interno | **Médio** | Cliente recebe `/contracts/id` → precisa login do **painel**, não do cliente. |
| Previsibilidade de ID | **Baixo** | UUID no path interno; sem token público ainda. |

---

## 9. UX / fluxo funcional recomendado (produção)

1. **Criar modelo** (tela dedicada) → persiste em `contract_templates`.  
2. **Editar modelo** → versionamento opcional em fase 2.  
3. **Novo contrato** → escolher modelo → snapshot em `content_html` / coluna `snapshot` dedicada.  
4. **Enviar** → congelar corpo; gerar **view_token** e **sign_token(s)**; gravar `sent_at`; opcional hash.  
5. **Notificar** → WhatsApp/e-mail com `sign_link` (e `view_link` se desejado).  
6. **Cliente abre** → página pública renderiza HTML do snapshot (sanitizado).  
7. **Assina** → grava `signature_data`, `signed_at`, evidência mínima; avança ordem; atualiza status.  
8. **Consulta** → painel mostra timeline; cliente pode ter link de leitura com token (sem editar).  
9. **Reenvio** → política explícita: mesmo token, ou novo token invalidando o anterior.  
10. **Auditoria** → eventos + metadados + logs de acesso público.

---

## 10. Respostas obrigatórias (checklist)

1. **Onde está a estrutura atual?** Backend: controllers/rotas citados no mapa; DB: `07_create_contracts.sql`; UI: páginas em `src/pages`.  
2. **O que já funciona?** CRUD interno de contratos e modelos (API), listagem por tenant, permission engine no contrato principal, editor, signers na API (com ressalvas), timeline manual, notificação opcional no **create** via Chat.  
3. **O que está incompleto?** Assinatura real, links públicos, PDF, envio automático no “PENDENTE”, reenvio, enforcement de `signature_settings`, alinhamento signers/events com tenant.  
4. **Por que modelos parecem não permanentes?** Falta de UI + possível bug de `setState` na seleção; persistência de modelo em si existe.  
5. **Como o link de assinatura seria gerado?** Hoje **não é**; proposta: token opaco por signatário (hash no BD) + rota pública `POST`/`GET` dedicada.  
6. **Como o link de visualização seria gerado?** Hoje só rota autenticada; proposta: token de leitura separado (menor privilégio que assinar).  
7. **Distinção contrato / modelo / assinatura?** Modelo = `contract_templates`; contrato = `contracts` + snapshot; assinatura = linha em `contract_signers` + evidência (ainda não preenchida).  
8. **Congelado ou modelo vivo?** Na prática **HTML no contrato** congela o conteúdo inicial; não há bloqueio formal pós-envio.  
9. **Riscos?** Inconsistência multiusuário, FK lead→client, templates sem permission, ausência de trilha forte para assinatura.  
10. **Menor caminho seguro?** (1) Corrigir controllers de signers/events + permissões de template + UI de modelos; (2) snapshot + bloqueio de edição; (3) rotas públicas mínimas com tokens; (4) notificações com novas variáveis; (5) PDF opcional.

---

## 11. Bugs prováveis / dívidas técnicas (para próxima implementação)

- `ContractDetails` / `Contracts`: itens “Enviar para assinatura”, “Reenviar”, “Exportar PDF” **sem `onClick`**.  
- `Contracts.tsx`: botão **Modelos** sem navegação.  
- `contractSignersController` / `contractEventsController`: checagem **somente criador** vs resto do módulo **tenant-wide**.  
- `contractTemplatesController`: **sem** `assertModulePermission`; updates amplos por tenant.  
- `NewContract.tsx`: `handleTemplateSelect` com possível **stale state**.  
- `Chat.tsx`: `client_id` pode receber **id de lead** incompatível com FK `clients`.  
- Variáveis `{{...}}` / `variables`: **sem renderização server-side** para documento final.

---

## 12. Conclusão

A funcionalidade está **estruturalmente iniciada** (dados + API interna + telas principais), mas **não é segura nem completa para “assinatura eletrônica” em produção**. O fechamento deve priorizar: **consistência multiusuário**, **superfície pública mínima com tokens**, **congelamento de documento**, e **UX de modelos** — sem remover o fluxo atual de rascunho e listagem, que já entrega valor operacional interno.

Para detalhamento por arquivo, ver **`docs/MAPA_TECNICO_CONTRATOS.md`**. Para etapas e rollback, ver **`docs/PLANO_FECHAMENTO_CONTRATOS.md`**.

---

## Anexo A — Referências de código (trechos ilustrativos)

### A.1 Envio para assinatura apenas altera status (frontend)

```343:400:src/pages/NewContract.tsx
  const handleSendForSignature = async () => {
    // ...
        await contractsService.updateContract(id, {
          // ...
          status: 'PENDING_SIGNATURE',
        });
        // ...
        await contractsService.createContractEvent(id, {
          event_type: 'SENT_FOR_SIGNATURE',
          description: 'Contrato enviado para assinatura',
          metadata: { signers: signers.map(s => ({ name: s.name, email: s.email })) },
        });
```

### A.2 Signers: verificação só pelo criador do contrato

```19:27:packages/backend/src/controllers/contractSignersController.ts
    const contractResult = await pool.query(
      'SELECT id FROM contracts WHERE id = $1 AND user_id = $2',
      [contractId, userId]
    );

    if (contractResult.rows.length === 0) {
      res.status(404).json({ error: 'Contract not found' });
```

### A.3 Listagem de contratos por tenant (não só criador)

```38:40:packages/backend/src/controllers/contractsController.ts
    let query = `SELECT c.* FROM contracts c
       INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1
       WHERE 1=1`;
```

### A.4 Botão “Modelos” sem ação

```192:195:src/pages/Contracts.tsx
          <Button variant="outline">
            <FileText className="mr-2 h-4 w-4" />
            Modelos
          </Button>
```

### A.5 Schema SQL resumido

```1:27:database/init/07_create_contracts.sql
CREATE TABLE IF NOT EXISTS public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  contract_number TEXT NOT NULL,
  title TEXT NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  responsible_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status public.contract_status NOT NULL DEFAULT 'DRAFT',
  // ...
  content TEXT,
  content_html TEXT,
  template_id UUID,
  variables JSONB DEFAULT '{}'::jsonb,
  // ...
  signature_settings JSONB DEFAULT '{}'::jsonb,
```

---

## Anexo B — Consultas SQL úteis (inspeção em produção / staging)

```sql
-- Contratos por status (ajustar filtros de tenant via join se necessário)
SELECT status, COUNT(*) FROM contracts GROUP BY status ORDER BY COUNT(*) DESC;

-- Modelos ativos por criador
SELECT u.email, COUNT(*) 
FROM contract_templates t 
JOIN users u ON u.id = t.user_id 
WHERE t.is_active 
GROUP BY u.email;

-- Signers pendentes com contrato pendente
SELECT c.id, c.title, c.status, s.email, s.signed_at
FROM contract_signers s
JOIN contracts c ON c.id = s.contract_id
WHERE c.status = 'PENDING_SIGNATURE' AND s.signed_at IS NULL
LIMIT 50;
```
