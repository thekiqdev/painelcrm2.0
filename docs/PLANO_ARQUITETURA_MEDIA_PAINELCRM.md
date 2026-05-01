# Plano técnico — Arquitetura final de mídia (PainelCRM)

**Versão:** 1.0  
**Estado:** proposta para validação — **não substitui decisões de produto nem PRs já merged.**  
**Objetivo:** padronizar armazenamento e exposição de mídia (avatar, catálogo, chat, documentos) sem quebrar o sistema atual; permitir troca futura de storage local por R2/S3.

---

## 1. Diagnóstico — pontos atuais de mídia

Legenda de **risco:** Baixo / Médio / Alto (inquérito, regressão, segurança ou dados inconsistentes).

### 1.1 Avatar e identidade visual

| Área | Arquivo(s) principal(is) | Função / fluxo | Onde salva | Onde lê | Risco atual | Recomendação |
|------|---------------------------|----------------|------------|---------|-------------|----------------|
| Avatar WhatsApp (cache CDN → disco) | `packages/backend/src/services/whatsappAvatarCacheService.ts`, `conversationAvatarPersistence.ts`, `communicationContactService.ts` | Cache remoto, replicação para CRM | `chat_conversations.*`, `clients/leads` whatsapp_* , `communication_contacts` | API chat, clientes, leads, notificações | Médio — lógica distribuída | Centralizar em serviço de mídia + metadados `storage_key` |
| Avatar conversa (API lista) | `chatController.ts` (`getConversations`), `uazapiIdentityResolve.ts` (`conversationRowForClientApi`), `uazapiChatIdentity.ts` (`resolveFinalConversationAvatarUrl`) | Merge + camadas cached/final | Colunas conversa | Frontend chat / Kanban | Baixo após URLs relativas catálogo | Manter resolver único no backend; frontend só `resolveMediaUrl` |
| Avatar cliente / lead | `clientsController.ts`, `leadsController.ts`, `searchGlobalController.ts` | COALESCE cached vs URL | Tabelas CRM | UI clientes/leads/busca | Baixo | Futuro: FK opcional para `media_assets` |
| Avatar utilizador / perfil | `meProfileController.ts`, `catalogMediaController.ts`, `catalogMediaUploadService.ts` | Upload multer → disco catálogo | `profiles` / `users`, URL retornada | `Profile.tsx`, `meProfile.ts` | Baixo — já alinhado a path relativo assinado | Indexar em `media_assets` na Fase 2+ |
| Logo tenant / empresa | `myTenantCompanyController.ts`, `CompanyDataSection.tsx`, scopes `tenant_logo_*` em `catalogMediaUploadService.ts` | Upload catálogo | JSON/colunas tenant conforme migração | Settings | Médio — dispersão por feature | Unificar scope + `media_assets` |

### 1.2 Catálogo / produtos / loja

| Área | Arquivo(s) | Função | Onde salva | Onde lê | Risco | Recomendação |
|------|------------|--------|------------|---------|-------|--------------|
| Imagens produto / vitrine | `catalogMediaController.ts`, `catalogMediaRoutes.ts`, `ProductForm.tsx`, `catalogMediaUpload.ts` (frontend) | Upload autenticado, URL pública assinada | `uploads/catalog-media/...` + refs em produtos | UI loja | Médio — URLs em várias colunas | Fase 5: ligar produto a `media_assets` |
| Leitura pública assinada | `publicCatalogMediaController.ts`, `catalogMediaPublicSignedUrl.ts` | `GET /api/public/catalog-media/raw?k=&s=` | Disco por `k` | `<img>`, PDFs | Baixo | Manter contrato; backend único emissor de path |

### 1.3 Chat — mensagens, mídia, anexos

| Área | Arquivo(s) | Função | Onde salva | Onde lê | Risco | Recomendação |
|------|------------|--------|------------|---------|-------|--------------|
| Mensagens + contrato de mídia | `chatController.ts` (`saveMessage`, `sendMessage`, sanitização) | `media[]` em metadata/contrato | `chat_messages` (+ metadata JSON) | UI Chat | Alto — mistura URL externa, base64, paths | Normalizar modelo “asset reference” gradualmente |
| Resolução de mídia outgoing | `resolveOutgoingMediaPayload`, `absolutizeOutgoingMediaUrl` (mesmo módulo) | Persistência local + URL para provider | Variável conforme fluxo | Envio WhatsApp | Alto — vários formatos | `MediaService.cacheRemoteUrl` + registo único |
| Proxy avatar CDN | `chatAvatarProxyController.ts`, `chatRoutes.ts` | Proxy para `*.whatsapp.net` | — | `chatAvatarUrl.ts` | Médio — 502 se CDN bloquear | Manter só fallback extremo |

### 1.4 WhatsApp — templates de mensagem

| Área | Arquivo(s) | Função | Onde salva | Onde lê | Risco | Recomendação |
|------|------------|--------|------------|---------|-------|--------------|
| Mídia templates WA | `whatsappTemplateMediaMulter.ts`, `whatsappTemplateMediaStorageService.ts`, `whatsappMessageTemplatesController.ts` | Disk dedicado + rotas estáticas `/media/whatsapp-templates` | Diretório próprio | Templates API | Médio — segundo “silos” de ficheiros | Fase 5: opcional migração para `media_assets` |

### 1.5 Contratos, propostas, faturas (público / PDF)

| Área | Arquivo(s) | Função | Onde salva | Onde lê | Risco | Recomendação |
|------|------------|--------|------------|---------|-------|--------------|
| Visualização pública | `publicContractViewController.ts`, `publicProposalViewController.ts`, `contractPublicViewService.ts`, `customerInvoiceService.ts` | Tokens, PDF, URLs públicas | BD + storage conforme serviço | Browser cliente final | Médio — URLs longas / assinadas | Não misturar com avatar; manter domínio “documento legal” |

### 1.6 Infraestrática partilhada

| Componente | Ficheiros | Notas |
|------------|-----------|--------|
| Multer | `catalogMediaMulter.ts`, `whatsappTemplateMediaMulter.ts` | Memory storage → buffer → disco |
| Estático Express | `index.ts` | `/media/catalog`, `/api/catalog-media/public`, `/media/whatsapp-templates` |
| Assinatura query | `catalogMediaPublicSignedUrl.ts` | `k` + `s` HMAC; **URLs relativas** preferidas na BD para avatar/catálogo recente |

---

## 2. Princípios obrigatórios (regras de ouro)

1. **Nunca persistir URL absoluta com host** em campos de negócio (exceto casos explicitamente externos e imutáveis — documentar em ADR).
2. **Nunca persistir `localhost`** ou porta fixa de dev.
3. **Nunca usar URL efémera WhatsApp (`pps.whatsapp.net`, etc.) como valor final** — apenas em `source_url` / metadados de tentativa.
4. **Preferir path relativo canónico** — ex.: `/api/public/catalog-media/raw?k=&s=` ou, no futuro, `/api/media/v1/{id}`.
5. **Falha ao cachear remoto:** preservar asset anterior (já parcialmente garantido no código de avatar).
6. **Frontend:** um helper **`resolveMediaUrl()`** (ou nome único acordado) que apenas prefixa API em dev / usa origin em prod — **sem** concatenar hosts manualmente por ecrã.
7. **Backend:** gerar sempre URLs relativas ou IDs estáveis; assinatura quando for leitura pública sem sessão.

---

## 3. Arquitetura alvo (visão)

```
                    ┌─────────────────┐
                    │   MediaService   │
                    │ (único entrada)  │
                    └────────┬────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
   Local filesystem    S3/R2 (futuro)     Metadados BD
   (storage_key)      (mesmo storage_key) media_assets + colunas legado
```

- **Hoje:** ficheiros sob `uploads/catalog-media/<tenant>/users/<uid>/<scope>/...` com `storage_key` implícito na URL assinada.
- **Amanhã:** mesmo `storage_key` num bucket; só muda o adaptador de leitura (`getPublicReadPath` / signed GET).

---

## 4. Plano faseado (implementação gradual)

### Fase 1 — Blindagem atual (**recomendada para implementar primeiro após aprovação deste doc**)

**Já parcialmente feito:** URLs de avatar cacheado como path relativo assinado; frontend normaliza URLs catálogo com host errado (`chatAvatarUrl.ts`).

**Completar na Fase 1:**

- Inventário automatizado ou script SQL de **auditoria** de colunas que ainda contenham `http://localhost`, `pps.whatsapp.net` como único valor final.
- Política única **no backend** ao gravar: função `assertPersistableMediaUrl()` rejeita/absorve absolutos proibidos.
- Documentar contrato da API: lista de campos que devolvem sempre paths relativos para catálogo.
- Frontend: garantir **`resolveMediaUrl`** único (refator incremental de `chatAvatarUrlForImgSrc` + usos de imagem de produto/perfil).

**Entrega:** checklist + PRs pequenos; sem nova tabela.

---

### Fase 2 — Tabela `media_assets`

**Migration (rascunho de colunas — ajustar tipos/nomes ao padrão do projeto):**

```sql
-- Esboço — não executar até revisão DBA
CREATE TABLE media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  owner_type text NOT NULL,  -- ex.: conversation | client | lead | user | product | tenant
  owner_id uuid,
  scope text NOT NULL,       -- alinhado a CatalogMediaScope + extensões
  storage_key text NOT NULL, -- caminho lógico único (ex.: tenants/.../users/.../scope/file)
  mime_type text,
  size_bytes bigint,
  original_filename text,
  source_url text,           -- URL remota de origem (WhatsApp, etc.) — não é “URL final”
  checksum text,
  status text NOT NULL DEFAULT 'ready', -- pending | ready | failed | deleted
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_media_assets_tenant_owner ON media_assets (tenant_id, owner_type, owner_id);
CREATE INDEX idx_media_assets_storage_key ON media_assets (storage_key);
```

**Riscos:** duplicação com ficheiros já existentes sem linha correspondente — exigir script de backfill opcional.

---

### Fase 3 — `MediaService` (backend)

API interna sugerida:

| Método | Responsabilidade |
|--------|------------------|
| `saveFromBuffer({ tenantId, userId, scope, buffer, mimeType, filename })` | Grava storage + opcionalmente linha `media_assets` |
| `cacheRemoteUrl({ url, ... })` | Download controlado + checksum + falha preserva anterior |
| `getPublicReadPath(assetId \| storageKey)` | Path relativo assinado (atual: catalog raw) |
| `getSignedReadUrl` | Alias quando precisar de URL absoluta só em response pontual (email) |
| `deleteAsset` | Soft delete + política retenção |
| `linkAssetToOwner` | Associar asset existente a novo owner (ex.: clone produto) |

---

### Fase 4 — Compatibilidade

- Manter `avatar_url`, `avatar_cached_url`, `whatsapp_avatar_*`, etc.
- API composita: `final_avatar_url` / resolver já calculado no backend; opcionalmente preencher `media_asset_id` quando existir.
- Feature flags por tenant ou global (`USE_MEDIA_ASSETS_TABLE`) para rollout.

---

### Fase 5 — Migração por módulos

Ordem sugerida (dependências crescentes):

1. Avatar WhatsApp + perfil (já próximo do catálogo).
2. Logo tenant / empresa.
3. Produtos / vitrine.
4. Anexos e mídia de mensagens de chat (maior complexidade).
5. Templates WhatsApp e documentos legais (avaliar separadamente).

---

## 5. Migrations necessárias (sumário)

| # | Descrição | Quando |
|---|-----------|--------|
| M1 | Opcional: normalizar URLs absolutas legadas em colunas de avatar (UPDATE guiado + backup) | Fase 1 |
| M2 | `CREATE TABLE media_assets` + índices + RLS se aplicável | Fase 2 |
| M3 | Colunas opcionais `media_asset_id` em `clients`, `leads`, `chat_conversations`, `products`, … | Fase 4 |
| M4 | Backfill `media_assets` a partir de ficheiros existentes em disco (job assíncrono) | Fase 4–5 |

---

## 6. Arquivos que tendencialmente serão alterados (futuro)

**Backend:** `catalogMediaUploadService.ts`, `catalogMediaPublicSignedUrl.ts`, `whatsappAvatarCacheService.ts`, `chatController.ts`, `communicationContactService.ts`, `meProfileController.ts`, `catalogMediaController.ts`, `myTenantCompanyController.ts`, `whatsappTemplateMediaStorageService.ts`, novo `services/media/MediaService.ts`.

**Frontend:** `src/lib/chatAvatarUrl.ts` → evoluir para `resolveMediaUrl.ts`, `ProductForm.tsx`, `Profile.tsx`, `CompanyDataSection.tsx`, componentes de Chat que montam URLs.

**Migrations:** `database/init/` + `supabase/migrations/` espelhados conforme convenção do repo.

---

## 7. Riscos

| Risco | Mitigação |
|-------|-----------|
| Regressão em URLs de imagens antigas | Testes E2E smoke chat + clientes; script de auditoria antes/depois |
| Duplicação de blobs ao migrar para `media_assets` | Dedupe por `checksum` + `storage_key` |
| Performance listagens com JOIN em `media_assets` | Índices; cache de resolver em lista; lazy load |
| RLS / multi-tenant | `tenant_id` obrigatório em `media_assets`; políticas alinhadas a `chat_conversations` |
| Contratos públicos / PDF | Não unificar apressadamente com avatar — equipa jurídico/ops |

---

## 8. Estratégia de rollback

1. **Fase 1:** revert PR + eventual restore BD se script de UPDATE massivo foi corrido (backup antes).
2. **Fase 2–4:** migration down apenas se não houver dependências; preferir **feature flag** que ignora `media_assets` antes de dropar tabela.
3. **Fase 5:** rollback por módulo (ex.: só produtos) desligando escrita dupla.

Manter sempre **backup de BD** e **snapshot de volume** antes de migrações de dados.

---

## 9. Primeira fase recomendada para implementar **agora** (após validação)

1. **Congelar regra:** documentar que valores persistidos de catálogo são paths relativos assinados (`/api/public/catalog-media/raw?...`).
2. **Auditoria:** query/report de colunas com `LIKE '%localhost%'` ou `'%whatsapp.net%'` em campos “finais”.
3. **Helper frontend único `resolveMediaUrl`:** encapsular `getApiUrl()` + regras catálogo + proxy CDN (substituir gradualmente chamadas dispersas).
4. **Guard no backend** ao INSERT/UPDATE de URLs em campos críticos (whitelist path ou normalização).
5. **Só depois** abrir PR da **Fase 2** (`media_assets`) com revisão de schema.

---

## 10. Critérios de aceitação (globais)

- [ ] Nenhum fluxo principal de UI depende de URL absoluta gravada na BD para catálogo/avatar.
- [ ] Troca de porta/host em dev não quebra imagens de avatar/produto.
- [ ] Falha de cache remota não apaga asset estável anterior.
- [ ] Documento deste plano revisto por equipa técnica + decisão explícita antes de `CREATE TABLE media_assets`.

---

*Documento gerado para alinhamento; atualizar versão e data após revisões.*
