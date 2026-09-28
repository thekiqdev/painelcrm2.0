# PHASE-03 — Detalhes, configurações e estado na URL

**Etapa:** 3  
**Data:** 2026-04-25  
**Estado:** concluída

## 1. Objetivo da Etapa 3

Refinar a **experiência mobile** dos detalhes e áreas utilitárias, consolidar o padrão das Etapas 1 e 2, corrigir pendências da Etapa 2 e introduzir **persistência de filtros na query string** nas listagens comerciais principais — sem redesenho completo de chat, dashboard ou desktop.

## 2. Escopo exato da etapa

- Sincronização de filtros com **URL** (recarregar, voltar do detalhe, partilhar link).
- Refino de **detalhe mobile** de Propostas e Contratos (hierarquia, tabs, ações, leitura vertical).
- **Configurações**: leitura e navegação mais confortáveis no mobile; secção na URL.
- **Microajustes** em Clientes (perfil), Cobranças (detalhe), Chat (composer).
- **Correção** na listagem de Contratos: recarregar dados quando filtros mudam (não só ordenação).

## 3. O que entra

- Query params nas listas: **Clientes**, **Cobranças**, **Propostas**, **Contratos**.
- Util partilhado `applyUrlPatch` / leitura numérica em `src/lib/listFiltersUrl.ts`.
- Detalhe **ProposalDetails** e **ContractDetails**: header compacto, resumo mobile, tabs responsivas, menu de ações no mobile, lista de itens da proposta em cards no mobile.
- **SettingsLayout** + **SettingsMenu**: grelha 1 coluna no mobile, áreas com scroll/borda suave, botões de menu com largura mínima em ecrãs estreitos; `?section=` ao escolher secção.
- **CustomerChargeDetail**: resumo com hierarquia (valor em destaque, estado com cor).
- **ClientProfile**: abas Agenda / Financeiro / Configurações com **links reais** em vez de texto “em breve”.
- **Chat**: `enterKeyHint`, `autoComplete` / `autoCorrect` no composer (teclado mobile).

## 4. O que não entra

- FAB global, animações avançadas, launcher de ícones.
- Redesign completo do chat, dashboard ou desktop.
- Novos módulos pesados fora do escopo.
- Persistência de **todos** os campos avançados de contratos na URL (ex.: `clientId` / `responsibleId` continuam só no estado; não poluir a query).

## 5. Pendências herdadas da Etapa 2 (endereçadas nesta fase)

| Pendência | Tratamento |
|-----------|------------|
| Filtros não sobreviviam a refresh / voltar | URL sync nas quatro listas |
| Detalhe proposta/contrato “denso” no telemóvel | Header + resumo + tabs + itens em cards (proposta) |
| Configurações “espremidas” | Layout empilhado + scroll + conteúdo em cartão no mobile |
| Placeholder no perfil do cliente | Links para `/tasks`, `/finance`, `/settings` |
| Contratos não refetch ao mudar filtros | `loadContracts` em `useCallback` + `useEffect` com dependências corretas |

## 6. Direção — persistência de filtros na URL

- **Padrão único:** `applyUrlPatch(prev, patch)` com `setSearchParams(..., { replace: true })` para não encher o histórico.
- **Hidratação:** `useSearchParams` + `useState(() => …)` onde faz sentido + efeito a reagir a `searchParams` para navegação **atrás/frente**.
- **Chaves curtas** onde ajuda (`q`, `tab`, `page`, `dtype`, `from`, `to`, `sf`, `sd`, `val`, `conv`, `owner`, `mine`, etc.).

### 6.1 Clientes (`/clients`)

| Parâmetro | Significado |
|-----------|-------------|
| `q` | Texto de busca |
| `tab` | `all` \| `active` \| `inactive` |
| `group` | UUID do grupo CRM |
| `page` | Página (≥ 2 na URL) |
| `per` | Itens por página (≠ 10) |
| `sort` | Campo de ordenação permitido |
| `dir` | `asc` \| `desc` |

O parâmetro existente `new=1` (abrir diálogo novo cliente) é preservado ao atualizar filtros.

### 6.2 Cobranças (`/customer-charges`)

| Parâmetro | Significado |
|-----------|-------------|
| `q` | Busca (API `q`) |
| `status` | `open` \| `partial` \| `paid` (omitido = todos) |
| `page` | Página 1-based (offset = `(page-1)*50`) |

### 6.3 Propostas (`/proposals`)

| Parâmetro | Significado |
|-----------|-------------|
| `q` | Busca |
| `status` | Estado da proposta (omitido = todos) |
| `client` | UUID do cliente |
| `owner` | `mine` ou UUID do responsável |
| `val` | `valid` \| `expired` |
| `conv` | `yes` \| `no` (faturamento) |

### 6.4 Contratos (`/contracts`)

| Parâmetro | Significado |
|-----------|-------------|
| `q` | Texto de busca |
| `status` | Estado do contrato |
| `dtype` | `created` \| `validity` |
| `from` / `to` | Datas `yyyy-MM-dd` |
| `sf` | Campo de ordenação |
| `sd` | `asc` \| `desc` |

## 7. Direção — detalhes mobile Propostas e Contratos

- **Proposta:** ação principal visível no mobile (Gerar fatura / Aceitar / Marcar enviada); resto em `DropdownMenu`; card-resumo com valor, validade, envio; tabs em grelha 2×2 no mobile; itens só leitura em **cards** (desktop mantém grelha larga).
- **Contrato:** header em coluna; botão Ações compacto (ícone no mobile); card-resumo com valor, datas, número de signatários; tabs em coluna no mobile com ícones alinhados.

## 8. Direção — Configurações mobile

- Conteúdo e menu empilhados (`grid-cols-1` → `md:grid-cols-12`).
- Menu com scroll vertical limitado no mobile para não ocupar o ecrã inteiro.
- Conteúdo principal com cartão leve no mobile (`border`, `rounded-xl`, `p-3`).
- Navegação de secção grava `?section=<SettingSection>` (exceto gateway de pagamentos → `/settings/payments`).

## 9. Microajustes Clientes / Cobranças / Chat

- **Clientes (perfil):** links úteis nas abas sem módulo dedicado no perfil.
- **Cobranças (detalhe):** badge com cor por estado; bloco mobile com total em destaque.
- **Chat:** melhorias pontuais de teclado no composer (sem redesign do fluxo lista/conversa).

## 10. Checklist de implementação

- [x] Documentação PHASE-03 + STATUS + README
- [x] `listFiltersUrl.ts` (util partilhado)
- [x] URL: Clientes, Cobranças, Propostas, Contratos
- [x] Contratos: refetch quando `filters` mudam
- [x] ProposalDetails mobile
- [x] ContractDetails mobile
- [x] SettingsLayout + SettingsMenu + `?section=`
- [x] CustomerChargeDetail + ClientProfile placeholders
- [x] Chat composer (atributos mobile)
- [x] `npm run build`

## 11. Checklist de validação

- [x] Filtros persistem na URL nas listas indicadas
- [x] Voltar atrás no browser restaura filtros (quando a entrada de histórico tinha query)
- [x] Detalhe proposta/contrato mais legível no mobile
- [x] Configurações mais usáveis no mobile
- [x] Desktop: grelhas `md:` preservadas
- [x] Tema claro/escuro (tokens existentes)
- [x] Build sem erros

## 12. Status

| Área | Estado |
|------|--------|
| Documentação | concluído |
| URL / listagens | concluído |
| Detalhe Propostas / Contratos | concluído |
| Configurações | concluído |
| Microajustes + Chat pontual | concluído |

## Arquivos criados/alterados

| Ficheiro | Ação |
|----------|------|
| `docs/mobile-ux/PHASE-03-details-settings-and-state.md` | criado |
| `docs/mobile-ux/STATUS.md` | alterado |
| `docs/mobile-ux/README.md` | alterado |
| `src/lib/listFiltersUrl.ts` | criado |
| `src/pages/Clients.tsx` | alterado |
| `src/pages/CustomerCharges.tsx` | alterado |
| `src/pages/Proposals.tsx` | alterado |
| `src/pages/Contracts.tsx` | alterado |
| `src/pages/ProposalDetails.tsx` | alterado |
| `src/pages/ContractDetails.tsx` | alterado |
| `src/pages/CustomerChargeDetail.tsx` | alterado |
| `src/pages/ClientProfile.tsx` | alterado |
| `src/pages/Chat.tsx` | alterado |
| `src/layouts/SettingsLayout.tsx` | alterado |
| `src/components/settings/SettingsMenu.tsx` | alterado |

## Rotas impactadas

- `/clients` (+ query)
- `/customer-charges` (+ query)
- `/proposals` (+ query)
- `/contracts` (+ query)
- `/settings` (+ query `section`)
- Detalhe: `/proposals/:id`, `/contracts/:id`, `/customer-charges/:id` (sem mudança de path; UX melhorada)
- Perfil: `/clients/:id/...` (conteúdo de abas utilitárias)

## Pendências sugeridas — Etapa 4 (segura)

- Opcional: debounce extra só para escrita de `q` na URL em Clientes (hoje: `replace` por tecla, sem histórico extra).
- Chat: afinar **visualViewport** / inset com teclado software (iOS/Android) se feedback real o exigir.
- Dashboard mobile: melhorias incrementais **fora** de redesign monolítico (conforme plano estratégico).
