# Plano de execução — Fase 1: admin em tabela, página `/admin/loja` e categorias leves

**Origem:** `docs/app/PLANO_EVOLUCAO_CATALOGO_ADMIN_LOJA_PUBLICA.md` (Fase 1), alinhado a `docs/app/PLANO_EVOLUCAO_MODULO_CATALOGO.md` e baseline `docs/app/EXECUCAO_V2_1_SEGURANCA_PUBLICA_E_PERMISSOES.md`.  
**Escopo deste documento:** planejamento de sprint — **sem implementação**, **sem alteração de código**, **sem migrations**, **sem patch**.  
**Convenção:** **(Fato)** = observado no repositório; **(Recomendação)** = decisão proposta para a fase.

---

# 1. Objetivo da Fase 1

## O que essa fase resolve **(Recomendação)**

- Coloca o **catálogo interno** em formato **operacional** (tabela/lista densa) em vez de grid de cards, com **filtros básicos** e **ações por linha** claras.
- Centraliza a **configuração da loja** em uma **página dedicada** (`/admin/loja`), eliminando o fluxo principal baseado em **popup**.
- Introduz **categorias em modo leve**: continua `products.category` como texto, com **sugestões/autocomplete** baseadas em valores já usados no tenant — **sem** nova tabela e **sem** migration estrutural.

## Por que vem antes de mídia, tema e checkout **(Fato + Recomendação)**

- **(Fato)** V2-1 já endureceu o público e a permissão `view`; a Fase 1 melhora **produtividade do admin** sem tocar em storage, pagamento ou vitrine pública.
- **(Recomendação)** Ordem de risco: UX admin e organização de dados **antes** de investir em upload, temas e carrinho anônimo — reduz retrabalho na página da loja quando logo/banner entrarem na Fase 2.

## Ganhos operacionais imediatos **(Recomendação)**

- Leitura rápida de muitos itens (colunas alinhadas, menos scroll que cards).
- Configuração da loja com **mais contexto visual** (página completa) e link estável para favoritos/documentação interna.
- Menos digitação errada de categoria e **consistência** leve entre produtos do mesmo tenant.

---

# 2. Escopo exato da Fase 1

## 2.1 Entra nesta fase **(Recomendação)**

- Substituir o **padrão principal** de listagem em `Products.tsx` de **grid de cards** por **tabela** (componentes estilo shadcn `Table`).
- **Filtros mínimos** na listagem (ver §4 e §7.2) — **(Recomendação)** implementação **preferencialmente client-side** sobre a lista já retornada por `getProducts()`, para não exigir mudança de contrato da API na Fase 1 (alternativa com query params documentada como opcional em §5).
- **Ações por linha:** editar (rota existente), excluir (fluxo existente), **(Recomendação)** link/ação **“Abrir vitrine”** quando `store_slug` + `is_public` + `status === 'active'` (abre `/${slug}/loja` em nova aba; se loja inativa ou sem slug, desabilitar ou ocultar).
- Criar rota **`/admin/loja`** com página de configuração da loja (equivalente funcional ao conteúdo atual do dialog).
- **Remover o popup como fluxo principal** (“Configurar Loja” deixa de abrir dialog; substituir por navegação para `/admin/loja`).
- **Card “Sua Loja Virtual”** em `Products.tsx`: **(Recomendação)** reduzir a um **bloco compacto** ou banner com link **“Gerenciar loja”** → `/admin/loja` e atalho “Visualizar loja” (comportamento já existente).
- **Categorias leves:** manter coluna `category` textual **(Fato)**; em `ProductForm.tsx`, **(Recomendação)** campo com **autocomplete** (sugestões = valores `distinct` normalizados derivados dos produtos do tenant — ver §4.7).
- **Navegação admin:** adicionar entrada no menu lateral para **“Loja”** ou subitem sob catálogo apontando para `/admin/loja` **(Recomendação)**; estender `pathToModule` para `/admin/loja` → módulo `products` (ver §4.8).
- Botão **“Adicionar produto”** permanece em `/admin/products/new` (rota **(Fato)** `App.tsx`).

## 2.2 Não entra nesta fase **(Recomendação explícita)**

- Upload real de imagens (produto ou loja).
- Logo/banner **funcional** (URLs editáveis com upload/preview completo); **(Recomendação)** apenas **espaço reservado** na página `/admin/loja` se desejado (copy “em breve”).
- Tema/template, galeria pública, refatoração ampla de `PublicStore` / `PublicProduct`.
- Checkout online, carrinho público, alteração de `cartRoutes` / sessão anônima.
- Tabela nova de categorias, `category_id`, migrations estruturais.
- Domínio por tenant, multi-host, redirects canônicos.
- Paginação server-side **obrigatória** (pode ficar como pendência se lista crescer — ver §12).

---

# 3. Diagnóstico técnico focado só na Fase 1

## 3.1 `Products.tsx` **(Fato)**

- Carrega `productsService.getProducts()` e `getStoreProfile()` em paralelo (`useEffect`).
- Listagem: `grid` de `Card` por produto; badges tipo/status; preço; categoria; botões Editar (`/admin/products/:id/edit`) e Excluir (`deleteProduct`).
- Topo: título, botões **“Configurar Loja”** (abre dialog) e **“Adicionar Produto”**.
- Card resumo da loja com link `origin/${store_slug}/loja`.
- Componente **`StoreConfigDialog`** montado no final com `open` controlado por estado local.

## 3.2 Configuração da loja hoje **(Fato)**

- **`StoreConfigDialog.tsx`:** `Dialog` (`max-w-md`), formulário: `store_name`, `store_slug`, `store_description`, `contact_phone`, `contact_whatsapp`, `contact_email`, `is_active`; submit chama `createStoreProfile` ou `updateStoreProfile` em `src/services/products.ts`.
- **API:** `GET /api/store-profile`, `POST /api/store-profile`, `PATCH /api/store-profile` (`packages/backend/src/routes/storeProfileRoutes.ts` + `storeProfileController.ts`), todas atrás de `tenantAuthCrm`.
- **Schema backend:** Zod inclui `store_logo` opcional; **formulário do dialog não exibe** `store_logo`.

## 3.3 Navegação / menu **(Fato)**

- **`AppLayout.tsx`:** um único `NavLink` “Produtos” para **`/products`** (legado), com feature flag `products`.
- **`App.tsx`:** rotas canônicas admin em **`/admin/products`**, **`/admin/products/new`**, **`/admin/products/:id/edit`**; rotas legadas `/products`, `/products/new`, `/products/edit/:id` renderizam os mesmos componentes.
- **`RequireModuleView.tsx`:** `pathToModule` mapeia `/admin/products` e `/products` para `products`; **`/admin/loja` ainda não existe** — precisará de entrada nova na Fase 1 **(Recomendação)**.

## 3.4 API `store profile` e produtos **(Fato)**

- Produtos: `getProducts` em `productsController.ts` — `SELECT p.*`, join tenant, `ORDER BY created_at DESC`, permissão **`view`**; **sem** filtros/paginação na query.
- Store profile: leitura por `user_id` do usuário autenticado; create/update com validação Zod.

## 3.5 Campo `category` **(Fato)**

- Coluna **`products.category`** `TEXT` (`database/init/06_create_products.sql`).
- **`ProductForm.tsx`:** `Input` texto livre para categoria.

## 3.6 Limitações que impactam a Fase 1 **(Fato)**

- Lista completa no cliente: filtros client-side escalam até certo ponto; tenants com catálogo muito grande podem precisar de paginação/filtro server-side **fora** do escopo mínimo desta fase.
- Sidebar aponta para `/products` enquanto rotas admin preferenciais são `/admin/products` — inconsistência de URL **(Fato)** a corrigir na Fase 1 **(Recomendação)** junto com item “Loja”.

## 3.7 Arquivos e serviços exatos **(Fato)**

| Área | Referência |
|------|------------|
| Listagem admin | `src/pages/Products.tsx` |
| Form produto | `src/pages/ProductForm.tsx` |
| Dialog loja | `src/components/products/StoreConfigDialog.tsx` |
| Serviço HTTP | `src/services/products.ts` (`getProducts`, `getStoreProfile`, `createStoreProfile`, `updateStoreProfile`) |
| Rotas SPA | `src/App.tsx` |
| Layout / nav | `src/layouts/AppLayout.tsx` |
| Gate módulo | `src/components/RequireModuleView.tsx` |
| API produtos | `packages/backend/src/routes/productsRoutes.ts`, `productsController.ts` |
| API loja | `packages/backend/src/routes/storeProfileRoutes.ts`, `storeProfileController.ts` |

---

# 4. Decisões técnicas da Fase 1 **(Recomendação)**

## 4.1 Listagem admin

- **Formato:** uma **tabela** com cabeçalhos fixos, linhas zebradas opcionais, responsividade mínima (scroll horizontal em telas pequenas).
- **Ordenação:** manter ordem **igual à API** (`created_at DESC`) na Fase 1; ordenação clicável por coluna **fora** do mínimo (pode entrar como melhoria se sobrar capacidade).

## 4.2 Colunas mínimas

| Coluna | Conteúdo |
|--------|-----------|
| Nome | `product.name` (truncar com tooltip se longo) |
| Tipo | Badge produto/serviço |
| Status | `active` / `inactive` / `draft` |
| Preço | Preço principal exibido **(Recomendação)** `discount_price` se preenchido e menor que `price`, senão `price`; prefixo “R$” alinhado ao padrão atual |
| Categoria | `category` ou “—” |
| Público | Sim/Não a partir de `is_public` |
| Ações | Ícones ou botões: Editar, Excluir, Abrir vitrine (condicional) |

## 4.3 Filtros mínimos

- **Busca por nome:** substring case-insensitive no cliente.
- **Tipo:** todos / produto / serviço.
- **Status:** todos / ativo / inativo / rascunho.
- **Categoria:** todos + lista de categorias distintas derivadas dos produtos carregados + opção **“Sem categoria”** (`!category || !String(category).trim()`).

## 4.4 Ações por linha

- **Editar:** `navigate(\`/admin/products/${id}/edit\`)`.
- **Excluir:** mesmo `confirm` + `deleteProduct` de hoje.
- **Abrir vitrine:** `window.open(\`${origin}/${store_slug}/loja\`)` se `storeProfile?.store_slug` e produto adequado; **(Recomendação)** desabilitar se `!is_public` ou `status !== 'active'` ou loja `!is_active`.

## 4.5 Página `/admin/loja`

- **Layout:** página full-width dentro de `AppLayout`, título “Configuração da loja” (ou similar).
- **Blocos:** ver §7.3.
- **Submit:** reutilizar mesma lógica de validação e chamadas `createStoreProfile` / `updateStoreProfile` do dialog.
- **Estados:** loading, erro (ex.: slug duplicado — mensagem já tratada no dialog), sucesso (toast).

## 4.6 Reaproveitamento do popup **(Recomendação)**

- Extrair o **conteúdo do formulário** (campos + handlers + validação) para um componente **`StoreSettingsForm`** em `src/components/products/StoreSettingsForm.tsx` (nome ilustrativo).
- A **página** `/admin/loja` renderiza `StoreSettingsForm` embutida.
- **`StoreConfigDialog`:** **remover do fluxo principal**; **(Recomendação)** deletar arquivo **ou** manter como thin wrapper só se algum outro lugar importar — após busca no repo, se apenas `Products.tsx` usar, **remover** dialog e importações.

## 4.7 Categorias sem migration

- **Persistência:** inalterada — continua string em `ProductForm` / API existente.
- **Sugestões:** **(Recomendação)** ao montar `ProductForm`, obter lista de categorias distintas:
  - **Opção preferida Fase 1 (sem novo endpoint):** uma chamada extra `getProducts()`, construir `Set` de `trim(category)` não vazios; **cache** opcional com `sessionStorage` key por tenant se necessário (opcional).
  - **Opção alternativa (se custo de rede for problema):** novo `GET /api/products/category-suggestions` com `SELECT DISTINCT` — **não** é migration, mas é mudança backend; só usar se a opção acima for insuficiente.
- **UI:** `Input` com lista (`datalist`) ou `Command`/`Popover` (shadcn) para autocomplete; permitir valor **novo** livre (não restringir ao dropdown).

## 4.8 Compatibilidade

- **Rotas:** manter `/admin/products/*` e legado `/products/*` **(Fato)** sem remoção.
- **API:** sem breaking change obrigatório; respostas de `getProducts` e store profile **inalteradas** na Fase 1 se filtros forem só no cliente.
- **Vitrine pública:** sem mudança obrigatória.
- **Permissões:** usuário sem `can_view(products)` continua bloqueado; **(Recomendação)** `/admin/loja` deve usar o mesmo módulo `products` em `pathToModule` para o `RequireModuleView` continuar coerente **(Fato: hoje `pathToModule` não cobre `/admin/loja`)**.

---

# 5. Plano de execução em passos

## Passo 1 — preparar a nova navegação e rota da loja

| | |
|--|--|
| **Arquivos afetados** | `src/App.tsx`, `src/layouts/AppLayout.tsx`, `src/components/RequireModuleView.tsx` |
| **Ações** | Registrar rota `path="/admin/loja"` com `AuthGuard` + `AppLayout` + lazy da nova página (componente criado no Passo 2). Em `pathToModule`, adicionar **antes** de regras genéricas: `if (pathname.startsWith('/admin/loja')) return 'products'`. No `AppLayout`, **(Recomendação)** adicionar item “Loja” → `/admin/loja` e **ajustar** link “Produtos” de `/products` para **`/admin/products`** (alinhar ao padrão admin). |
| **Dependências** | Nenhuma backend. |
| **Risco** | Baixo; verificar ordem em `pathToModule` (mais específico primeiro). |

## Passo 2 — migrar a configuração da loja do dialog para página

| | |
|--|--|
| **Arquivos afetados** | Novo: `src/pages/StoreSettings.tsx` (nome ilustrativo); `src/components/products/StoreSettingsForm.tsx`; `src/components/products/StoreConfigDialog.tsx` (remover ou esvaziar); `src/pages/Products.tsx` |
| **Ações** | Extrair formulário do dialog para `StoreSettingsForm`. Criar página que carrega `getStoreProfile()` (404 → modo criação), renderiza formulário e salva com mesma semântica do dialog. Remover `StoreConfigDialog` de `Products.tsx`; substituir botão “Configurar Loja” por `Link`/`navigate` para `/admin/loja`. |
| **Dependências** | Passo 1 (rota registrada). |
| **Risco** | Médio — validar 404 inicial (usuário sem perfil) e slug duplicado. |

## Passo 3 — transformar a listagem admin em tabela

| | |
|--|--|
| **Arquivos afetados** | `src/pages/Products.tsx`; opcional `src/components/products/ProductsTable.tsx` |
| **Ações** | Substituir `grid` de cards por `Table`; mapear colunas §4.2; manter empty state quando `products.length === 0`; manter `loadData` e delete handler. |
| **Dependências** | Pode ser paralelo ao Passo 2 após coordenação de merge. |
| **Risco** | Baixo. |

## Passo 4 — adicionar filtros básicos

| | |
|--|--|
| **Arquivos afetados** | `src/pages/Products.tsx` (ou componente de tabela) |
| **Ações** | Estado local para busca texto, tipo, status, categoria; derivar `filteredProducts` com `useMemo` a partir de `products`; conectar inputs `Input` + `Select` acima da tabela. |
| **Dependências** | Passo 3. |
| **Risco** | Baixo em cliente; performance só se lista muito grande (monitorar). |

## Passo 5 — tratar categorias em modo leve

| | |
|--|--|
| **Arquivos afetados** | `src/pages/ProductForm.tsx`; opcional hook `useProductCategorySuggestions.ts` |
| **Ações** | Implementar autocomplete conforme §4.7 (preferência: `getProducts` uma vez no mount do form ou cache). Normalizar **trim** ao salvar **(Recomendação)** para consistência com sugestões. |
| **Dependências** | Nenhuma obrigatória com backend. |
| **Risco** | Baixo; evitar loop de re-fetch em cada keystroke. |

## Passo 6 — validação final e rollout

| | |
|--|--|
| **Arquivos afetados** | QA em todos os tocados; opcional preload em `routePreload` se existir mapa para products |
| **Ações** | Rodar §9; revisar links profundos `/admin/loja` com usuário sem permissão (deve bloquear como produtos); smoke em `/admin/products` e legado `/products`. |
| **Dependências** | Passos 1–5. |
| **Risco** | Operacional. |

---

# 6. Arquivos impactados

## Frontend **(Recomendação)**

| Arquivo | Motivo | Tipo de mudança |
|---------|--------|-----------------|
| `src/App.tsx` | Rota `/admin/loja` | Aditiva |
| `src/layouts/AppLayout.tsx` | Links Produtos + Loja | Alteração |
| `src/components/RequireModuleView.tsx` | Mapear `/admin/loja` → `products` | Aditiva |
| `src/pages/Products.tsx` | Tabela, filtros, remover dialog, card resumo | Alteração |
| `src/pages/StoreSettings.tsx` (novo) | Página da loja | Novo |
| `src/components/products/StoreSettingsForm.tsx` (novo) | Form extraído | Novo |
| `src/components/products/StoreConfigDialog.tsx` | Fluxo principal migrado | Remover ou deprecar |
| `src/pages/ProductForm.tsx` | Autocomplete categoria | Alteração |

## Backend **(Recomendação)**

| Arquivo | Motivo | Tipo de mudança |
|---------|--------|-----------------|
| *Nenhum obrigatório* | Fase 1 com filtros client-side e sem migration | — |
| `productsController.ts` | *Opcional:* query params para filtros/paginação | Opcional / fora do mínimo |

## Tipos / shared **(Recomendação)**

| Arquivo | Motivo | Tipo de mudança |
|---------|--------|-----------------|
| `src/types/products.ts` | Só se extrair tipo props do form | Opcional |

## Testes **(Recomendação)**

| Arquivo | Motivo | Tipo de mudança |
|---------|--------|-----------------|
| *Novos testes E2E/manual* | Fluxos §9 | Checklist |
| `*.test.tsx` | Só se projeto já cobre páginas com RTL | Opcional |

---

# 7. UX mínima proposta

## 7.1 Tabela de produtos **(Recomendação)**

Colunas: **Nome**, **Tipo**, **Status**, **Preço** (com regra desconto), **Categoria**, **Público**, **Ações** (Editar, Excluir, Abrir vitrine condicional).

## 7.2 Filtros mínimos **(Recomendação)**

- Campo de busca (nome).
- Select tipo: Todos / Produto / Serviço.
- Select status: Todos / Ativo / Inativo / Rascunho.
- Select categoria: Todos / Sem categoria / [cada `distinct` da lista carregada].

## 7.3 Página `/admin/loja` **(Recomendação)**

1. **Dados básicos:** nome da loja, descrição.  
2. **Slug / link público:** mesmo padrão visual do dialog (`origin` + slug + sufixo `/loja`).  
3. **Contatos:** telefone, WhatsApp, e-mail.  
4. **Status ativo:** switch “Loja ativa”.  
5. **Resumo:** botão “Visualizar loja pública” (mesma lógica de `getStoreUrl()`).  
6. **Placeholder futuro:** seção colapsável ou card cinza “Identidade visual (logo, banner) — próxima fase” e “Aparência / tema — próxima fase” **sem** campos funcionais novos.

---

# 8. Compatibilidade e deprecação **(Recomendação)**

| Item | Tratamento |
|------|------------|
| **`GET /api/products`, store profile** | Inalterados na Fase 1 (cenário base). |
| **`/admin/products`, `/products` legado** | Continuam funcionando. |
| **`StoreConfigDialog`** | Fluxo principal **substituído** pela página; **remover** uso em `Products.tsx`; arquivo remover se não houver outros imports. |
| **Rotina do admin** | Usuários que usavam popup passam a usar `/admin/loja`; comunicar em release notes internas. |
| **Deep links** | Favoritar `/admin/loja` é novo comportamento desejado. |

---

# 9. Testes da fase

## 9.1 Testes frontend **(Recomendação)**

- Tabela renderiza N linhas igual ao tamanho da lista após filtros; empty state quando zero resultados filtrados.
- Cada filtro reduz/expõe linhas esperadas; “Sem categoria” funciona.
- `/admin/loja`: criar perfil novo e editar existente; mensagem de slug duplicada.
- Navegação: links sidebar abrem `/admin/products` e `/admin/loja`; `RequireModuleView` bloqueia sem `can_view`.

## 9.2 Testes backend **(Recomendação)**

- **Sem mudança de API (cenário base):** regressão `GET /api/store-profile`, `PATCH /api/store-profile`, `GET /api/products` com usuário com e sem `can_view` (403 já esperado na API interna pós V2-1).
- **Se** endpoint opcional de sugestões for adicionado: testes de tenant isolation e lista DISTINCT.

## 9.3 Testes manuais **(Recomendação)**

- Catálogo com **muitos** produtos (scroll, filtros).
- Catálogo **vazio**.
- Edição da loja: salvar, recarregar página, conferir dados.
- Produtos com categorias repetidas e com capitalização diferente — validar trim/normalização desejada.
- Usuário sem permissão de módulo: não acessa `/admin/loja` nem `/admin/products`.

---

# 10. Rollout e mitigação **(Recomendação)**

- **Feature flag:** **não obrigatória** para Fase 1 se mudanças forem puramente admin e aditivas (nova rota + UX lista); usar flag **opcional** (`store_settings_page`) só se houver medo de regressão em cliente específico.
- **Liberação direta:** aceitável em ambiente com staging e checklist §9.
- **Staging:** validar criar/editar loja, tabela, filtros, permissões.
- **Reverter:** revert commit; sem migration — rollback **não destrutivo**.

---

# 11. Critérios de aceite **(Recomendação)**

- [ ] A listagem principal em **`/admin/products`** (e espelho `/products`) usa **tabela** como padrão, não grid de cards.
- [ ] Existe página **`/admin/loja`** funcional com os blocos mínimos de §7.3.
- [ ] **“Configurar Loja”** não abre mais dialog como fluxo principal; configuração acessível pela página.
- [ ] Filtros mínimos (§7.2) funcionam na listagem.
- [ ] Categorias permanecem campo textual **sem** nova tabela; autocomplete/sugestões leves operacionais.
- [ ] **`RequireModuleView`** cobre **`/admin/loja`** como módulo `products`.
- [ ] Navegação lateral reflete **`/admin/products`** e entrada para **Loja** (ou equivalente acordado).
- [ ] Regressão: criar/editar/excluir produto e salvar loja sem erros novos.

---

# 12. Pendências para Fase 2+ **(Recomendação explícita)**

- Upload de imagens; logo/banner funcional; galeria na vitrine.
- Temas/templates Lovable; identidade visual rica.
- Paginação/filtro **server-side** em `getProducts` se necessário.
- Carrinho público e checkout online.
- Categorias estruturadas com migration (`store_categories`, FK).
- Evolução de `PublicStore` / SEO / `discount_price` na vitrine.

---

*Documento de execução da Fase 1. Atualizar após implementação se a rota do menu ou decisão de filtros client-side vs API for ajustada em code review.*
