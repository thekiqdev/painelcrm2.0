# Plano de execução — Fase 2: mídia (produto e loja), galeria pública e base de temas

**Origem:** `docs/app/PLANO_EVOLUCAO_CATALOGO_ADMIN_LOJA_PUBLICA.md` (Fase 2), `docs/app/EXECUCAO_FASE_1_ADMIN_E_PAGINA_DA_LOJA.md` (pré-requisitos admin), `docs/app/PLANO_EVOLUCAO_MODULO_CATALOGO.md`, `docs/app/EXECUCAO_V2_1_SEGURANCA_PUBLICA_E_PERMISSOES.md` (DTO público).  
**Escopo deste documento:** planejamento de sprint — **sem implementação**, **sem alteração de código**, **sem patch**, **sem provisionamento real de storage/CDN** neste artefato (apenas decisões e desenho técnico para execução futura).  
**Convenção:** **(Fato)** = observado no repositório; **(Recomendação)** = decisão proposta para a fase.

**Pré-requisito:** Fase 1 concluída (tabela em `src/pages/Products.tsx`, página `src/pages/StoreSettings.tsx` em `/admin/loja`, categorias leves em `ProductForm.tsx`).

---

# 1. Objetivo da Fase 2

## O que essa fase resolve **(Recomendação)**

- Entregar **pipeline real de upload** (desenho + contratos + integração com objeto público) para **imagens de produto** e **identidade da loja** (logo; banner quando modelado).
- Tornar a **mídia operacional** no admin (`ProductForm.tsx`, `StoreSettings.tsx` / `StoreSettingsForm.tsx`) e **visível na vitrine** com escopo **mínimo e seguro** (`PublicStore.tsx`, `PublicProduct.tsx`).
- Estabelecer **base arquitetural de temas/templates**: seleção persistida, separação dados vs apresentação, caminho claro para incorporar layouts gerados na **Lovable** como **código versionado**, sem execução de código remoto arbitrário.

## Por que vem depois da Fase 1 **(Fato + Recomendação)**

- **(Fato)** A Fase 1 consolidou fluxos admin (lista, loja em página dedicada) sem tocar em storage nem em contratos de arquivo.
- **(Recomendação)** Upload e tema exigem decisões de **infra**, **segurança** e **modelo de dados**; fazê-las após a UX admin estável reduz retrabalho e superfície de regressão.

## Por que vem antes de checkout / carrinho público **(Recomendação)**

- Carrinho e checkout dependem de confiança em **preço e imagem** exibidos; vitrine sem mídia real atrasa validação de jornada e de cache/CDN.
- **(Fato)** O plano macro já posiciona checkout/pagamento como fase de alto risco **depois** da vitrine evoluída (`PLANO_EVOLUCAO_MODULO_CATALOGO.md`).

## Ganhos para admin e vitrine **(Recomendação)**

- **Admin:** cadastro completo de galeria com URLs estáveis; logo da loja editável; banner quando disponível; escolha de tema “default” vs futuros pacotes.
- **Vitrine:** thumbnails/lista com imagem principal; página de produto com hero + galeria; cabeçalho da loja com logo/banner; preparação para trocar **apenas** camada visual sem reescrever APIs públicas.

---

# 2. Escopo exato da Fase 2

## 2.1 Entra nesta fase **(Recomendação)**

- **Pipeline de upload de mídia** (API + validação + armazenamento objeto + URL pública ou assinada conforme política).
- **Produto:** `images` como **lista ordenada** de URLs; **`images[0]` = imagem principal**; galeria adicional = demais itens do mesmo array.
- **Loja:** uso operacional de **`store_logo`** (coluna já existente); **banner** conforme decisão de modelagem (ver §4 — migration provável).
- **Vitrine:** exibição **mínima** de mídia em `PublicStore.tsx` (ex.: logo, banner opcional, thumb por produto) e `PublicProduct.tsx` (hero + galeria).
- **Temas:** arquitetura de **seleção** (`theme_key` ou equivalente), **config leve** (`theme_options` JSON opcional), **um tema default** no código; registro de temas **no build** (mapa estático).
- **Lovable:** planejamento de **importação como pacote/pasta** em `src/themes/...` com interface comum; **sem** carregar JS/CSS remoto não revisado.

## 2.2 Não entra nesta fase **(Recomendação explícita)**

- Checkout online, carrinho público, pagamento.
- Domínio por tenant / multi-host / DNS.
- **Múltiplos temas completos** já prontos em produção (apenas **base + default**).
- Refatoração ampla do modelo de catálogo (variantes, novo aggregate).
- Taxonomia completa de categorias (tabelas novas).
- Chat/WhatsApp, picker de produto em canal.
- **Integração real com provedor** (keys, bucket, CORS) **neste documento** — apenas o **plano** e critérios; provisionamento na sprint de implementação.

---

# 3. Diagnóstico técnico focado na Fase 2

## 3.1 `images` e `secondary_images` **(Fato)**

- **Schema:** `public.products.images` e `public.products.secondary_images` como **JSONB** default `'[]'`, em `database/init/06_create_products.sql`.
- **Backend:** `productsController.ts` — `productSchema` aceita `images` e `secondary_images` como arrays; create/update serializa com `JSON.stringify`; **DTO público V2-1** (`PUBLIC_PRODUCT_SELECT` / `toPublicProductDto`) inclui **ambos** os campos na resposta pública.
- **Tipos front:** `Product`, `PublicCatalogProduct` e `ProductFormData` em `src/types/products.ts` incluem `images: string[]` e `secondary_images?: string[]`.

## 3.2 `store_logo` **(Fato)**

- **Schema:** `store_profiles.store_logo TEXT` em `06_create_products.sql`.
- **Backend:** `storeProfileSchema` em `packages/backend/src/controllers/storeProfileController.ts` já aceita `store_logo: z.string().optional()` em create/update.
- **Público:** `getPublicStoreBySlug` e `getPublicStoreProfile` fazem `SELECT *` — **retornam** `store_logo` se preenchido.
- **Admin:** `StoreProfile` em `src/types/products.ts` tem `store_logo?: string`, mas **`StoreSettingsForm.tsx` não expõe** o campo no estado nem no submit (apenas nome, slug, descrição, contatos, `is_active`).

## 3.3 Banner e tema **(Fato)**

- **Banner:** **não existe** coluna dedicada em `store_profiles` no init observado.
- **Tema:** **não existe** coluna `theme_key` / `theme_config` no schema atual; vitrine não lê tema.

## 3.4 `ProductForm.tsx` **(Fato)**

- Estado inicial e load incluem `images` e `secondary_images`.
- Seção “Imagens” (~L686–722): UI de drag-and-drop e botões **sem** `input type="file"` funcional; comentário de UX diz que a primeira imagem seria principal — **não há** lógica de upload.
- Variações: TODO explícito de upload de textura (~L853+).

## 3.5 Página `/admin/loja` **(Fato)**

- `src/pages/StoreSettings.tsx`: card “Dados da loja” com `StoreSettingsForm`; cards tracejados **“Identidade visual”** e **“Tema e layout”** apenas como texto placeholder (Fase 1).

## 3.6 Vitrine pública **(Fato)**

- `PublicStore.tsx` e `PublicProduct.tsx`: **não** contêm `<img>` nem uso de `product.images` / `storeProfile.store_logo` no markup (grep sem matches).
- Dados públicos já trazem `images` e `secondary_images` no DTO — **gap só de UI**.

## 3.7 Suporte visual/tema **(Fato)**

- Vitrine usa tokens globais da app (shadcn); **sem** registry de tema nem `theme` em perfil.

## 3.8 Pipeline de upload **(Fato)**

- Não há módulo dedicado tipo multer/S3/presign nos trechos habituais de `packages/backend/src` mapeados nos planos anteriores; **nenhum endpoint de upload de catálogo** documentado no fluxo atual.

## 3.9 Limitações reais **(Síntese Fato + Recomendação)**

- Duplicidade conceitual **`images` vs `secondary_images`** no modelo legado — Fase 2 deve **simplificar o uso** (ver §4).
- Banner e tema **quase certamente** exigem **migration** para persistência limpa (ver §4.7).

---

# 4. Decisões técnicas da Fase 2 **(Recomendação)**

## 4.1 Estratégia de upload

- **Preferência:** **URLs assinadas (presigned PUT)** ou POST multipart para storage **S3-compatível** (R2, MinIO, etc.): cliente sobe arquivo direto ou via backend único “gatekeeper”.
- **Alternativa de menor infra inicial:** upload **multipart apenas no backend** com limite de tamanho e streaming para bucket — mais carga no app, aceitável em MVP controlado.
- **Autorização:** apenas usuários com **`tenantAuthCrm`** e permissão de módulo adequada (`products` + eventual `edit` ou política específica “upload_asset” a definir na implementação).

## 4.2 Persistência das URLs

- Salvar **somente HTTPS URL estável** (pública ou com path previsível) em:
  - `products.images` (JSON array ordenado);
  - `store_profiles.store_logo`;
  - campo de banner (após migration).
- **Não** armazenar binário em Postgres na Fase 2.

## 4.3 Imagem principal e galeria

- **Fonte única de verdade:** array **`images`** ordenado; **`images[0]` = principal**.
- **Galeria na UI:** itens `images.slice(1)` ou carrossel sobre o array completo com destaque no `[0]`.

## 4.4 `secondary_images` **(Recomendação: tratar como legado)**

- **Não ampliar** uso no admin na Fase 2.
- **Leitura:** na vitrine e no admin, se `secondary_images` tiver itens e o produto legado não migrou, **exibir** como extensão da galeria **após** `images` (ordem: principal + `images[1:]` + `secondary_images`), **ou** script de migração one-shot (fora do escopo mínimo) que concatena em `images` e zera `secondary_images`.
- **Escrita:** novos uploads gravam **apenas** em `images` (menor complexidade).

## 4.5 Logo da loja

- **Persistência:** `store_logo` (já existe).
- **UI:** upload na página `/admin/loja` + preview; PATCH perfil com URL retornada pelo pipeline.
- **Público:** `PublicStore` / `PublicProduct` header com `<img src={store_logo}>` + `alt` no nome da loja; fallback se vazio.

## 4.6 Banner da loja

- **(Fato)** Coluna inexistente hoje.
- **(Recomendação)** Adicionar **`store_banner_url TEXT NULL`** (ou nome equivalente) em `store_profiles` via **migration na sprint de implementação da Fase 2** (ou fase 2b se quiser separar logo primeiro).
- **Alternativa sem migration (não preferida):** reutilizar `store_description` ou JSON ad-hoc — **rejeitada** por risco de semântica suja e dificuldade de DTO público.

## 4.7 Base de tema/template

- **Persistência (Recomendação):** migration com **`theme_key TEXT NOT NULL DEFAULT 'default'`** e **`theme_options JSONB DEFAULT '{}'::jsonb`** em `store_profiles` (nomes ajustáveis).
- **Front público:** `ThemeRegistry` em código: `Record<string, LazyExoticComponent<PublicStoreLayoutProps>>` ou mapa estático `import`.
- **Seleção no admin:** `Select` com opções **conhecidas no build** (`default`, placeholders para `lovable-import-1` após code review).
- **Separação:** **Dados** = APIs existentes (`PublicCatalogProduct`, perfil público); **Apresentação** = componente de layout do tema recebe **props puras** (sem fetch interno obrigatório).

## 4.8 Integração Lovable **(Recomendação)**

- Fluxo: export do Lovable → PR no monorepo em `src/themes/<slug>/` implementando interface **`StorefrontTheme`** (nome ilustrativo) → registro no `ThemeRegistry` → `theme_key` aponta para `<slug>`.
- **Proibido na Fase 2:** carregar bundle remoto por URL configurável pelo tenant sem auditoria.

## 4.9 O que exige migration **(Recomendação)**

- **Banner** e **campos de tema** (`theme_key`, `theme_options`): **sim**, migration explícita.
- **Upload / URLs em colunas existentes** (`images`, `store_logo`): **não** exige mudança de schema além do pipeline.

## 4.10 O que pode ser feito sem migration **(Recomendação)**

- Pipeline de upload + uso pleno de `images` + `store_logo` + exibição na vitrine.
- Tema **só no front** com hardcode `default` (sem persistência por tenant) — **insuficiente** para objetivo “seleção persiste”; por isso migration de tema é recomendada na mesma fase ou imediatamente após MVP de upload.

---

# 5. Plano técnico por tema

## 5.1 Upload de imagens de produto

| Aspecto | Conteúdo |
|--------|-----------|
| **Estado atual (Fato)** | Arrays persistidos; UI sem upload; sem endpoint de arquivo. |
| **Gaps** | Storage, autorização, limites, CORS, retorno de URL, reconciliação com `PATCH /api/products/:id`. |
| **Fluxo (Recomendação)** | 1) Cliente solicita permissão (nome, tipo, tamanho). 2) Servidor valida quota/tenant e retorna URL de upload ou recebe multipart. 3) Cliente envia arquivo. 4) Servidor ou storage confirma; cliente recebe URL final. 5) Cliente atualiza estado local e salva produto com novo array `images`. |
| **Validações** | MIME (jpeg/png/webp), tamanho máx (ex.: 5 MB), dimensão máx opcional, número máx de arquivos por produto. |
| **Persistência** | `images` JSONB ordenado; opcional job de thumb futuro. |
| **Impacto** | Novo controller/rota upload; env vars; `ProductForm.tsx`; possível serviço `src/services/mediaUpload.ts`. |

## 5.2 Logo e banner da loja

| Aspecto | Conteúdo |
|--------|-----------|
| **Estado atual (Fato)** | `store_logo` no DB e Zod; UI admin não edita; público já poderia receber o campo. |
| **Gaps** | Upload; preview; banner column + Zod + `StoreSettingsForm` + DTO se necessário. |
| **Proposta** | Mesmo pipeline de upload com “escopo” `store_logo` / `store_banner`; PATCH `store-profile`. |
| **Dependências** | Migration para banner; feature flag opcional para esconder banner até migration aplicada. |
| **Impacto** | `storeProfileController.ts`, `StoreSettingsForm.tsx`, `StoreSettings.tsx`, tipos TS, vitrine. |

## 5.3 Galeria pública

| Aspecto | Conteúdo |
|--------|-----------|
| **Estado atual (Fato)** | DTO com `images` / `secondary_images`; UI não renderiza. |
| **Proposta mínima** | `PublicProduct`: hero `images[0]` + miniaturas / carrossel; `PublicStore`: thumb por card se existir URL. |
| **Onde** | `PublicProduct.tsx`, `PublicStore.tsx`; componente opcional `ProductMediaGallery.tsx`. |
| **Impacto** | Somente front público + possível ajuste de CSS; cuidado com CLS (dimensões ou aspect-ratio). |

## 5.4 Temas/templates

| Aspecto | Conteúdo |
|--------|-----------|
| **Estado atual (Fato)** | Nenhum. |
| **Arquitetura** | Registry + wrapper em rotas públicas `/:storeSlug/loja` que resolve `theme_key` do perfil (ou default) e renderiza `Layout` do tema com `children` ou slots. |
| **Seleção** | Admin em `/admin/loja`; persistir `theme_key` (+ JSON opcional). |
| **Isolamento** | Temas recebem apenas props tipadas (produtos, perfil, children). |
| **Lovable** | Código gerado vira PR; não runtime download. |

## 5.5 Compatibilidade com o estado atual

| | |
|--|--|
| **Continua** | Rotas públicas V2-1; DTO público; `secondary_images` no contrato até deprecação documentada. |
| **Muda** | Admin passa a produzir URLs reais; vitrine passa a consumir mídia. |
| **Convivência** | Produtos sem `images` válidas: placeholder; legado com dados só em `secondary_images`: regra de merge (§4.4). |

---

# 6. Plano de execução em passos

## Passo 1 — definir base de mídia

| | |
|--|--|
| **Arquivos afetados** | Novo: `packages/backend/src/...` módulo upload (nome a definir); `packages/backend/src/index.ts` (mount); `.env` / `env.example`; documentação interna |
| **Ações** | Escolher provedor; definir prefixo de chave `tenantId/userId`; contrato de resposta (URL, key); limites; política pública vs assinada para **leitura vitrine** |
| **Dependências** | Conta storage, CORS, TLS |
| **Risco** | Médio (config infra) |

## Passo 2 — planejar upload de produto

| | |
|--|--|
| **Arquivos afetados** | `ProductForm.tsx`, `productsService` / novo `mediaService`, `productsController.ts` (se validação server-side de URLs) |
| **Ações** | UI file picker; fila de upload; ordenação drag-and-drop; remoção de item; salvar com `images` ordenado; não expandir `secondary_images` |
| **Dependências** | Passo 1 |
| **Risco** | Médio (UX + erros de rede) |

## Passo 3 — planejar mídia da loja (logo/banner)

| | |
|--|--|
| **Arquivos afetados** | Migration SQL nova; `storeProfileController.ts`; `StoreSettingsForm.tsx`; `src/types/products.ts`; opcional endurecer DTO público para banner |
| **Ações** | Migration banner + tema; estender Zod; campos logo/banner com upload; preview |
| **Dependências** | Passo 1 |
| **Risco** | Médio–Alto se migration em produção sem janela |

## Passo 4 — planejar exibição pública mínima

| | |
|--|--|
| **Arquivos afetados** | `PublicStore.tsx`, `PublicProduct.tsx`; opcional componentes em `src/components/storefront/` |
| **Ações** | Logo/banner header; thumb lista; hero + galeria detalhe; fallbacks; **não** refatorar layout completo |
| **Dependências** | URLs válidas (Passo 2–3) |
| **Risco** | Baixo |

## Passo 5 — planejar base de temas/templates

| | |
|--|--|
| **Arquivos afetados** | Migration tema; `StoreSettings.tsx`; registry `src/themes/`; wrapper rota em `App.tsx` ou dentro de `PublicStore` |
| **Ações** | Tema `default` extrai markup atual; segundo tema opcional stub; seleção persiste; Lovable documentado como processo de PR |
| **Dependências** | Passo 3 (campos persistidos) |
| **Risco** | Médio (abstração prematura — mitigar com um único layout default real) |

## Passo 6 — validação, rollout e dependências Fase 3

| | |
|--|--|
| **Arquivos afetados** | Testes contrato DTO público (imagens não vazam dados internos — já V2-1); E2E manual checklist |
| **Ações** | Staging com bucket; smoke vitrine; monitor4xx upload; plano de rollback feature flag |
| **Dependências** | Infra estável |
| **Risco** | Operacional |

---

# 7. Arquivos impactados (expectativa na implementação futura)

## Frontend

| Arquivo | Motivo | Mudança esperada |
|---------|--------|------------------|
| `src/pages/ProductForm.tsx` | Upload + ordenação galeria | Alteração significativa |
| `src/components/products/StoreSettingsForm.tsx` | Logo, banner, tema | Alteração |
| `src/pages/StoreSettings.tsx` | Evoluir placeholders | Alteração |
| `src/pages/PublicStore.tsx` | Mídia + possível wrapper tema | Alteração |
| `src/pages/PublicProduct.tsx` | Galeria | Alteração |
| `src/types/products.ts` | `theme_key`, `store_banner_url?` | Extensão |
| `src/services/products.ts` ou novo `media.ts` | Chamadas upload | Novo/alterado |
| `src/themes/...` | Registry tema | Novo |
| `src/App.tsx` | Opcional wrapper vitrine | Pequena |

## Backend

| Arquivo | Motivo | Mudança esperada |
|---------|--------|------------------|
| Novo: upload controller/service | Presign ou multipart | Novo |
| `packages/backend/src/index.ts` | Rota upload | Alteração |
| `storeProfileController.ts` | banner, tema, validação | Alteração |
| `productsController.ts` | Opcional validar URLs | Pequena |
| `storeProfileRoutes.ts` | — | Improvável |

## Banco / modelagem

| Artefato | Motivo |
|----------|--------|
| Nova migration | `store_banner_url`, `theme_key`, `theme_options` (nomes finais a definir) |

## Infra / storage

| Item | Motivo |
|------|--------|
| Bucket S3-compatível, CORS, credenciais | Upload real |
| Opcional CDN na frente do bucket | Performance vitrine |

## Testes

| Item | Motivo |
|------|--------|
| Testes upload (contrato, 413, tipo inválido) | Backend |
| Testes manuais vitrine | Front |
| Garantir DTO público sem campos novos sensíveis | Regressão V2-1 |

---

# 8. UX mínima proposta

## 8.1 ProductForm

- Área **“Imagem principal”** explícita (primeiro slot ou label sobre `images[0]`).
- **Galeria:** lista vertical ou grid com drag para reordenar, botão remover, botão adicionar (até N máx).
- **Estados:** progresso por arquivo, erro por arquivo, bloqueio de salvar opcional até uploads concluírem.

## 8.2 Página `/admin/loja`

- Card **Identidade visual** real: upload logo, preview, remover; upload banner (pós-migration), preview, remover.
- Card **Tema:** select com opções do build; texto de ajuda “Novos layouts entram via atualização do sistema”.
- Placeholders da Fase 1 **substituídos** por esses blocos.

## 8.3 Vitrine pública

- **PublicStore:** faixa superior com logo + nome; opcional banner full-width abaixo; cards com thumb16:9 ou quadrado.
- **PublicProduct:** coluna mídia com imagem grande + thumbs clicáveis; zoom/lightbox opcional na mesma sprint se esforço baixo.

---

# 9. Compatibilidade e deprecação

- **Rotas e APIs V2-1** permanecem; campos públicos de mídia já existentes **expandem uso**, não removem contrato.
- **`secondary_images`:** modo legado somente leitura / merge de exibição; documentar deprecação em comentário ou ADR curto.
- **Produtos sem imagem:** placeholder genérico (ícone ou cinza).
- **Lojas sem logo/banner:** apenas tipografia atual.
- **Produção:** migrations aditivas nullable ou com default; feature flag para upload se necessário.

---

# 10. Testes da fase

## 10.1 Frontend

- Upload aparece; ordem reflete `images`; remoção atualiza estado; salvamento persiste.
- Logo/banner na loja; preview correto; remoção limpa URL (null).
- Vitrine renderiza sem quebrar se URL inválida (onError → fallback).
- Troca de tema altera layout **mínimo** esperado (ex.: cor de destaque via `theme_options`).

## 10.2 Backend

- Tipos MIME rejeitados; tamanho excedido; URL devolvida pertence ao tenant.
- PATCH perfil aceita `store_logo` / banner / `theme_key` após migration.
- Não vazar paths internos sensíveis em erro público.

## 10.3 Manuais

- Produto 0 imagens; 1 imagem; 5+ imagens.
- Loja só logo; logo + banner; sem mídia.
- Produto legado só `secondary_images`.
- Tema default vs segundo tema stub.
- Conexão lenta / falha no meio do upload.

---

# 11. Rollout e mitigação

- **Feature flag (Recomendação):** `catalog_media_upload` e opcional `storefront_banner` pós-migration.
- **Parcial:** liberar upload produto antes de banner se migration atrasar.
- **Staging:** bucket isolado; checar CORS do front.
- **Reverter:** desligar flag; código antigo ignora campos novos se nullable.
- **Migration:** ordem = adicionar colunas → deploy backend → deploy front; rollback de código sem remover colunas.

---

# 12. Critérios de aceite **(Recomendação)**

- [ ] Existe desenho **implementável** de pipeline de upload (endpoints, auth, limites) alinhado ao repositório atual.
- [ ] **ProductForm** passa a suportar upload real para **`images`** ordenado com **`images[0]`** como principal; **`secondary_images`** não ganha fluxo novo obrigatório.
- [ ] **Logo** operacional via **`store_logo`**; **banner** com decisão de migration documentada e caminho de implementação.
- [ ] **PublicStore** e **PublicProduct** exibem mídia mínima com fallbacks.
- [ ] **Tema:** `theme_key` (ou equivalente) persistido, **registry** no código, **sem** código remoto arbitrário; **Lovable** previsto via import versionado.
- [ ] Compatibilidade com tenants/produtos existentes sem mídia garantida.
- [ ] Checkout/carrinho/pagamento **fora** do escopo confirmado.

---

# 13. Pendências para Fase 3+

- Carrinho público e checkout; pagamento; idempotência de pedido.
- Domínio por tenant; SEO avançado; OG tags com SSR/prerender.
- Expansão para **vários temas** completos e marketplace interno de layouts.
- Geração automática de thumbs; CDN dedicada; política de purge.
- Migração em massa `secondary_images` → `images` (job administrativo).

---

*Documento de planejamento da Fase 2. Atualizar após escolha do provedor de objeto e nomes finais das colunas de migration.*
