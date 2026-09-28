# Plano incremental — Reorganização do Painel Super Admin (PainelCRM)

**Versão:** 1.0  
**Estado:** planeamento apenas — **sem implementação nesta etapa.**  
**Referência:** `docs/AUDITORIA_SUPER_ADMIN_REORGANIZACAO.md`  
**Objetivo:** reorganizar navegação, hierarquia e UX do Super Admin de forma **progressiva**, **compatível com rotas atuais** e **segura para produção**.

---

## Princípios fixos

| Princípio | Como cumprir |
|-----------|----------------|
| Não remover rotas existentes | Manter paths em `App.tsx`; novos paths só como alias com `<Navigate replace />` ou páginas hub que linkam para URLs atuais. |
| Não alterar permissões | Manter `SuperAdminGuard` e `user.is_super_admin`; não mudar middleware backend de superadmin nesta fase. |
| Sem alterações de BD | Nenhuma migração para suportar menus; config continua em `superadmin_settings` / existente. |
| Preservar componentes | Reutilizar páginas atuais; extrair só quando uma fase dedicada o justificar. |
| Navegação primeiro | Prioridade: `SuperAdminLayout` + eventual config declarativa (`navItems`). |
| Hubs antes de mover telas | Criar páginas índice que **apontam** para rotas existentes antes de qualquer split de componente. |
| Compatibilidade com bookmarks | URLs históricas continuam válidas; novos agrupamentos são cosméticos + hubs opcionais. |
| Fases pequenas | Cada fase entrega valor testável (smoke test manual + regressão de rotas). |

---

## 1. Diagnóstico resumido (da auditoria)

- **Sidebar flat:** ~16 entradas em dois grupos genéricos (“Painel” / “Configurações”), sem hierarquia semântica (Comercial vs Financeiro vs Comunicação).
- **Funções misturadas:** gateway de pagamento (“Pagamentos”) afastado das cobranças SaaS (“Cobranças da plataforma”); “Features” globais confundem-se com features de plano.
- **Comunicação e notificações confusas:** três conceitos — alertas in-app (`/notifications`), motor tenant (`/notifications-engine` + templates), notificações da plataforma (`/platform-notifications`, inclui WhatsApp embutido); nomes parecidos, domínios diferentes.
- **Financeiro misturado com “configurações”:** no menu atual, gateway está sob “Configurações” e faturas da plataforma sob “Painel”; mental model de utilizador não coincide com a estrutura.
- **Falta de hubs por área:** não existe página índice por domínio; anúncios têm sub-rotas só por links internos.
- **Telas grandes demais:** `SuperAdminPlatformNotifications` concentra catálogo, envios, definições e painel WhatsApp — difícil manutenção e UX pesada.
- **Dashboard com visão SaaS limitada:** útil para totais e listas recentes; falta consolidar “saúde operacional” (trials, alertas) sem obrigar a abrir “Notificações” genéricas.

---

## 2. Nova arquitetura proposta (árvore de navegação)

A árvore abaixo define **áreas de primeiro nível** e **itens de segundo nível**. Entre parêntesis: **rota atual** quando já existe; **[futuro]** quando não há tela dedicada no Super Admin hoje — não implica implementação neste plano.

```txt
Dashboard
└─ Visão geral (/superadmin)

Empresas
├─ Empresas cadastradas (/superadmin/clients)
├─ Nova empresa (/superadmin/clients/new)
└─ Detalhe da empresa (shell /superadmin/clients/:id)
    ├─ Resumo (.../resumo)
    ├─ Configurações (.../configuracoes)
    ├─ Faturamento (.../faturamento)
    ├─ Utilizadores & impersonar (.../usuarios)
    ├─ Recursos (.../recursos)
    ├─ Matriz de features (/superadmin/tenants/:id/features) [atalho interno]
    ├─ Limites (.../limites)
    ├─ Observações (.../observacoes)
    └─ Logs do tenant (.../logs)

Comercial
├─ Planos (/superadmin/plans)
├─ Features por plano (/superadmin/plans/:id/features) [desde planos]
├─ Recursos do sistema — flags globais (/superadmin/features)
├─ Trials [futuro: políticas centralizadas; hoje: botão em Notificações + dados em tenants]
├─ Regras comerciais [futuro]
├─ Checkout público [futuro / já pode existir fora do superadmin]
└─ Cupons [futuro]

Financeiro
├─ Cobranças / faturas SaaS (/superadmin/platform-billings)
├─ Gateway de pagamento — SaaS (/superadmin/pagamentos)
├─ Ciclos de assinatura — flags (/superadmin/subscription-cycles)
├─ Webhooks / eventos de pagamento [futuro hub; hoje possível API parcial em Pagamentos]
└─ Relatórios & exportações (/superadmin/reports) [pode mover para Suporte ou manter aqui — decisão na Fase 2]

Comunicação
├─ Alertas operacionais — in-app (/superadmin/notifications)
├─ Anúncios aos clientes (/superadmin/announcements)
│   ├─ Grupos (/superadmin/announcements/groups)
│   ├─ Histórico de envios (/superadmin/announcements/sends)
│   └─ … (edição, envio — rotas existentes)
├─ Motor de notificações — tenants (/superadmin/notifications-engine)
├─ Templates padrão CRM (/superadmin/notification-templates)
├─ Notificações da plataforma (/superadmin/platform-notifications)
└─ SMTP / Amazon SES [futuro ou só em config tenant — fora do escopo BD]

Integrações
├─ WhatsApp — instância plataforma [hoje embutido em platform-notifications; futuro: tab/rota filha sem mudar URL base]
├─ Google Agenda [futuro hub ou link documentação]
├─ Asaas / Mercado Pago [atalhos para gateway + docs]
├─ Banco Cora [futuro]
└─ APIs externas [futuro]

Plataforma
├─ Páginas legais (/superadmin/configuracoes/legal)
├─ Branding padrão [futuro]
├─ Configurações globais [futuro agregador de flags dispersas]
└─ (Recursos globais já listados em Comercial podem duplicar atalho aqui ou só cross-link)

Segurança
├─ Administradores da plataforma (/superadmin/users)
└─ Auditoria global (/superadmin/audit)

Suporte interno
├─ Logs por empresa (.../logs dentro do tenant)
├─ Diagnóstico motor CRM [futuro UI para GET .../notifications-engine/summary|deliveries]
├─ Jobs / erros billing [futuro UI para APIs billing/*]
└─ Ferramentas internas [futuro]
```

**Nota de alinhamento:** Itens **[futuro]** servem para não quebrar a árvore “ideal” de SaaS; a implementação incremental **começa só pelo que já tem rota**, mais hubs que linkam para essas rotas.

---

## 3. Mapeamento rota atual → área nova

| Rota existente | Área alvo |
|----------------|-----------|
| `/superadmin` | Dashboard |
| `/superadmin/clients`, `.../new`, `.../:id/*` | Empresas |
| `/superadmin/plans`, `.../:id/features` | Comercial |
| `/superadmin/features` | Comercial (ou Plataforma — escolher um único “dono” no menu e cross-link no hub) |
| `/superadmin/platform-billings` | Financeiro |
| `/superadmin/pagamentos` | Financeiro |
| `/superadmin/subscription-cycles` | Financeiro |
| `/superadmin/reports` | Financeiro **ou** Suporte interno (decisão de UX; ver Fase 2) |
| `/superadmin/notifications` | Comunicação |
| `/superadmin/announcements/**` | Comunicação |
| `/superadmin/notifications-engine` | Comunicação |
| `/superadmin/notification-templates` | Comunicação |
| `/superadmin/platform-notifications` | Comunicação (+ Integrações para WhatsApp embutido) |
| `/superadmin/configuracoes/legal` | Plataforma |
| `/superadmin/users` | Segurança |
| `/superadmin/audit` | Segurança |
| `/superadmin/tenants/:id/features` | Empresas (atalho técnico) |

---

## 4. Estratégia técnica de implementação

### 4.1 Navegação declarativa (recomendado)

- Introduir um único ficheiro (ex.: `src/layouts/superadminNavConfig.ts`) com estrutura:

  ```ts
  type NavItem = { label: string; to: string; icon: LucideIcon; end?: boolean };
  type NavGroup = { id: string; label: string; items: NavItem[] };
  ```

- `SuperAdminLayout` passa a **mapear** `navGroups` para `SidebarGroup` + `SidebarMenu`, preservando `NavLink` e `to` **iguais aos atuais** na primeira entrega.

- Benefício: renomear labels e reordenar **sem** tocar nas rotas em `App.tsx`.

### 4.2 Hubs (páginas índice)

- Novas rotas **opcionais** (ex.: `/superadmin/hub/comunicacao`) que só renderizam cards com links para URLs **já existentes** — ou, na Fase 1 mínima, **sem novas rotas**: apenas colapsáveis na sidebar com os mesmos `to`.

- Critério: **nenhum hub duplica lógica de negócio** — só navegação.

### 4.3 Submenus

- Usar `Collapsible` + `SidebarMenuSub` (padrão shadcn sidebar) **ou** agrupar visualmente com `SidebarGroupLabel` por área (9 grupos), limitando profundidade a **2 níveis** na sidebar principal; detalhe de empresa continua em tabs no layout existente.

### 4.4 Compatibilidade

- **Não alterar** paths registados em `App.tsx` neste plano inicial.
- Redirects adicionais só se se criarem aliases novos (opcional): `hub/financeiro` → pode não existir na Fase 1.

### 4.5 Riscos mitigados

| Risco | Mitigação |
|-------|-----------|
| Utilizadores perdidos após rename | Manter URLs; mudar só labels e ordem. |
| Regressão de permissões | Não tocar em `SuperAdminGuard`. |
| PR gigante | Uma fase = um PR focado (layout apenas; depois hubs; depois refactors). |

---

## 5. Fases de implementação

### Fase 0 — Preparação (opcional, baixo risco)

- [ ] Checklist de rotas: script manual ou documento com todas as URLs `/superadmin/**` (já mapeado na auditoria).
- [ ] Definir owner da decisão: **Relatórios** em Financeiro vs Suporte interno.

**Entrega:** nenhuma alteração obrigatória em código.

---

### Fase 1 — Reorganização da sidebar apenas (alto valor, baixo risco)

**Objetivo:** aplicar a árvore de **9 áreas** reorganizando labels, ordem e agrupamento; **mesmas rotas**.

**Alterações previstas:**

- Criar `superadminNavConfig.ts` (ou equivalente).
- Refatorar `SuperAdminLayout.tsx` para iterar grupos em vez de JSX repetido.
- Renomear labels conforme tabela (ex.: “Features” → “Recursos do sistema”; “Pagamentos” → “Gateway de pagamento (SaaS)” — textos finais aprovados pelo produto).

**Fora de escopo:** novas rotas, divisão de componentes grandes.

**Testes:**

- Clicar cada item do menu e confirmar mesma página que antes.
- Utilizador não super admin continua bloqueado.

**Rollback:** revert único ficheiro + layout.

---

### Fase 2 — Hubs “leves” (opcional; sem novas rotas ou com rotas mínimas)

**Objetivo:** primeira página de cada área com **cards de atalho** (se produto quiser URLs dedicadas).

**Opção A (recomendada para menos risco):** não criar URLs novas; apenas **secções visuais** na sidebar (já na Fase 1).

**Opção B:** adicionar rotas tipo `/superadmin/area/comunicacao` que rendem um componente `SuperAdminHubPage` genérico recebendo lista de links — implementar **redirect** opcional do índice da área para o primeiro child **apenas se** produto exigir landing.

**Testes:** bookmarks antigos inalterados.

---

### Fase 3 — Melhorias de UX sem refactor pesado

**Objetivo:** reduzir confusão dentro de páginas existentes.

Ordem sugerida (cada uma pode ser PR independente):

1. **Dashboard:** cartões resumo para “Trials a verificar” / link para `/notifications` ou ação rápida — só UI consumindo APIs já usadas.
2. **SuperAdminPlatformNotifications:** separação visual obrigatória em **tabs** claramente nomeadas (Catálogo | Envios | Definições | WhatsApp); **mesmo ficheiro** ou extrair subcomponentes **sem mudar contratos de API**.
3. **Cross-links:** no rodapé ou “Ver também” entre Financeiro (cobranças ↔ gateway).

**Proibido nesta fase:** migração de BD; mudança de permissões.

---

### Fase 4 — Rotas filhas opcionais e compatibilidade explícita

**Objetivo:** se na Fase 3 extrair WhatsApp para componente isolado, pode expor **opcionalmente**:

- `/superadmin/integrations/whatsapp-platform` → renderiza **mesmo** componente que hoje está embutido **ou** `<Navigate to="/superadmin/platform-notifications?tab=whatsapp" />` se implementar query tab.

**Regra:** URL antiga `/superadmin/platform-notifications` permanece canónica até deprecação comunicada.

---

### Fase 5 — Limpeza técnica e lacunas de API

**Objetivo:** reduzir dívida sem impacto em utilizadores finais tenant.

- Remover imports mortos (`SuperAdminClientPlaceholder` se confirmado).
- Avaliar rota ou arquivo morto `SuperAdminClientDetail.tsx`.
- **Opcional:** telas mínimas para `notifications-engine/summary` e `deliveries` sob Suporte interno.

**Depende:** priorização de engenharia; não bloqueia Fases 1–3.

---

## 6. Critérios de aceitação globais

- Todas as rotas listadas na auditoria continuam acessíveis pelos **mesmos paths**.
- `SuperAdminGuard` inalterado em comportamento.
- Sidebar reflete as **9 áreas** com agrupamento claro.
- Documentação interna (este plano + changelog de produto) atualizada quando labels mudarem.

---

## 7. O que não fazer neste incremento

- Refatorar backend ou criar novas tabelas para menus.
- Unificar motor tenant e platform num único backend (front apenas organiza).
- Renomear rotas públicas sem período de convivência e redirects.
- Grande refactor de `SuperAdminPlatformNotifications` num único PR sem Fase 3 incremental.

---

## 8. Referências de ficheiros principais

| Ficheiro | Papel |
|----------|--------|
| `src/App.tsx` | Definição de rotas `/superadmin/**` |
| `src/layouts/SuperAdminLayout.tsx` | Sidebar e outlet |
| `src/components/SuperAdminGuard.tsx` | Permissão super admin |
| `src/pages/superadmin/*` | Páginas existentes — preservar |

---

*Documento de plano incremental; implementação futura deve seguir as fases acima e registar decisões de produto (nomes finais em PT).*
