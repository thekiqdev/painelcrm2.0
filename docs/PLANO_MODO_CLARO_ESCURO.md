# Plano de implementação — Modo claro e escuro (PainelCRM) — **versão refinada (Fase 1)**

Documento de **planejamento e registro de status**. Consolida investigação prévia, **decisões fechadas**, ordem de execução, UX, critérios de aceite e riscos. **As Etapas 2 a 5 da frente modo claro/escuro estão concluídas e aprovadas** (detalhe em **§13**). Expansão para outras rotas segue como **novos lotes** (§14–§16).

---

## 1. Resumo executivo atualizado

O PainelCRM já possui base técnica favorável: **Tailwind com `darkMode: ["class"]`**, variáveis CSS em `src/index.css` (`:root` + `.dark`), componentes shadcn ligados a esses tokens e a dependência **`next-themes`** instalada (hoje **sem** `ThemeProvider` na árvore; o `Toaster` já chama `useTheme`).

A **Fase 1** introduz apenas **dois modos explícitos — claro e escuro** — com **tema inicial padrão claro**, **persistência em `localStorage`** e **controle por classe `dark` no `<html>`**, incluindo **estratégia anti-flash**. O modo escuro deve transmitir **profundidade, superfícies premium e contraste** inspirados na home (`.landing-page` / `landingpage.css`), **sem recolorir o produto**: a **identidade cromática principal do painel** (uso atual de **`crm-primary`** e primária interativa reconhecível) **permanece**.

A interação será um **único componente reutilizável `ThemeToggle`**, posicionado **ao lado do sino de notificações**, com **sol**, **lua** e texto **claro para o usuário final**. A execução segue **ordem obrigatória**: consolidar estratégia e tokens → base global (provider, classe, persistência, anti-flash) → `ThemeToggle` no header → adequação de **componentes globais** → páginas com hardcodes → QA.

**Não há, na Fase 1,** modo automático, “seguir sistema operacional” ou valor `system` na UI ou na persistência.

---

## 2. Decisões fechadas da Fase 1

| Decisão | Escolha |
|--------|---------|
| Modos disponíveis | **Somente** `light` e `dark` |
| Tema padrão (primeira visita / sem chave no storage) | **`light`** |
| Persistência | **`localStorage`** (chave única, ex.: `painelcrm-theme`) |
| Modo sistema / `prefers-color-scheme` / opção “Automático” | **Fora do escopo da Fase 1** |
| Controle no DOM | Classe **`dark`** no elemento raiz (**`<html>`**), alinhado ao Tailwind |
| Biblioteca de tema | **`next-themes`** com **`ThemeProvider`**, **`attribute="class"`** |
| Anti-flash | **Obrigatório**: script inline em `index.html` e/ou estratégia equivalente recomendada pela lib, testada |
| Identidade cromática principal no painel | **Manter** a referência atual ( **`crm-primary`** / azul reconhecível); **não** substituir por paleta da home |
| Papel da home na Fase 1 | **Referência estética** para fundos, cards, bordas, sombras, contraste e sensação premium — **não** regra para trocar toda a paleta do painel |
| Componente de alternância | **`ThemeToggle`** único, **reutilizável**, importado nos layouts que precisem do controle |
| Escopo de telas na Fase 1 | Foco no **app autenticado** (e Super Admin onde o header existir); landing pública permanece como hoje salvo decisão futura explícita |
| Configurações → Aparência | **Fora do escopo obrigatório da Fase 1** (pode entrar depois como espelho do mesmo `ThemeToggle` / `setTheme`) |

---

## 3. Estratégia técnica consolidada

### 3.1 Direção preferencial (e por que não mudar)

| Item | Direção |
|------|---------|
| Empacotamento | **`next-themes`** |
| Provider | **`ThemeProvider`** envolvendo a árvore em `App.tsx` (ou ponto único logo abaixo de `BrowserRouter`, conforme convenção da lib) |
| Atributo | **`attribute="class"`** → aplica/remove `dark` no `documentElement` |
| Temas | Apenas **`light`** e **`dark`** |
| Default | **`defaultTheme="light"`** |
| Sistema | **`enableSystem={false}`** (ou equivalente na versão em uso) — **sem** terceiro modo |
| Storage | **`storageKey`** fixo (ex.: `painelcrm-theme`); valores armazenados apenas `light` \| `dark` |
| Sonner | Manter integração com `useTheme`; com apenas `light`/`dark`, o tema resolvido fica **determinístico** (ajustar fallback atual `system` no componente, se necessário, para `light` quando sem provider — pós-provider isso deixa de ser ambíguo) |

**Por que não trocar por solução caseira:** o projeto **já depende** de `next-themes` no `sonner.tsx`. Implementar estado manual duplicaria lógica (classe + storage + hidratação) e aumentaria risco de dessincronia com toasts. **Não há ganho** na base atual em abandonar `next-themes` para a Fase 1.

**Único ponto de atenção:** a documentação da lib costuma recomendar um **snippet anti-flash** no `index.html`; isso deve ser adotado **em conjunto** com o `storageKey` escolhido, para leitura síncrona antes do primeiro paint.

### 3.2 Tokens, variáveis e Tailwind

- **Fonte principal de “dark neutro premium”:** variáveis **não cromáticas** (background, foreground, card, border, muted, sidebar, popover, input, ring) no bloco **`.dark`** em `src/index.css`, **calibradas** com o mesmo **vocabulário visual** da home (profundidade azulada, sem preto puro, bordas legíveis).
- **`--primary` / primária shadcn:** na Fase 1, **não usar a home como justificativa para trocar a cor de destaque do produto**. Manter coerência com o painel hoje: ou **preservar relação próxima ao tema claro** para botões `default` que dependem de `--primary`, ou **documentar em implementação** o mapeamento mínimo necessário para que botões e links continuem **reconhecíveis** — sem “recoloração geral” para ciano da landing.
- **`crm.*` (hex em `tailwind.config.ts`):** permanece como **âncora de marca**; ajustes pontuais de contraste no escuro fazem-se **só se necessário**, sem refatoração massiva.
- **Variantes `dark:` no Tailwind:** complemento para casos que não passam por variável (badges, alertas, gráficos).

### 3.3 Ordem lógica técnica (alinhada às etapas da §6)

1. Definir **valores finais** do `.dark` (neutros + superfícies) e validar **rapidamente** em componentes base.
2. Garantir **`ThemeProvider`** + **persistência** + **anti-flash** antes de polir páginas isoladas.
3. Só então **instalar `ThemeToggle`** e, na sequência, **varrer primitives globais** (sidebar, header, tabelas, formulários, modais).

---

## 4. Diretriz visual consolidada

### 4.1 O que a home inspira (e o que não inspira)

| Inspira (Fase 1) | Não inspira (Fase 1) |
|------------------|----------------------|
| Profundidade de fundo (camadas azuladas, não #000) | Nova cor primária “ciano landing” no lugar do azul do painel |
| Leitura e contraste de texto secundário | Recolorir ícones, marcas ou CTAs para outra família cromática |
| Tratamento de **cards**, **bordas**, **sombras** sutis | Substituir identidade já associada ao **`crm-primary`** |
| Sensação **SaaS premium** | “Dark genérico” sem relação com o produto |

### 4.2 Âncoras que não mudam de significado

- **Cor primária interativa reconhecível:** manter o **azul do painel** (`crm-primary` e padrões de navegação ativa como `bg-crm-primary/10`, `text-crm-primary`) como **referência principal** de destaque.
- **Objetivo:** no escuro, o usuário ainda **identifica** o mesmo produto; apenas o **ambiente** (fundos e superfícies) acompanha uma estética **compatível** com a home.

### 4.3 Superfícies e componentes globais

- **Fundos / cards / bordas / inputs / popovers:** derivados das variáveis `.dark` ajustadas.
- **Hover / focus:** revisar **ring** e estados em `Button`, `Input`, `DropdownMenu`, `Sidebar` para contraste no escuro.
- **Tabelas:** cabeçalhos, divisórias e hover de linha coerentes com `muted` e `border`.

---

## 5. UX final recomendada — `ThemeToggle`

### 5.1 Posição e princípios

- **Posição:** no `Header` de `AppLayout.tsx`, **ao lado do sino** (mesmo grupo `flex` de ações à direita); **antes ou depois** do sino, desde que **adjacente** e visualmente agrupado (recomendação: **à esquerda do sino** — fluxo natural “personalização → notificações → perfil”).
- **Super Admin:** **mesmo componente** `ThemeToggle`, sem duplicar markup.
- **Estilo:** **toggle / trilho** compacto (estilo “chave” premium), **discreto**, **não** competir com a busca nem com o avatar.

### 5.2 Conteúdo visual obrigatório

- Ícone **Sol** associado a **Claro**
- Ícone **Lua** associado a **Escuro**
- **Texto descritivo** visível em telas largas; em telas estreitas, **compactar** sem perder compreensão (ver abaixo)

### 5.3 Microcopy recomendada (PT-BR)

**Problema:** a expressão “Tema do sistema” pode soar como “tema do Windows/macOS”. Como a Fase 1 **não** oferece modo sistema, o texto deve deixar claro que é **o tema do PainelCRM**.

| Elemento | Recomendação |
|----------|----------------|
| Rótulo contextual (linha auxiliar, `text-xs` / `text-muted-foreground`) | **Tema do painel** — *ou*, se preferir alinhar à direção nominal “sistema”: **Tema do sistema** com **tooltip** explicando *“Aparência do PainelCRM (claro ou escuro). Não usa o tema do dispositivo.”* |
| Valor do estado (destaque) | **Claro** ou **Escuro** (semibold) |
| Tooltip do controle inteiro | **Claro:** *“Tema claro: fundos claros, ideal para ambientes iluminados.”* **Escuro:** *“Tema escuro: fundos escuros, contraste confortável e visual alinhado à identidade PainelCRM.”* |
| `aria-label` (exemplo) | *“Tema do painel: Claro. Alternar para escuro.”* / *“Tema do painel: Escuro. Alternar para claro.”* |

**Sugestão premium e clara (desktop):** bloco compacto com rótulo **“Tema do painel”** e, ao lado ou abaixo em linha única, o **trilho** com sol/lua + palavra **“Claro”** ou **“Escuro”** conforme o estado **ativo**.

**Mobile:** trilho **somente ícones** + palavra **“Claro”** ou **“Escuro”** em abreviatura se necessário (**“Claro” / “Escuro”** já são curtos); manter **tooltip** / **aria-label** completos.

### 5.4 Indicação do estado atual

- **Trilho:** lado preenchido / “thumb” posicionado junto ao ícone **ativo** (sol à direita ou à esquerda — **definir convencão fixa**: ex. **lua + “Escuro” à direita quando escuro**).
- **Cor:** ícone ativo com **`text-primary` ou cor de marca** coerente com **primária atual**; inativo em `text-muted-foreground`.
- **Texto:** sempre mostrar o modo **vigente** (“**Escuro**” quando `dark` está aplicado).

### 5.5 Comportamento visual claro vs escuro

- **No tema claro:** trilho com fundo `muted`, borda sutil; ícones legíveis.
- **No tema escuro:** mesmo layout, com **contraste** ajustado (bordas `border-border`, fundo do trilho levemente mais profundo que o header se necessário).
- **Transição:** `transition-colors` **curta**; respeitar **`prefers-reduced-motion`** (reduzir ou eliminar animação de deslize se aplicável).

---

## 6. Plano por etapas — **ordem obrigatória**

As etapas abaixo **não devem ser invertidas** sem motivo excepcional (ex.: hotfix). Objetivo: **estabilizar a base antes** de atacar páginas isoladas.

### Etapa 1 — Consolidar estratégia, tokens e base visual

- Fechar escopo Fase 1 (esta lista de decisões).
- Revisar `src/index.css` (`:root` / `.dark`), `tailwind.config.ts`, uso de `crm.*` e pontos já com `dark:`.
- Definir **matriz de valores** do `.dark` (superfícies / neutros) inspirada na home, **sem** mudança de identidade cromática principal.
- **Critério de saída:** especificação escrita dos tokens escuros (neutros) aprovada para implementação.

### Etapa 2 — Base global do tema (implementação técnica core)

- Integrar **`ThemeProvider`** (`next-themes`): `attribute="class"`, `defaultTheme="light"`, **`enableSystem={false}`**, `themes` restrito a `light` + `dark`, `storageKey` definido.
- Garantir que **`dark`** seja aplicado/removido do `<html>` de forma consistente.
- Implementar **anti-flash / FOUC** (script + alinhamento com `storageKey`).
- Ajustar **`.dark`** em `src/index.css` conforme Etapa 1.
- Validar **`Toaster`** / `useTheme` após o provider.

**Critério de saída:** alternar tema via chamada programática (ex. devtools / botão provisório) com persistência e **sem flash perceptível** em refresh.

### Etapa 3 — `ThemeToggle` e header

- Criar **`src/components/ThemeToggle.tsx`** (ou `src/components/theme/ThemeToggle.tsx`) como **única** implementação.
- Inserir no **`Header`** ao lado do sino; reutilizar em **`SuperAdminLayout`**.
- Acessibilidade: foco, teclado, `aria-label`, tooltips.

**Critério de saída:** UX conforme §5 em desktop e mobile básico.

### Etapa 4 — Componentes globais compartilhados (primeiro onda)

Priorizar **primitives e casca do app**, não páginas específicas:

- **Header** e **sidebar** (`AppLayout`, `components/ui/sidebar`, triggers, estados ativos com `crm-primary`).
- **Cards**, **tabelas** (`components/ui/table`, etc.), **formulários** (input, select, textarea), **modais/dialogs**, **dropdowns/menus**, **hover/focus** consistentes.

**Critério de saída:** navegação principal e formulários modais principais **coerentes** no escuro, sem quebrar layout.

### Etapa 5 — Páginas e hardcodes (segunda onda, gradual) — **concluída (escopo acordado)**

- Mapear **dívida técnica** (`bg-white`, `text-slate-*` sem par escuro, gráficos com hex fixo, etc.).
- Corrigir **por prioridade de uso** (Dashboard, Chat, Settings/WhatsApp prioritários, fluxos embutidos no Chat) **sem** refatoração massiva única.

**Critério de saída (atingido):** telas prioritárias **usáveis** no escuro; o restante está em **§14** (próximos lotes). Detalhe da entrega: **§13**.

### Etapa 6 — QA visual, regressão e polimento

- Roteiro de testes (§9 + checklist §10).
- Ajustes finos de contraste, alinhamento e estados.
- **Critério de saída:** critérios de aceite atendidos; aprovação para produção.

---

## 7. Componentes e arquivos mais impactados

| Área | Arquivos / componentes (típico) |
|------|----------------------------------|
| Tokens | `src/index.css` |
| Provider / rota | `src/App.tsx` |
| Anti-flash | `index.html` |
| Toggle | **Novo:** `ThemeToggle` (caminho a definir na implementação) |
| Layout | `src/layouts/AppLayout.tsx`, `src/layouts/SuperAdminLayout.tsx` |
| Toasts | `src/components/ui/sonner.tsx` |
| Primitives | `src/components/ui/*` (button, card, input, dialog, dropdown-menu, table, tabs, sheet, …) |
| Sidebar | `src/components/ui/sidebar.tsx` |
| Charts | `src/components/ui/chart.tsx`, páginas com Recharts |
| Dívida | Ex.: `src/pages/Dashboard.tsx`, `src/pages/Chat.tsx`, outras com hardcode (inventário na Etapa 5) |

**Landing:** `src/landingpage/landingpage.css` e layout da home **não** são obrigatórios para alteração na Fase 1, salvo decisão explícita de alinhar comportamento público.

---

## 8. Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| **Flash de tema errado** | Script anti-flash + mesmo `storageKey` do provider; testar hard refresh e aba anônima |
| **Primária shadcn vs `crm-primary`** | Diretriz §4: não recolorir marca; ajustar só o mínimo para botões/links continuarem reconhecíveis |
| **Estados ativos da sidebar** | Validar `bg-crm-primary/10` sobre novo fundo escuro; ajuste pontual de opacidade se necessário |
| **Hardcodes espalhados** | Etapa 5 gradual; inventário explícito; não bloquear release se núcleo global estiver OK |
| **Duplicação do toggle** | **Um único `ThemeToggle`** importado em todos os layouts |
| **Confusão “Tema do sistema”** | Microcopy §5.3: preferir **“Tema do painel”** ou tooltip esclarecendo que **não** é tema do SO |
| **Regressão mobile** | Testar largura estreita no header (overflow, `min-w-0`, ordem dos ícones) |

---

## 9. Critérios de aceite (objetivos)

### Funcional

- [ ] O controle de tema aparece **no topo**, **ao lado do sino** de notificações (mesma área de ações do header autenticado).
- [ ] Exibe **sol**, **lua** e **texto compreensível** sobre o modo atual (**Claro** / **Escuro**) e/ou rótulo **Tema do painel** (ou equivalente aprovado na §5.3).
- [ ] O tema escolhido **persiste após refresh** da página.
- [ ] O tema escolhido **persiste ao navegar** entre rotas internas.
- [ ] **Não há flash perceptível** do tema incorreto na carga inicial (critério subjetivo mínimo: teste em rede lenta simulada e hard refresh).

### Visual e identidade

- [ ] **Sidebar**, **header**, **cards**, **tabelas**, **inputs**, **modais** e **dropdowns** ficam **visualmente coerentes** no escuro (sem “pedaços” claros soltos por tokens não aplicados **nos globais**).
- [ ] O escuro transmite **aparência premium** e **profundidade** compatível com a **home** (sem preto cru dominante).
- [ ] A **cor principal do sistema permanece reconhecível** (destaque / navegação / marca azul atual — `crm-primary`).
- [ ] O **layout atual não quebra** (sem sobreposição crítica, sem perda de área de clique, sem regressão grave de espaçamento).

### Escopo Fase 1

- [ ] Apenas **Claro** e **Escuro**; **nenhuma** opção “Automático” / “Sistema operacional” visível ou persistida.

---

## 10. Dívida técnica — o que tratar quando

### 10.1 Imediatamente (bloqueia qualidade da Fase 1)

- Definição e implementação dos **tokens `.dark` neutros** (superfícies, bordas, texto).
- **`ThemeProvider`** + **anti-flash** + **`ThemeToggle`**.
- **Shell global:** header, sidebar, primitives de formulário e overlay (modal/dropdown).

### 10.2 Etapa 5 — gradual (**encerrada no escopo prioritário**)

- O trabalho gradual focado em **Dashboard, Chat, Settings/WhatsApp e fluxos embutidos** foi concluído (§13).
- **Expansão** para Funil, Faturas (fora do já revisto), Clientes, Contratos, Loja, SuperAdmin e restantes secções — ver **§14** e **§16**.

### 10.3 Mais tarde (pós–Fase 1)

- Sincronização de tema com **backend** (multi-dispositivo).
- Opção **seguir sistema** (`system`), se produto solicitar.
- Espelhar controle em **Configurações → Aparência** (`PreferencesSection.tsx`).
- Decidir se a **landing pública** deve reagir ao mesmo `html.dark`.

### 10.4 Prioridade máxima (componentes compartilhados)

1. `src/index.css` (`.dark`)  
2. `App.tsx` + `index.html` (provider + anti-flash)  
3. `ThemeToggle`  
4. `components/ui/*` usados em quase todas as telas (button, input, card, dialog, dropdown, table, sheet)  
5. `AppLayout` / `sidebar`  
6. `sonner.tsx`  

---

## 11. Checklist final para implementação (pré-merge / pré-deploy)

- [ ] `ThemeProvider` com `attribute="class"`, `defaultTheme="light"`, **`enableSystem={false}`**, apenas `light` | `dark`
- [ ] `storageKey` único e documentado
- [ ] Anti-flash implementado e testado (incl. primeira visita e retorno com preferência salva)
- [ ] `.dark` com **neutros / superfícies** inspirados na home; **identidade primária do painel preservada**
- [ ] Componente **`ThemeToggle`** criado **uma vez** e reutilizado
- [ ] `ThemeToggle` **ao lado do sino** no `AppLayout`; mesmo componente no `SuperAdminLayout` se aplicável
- [ ] Sol + lua + texto; tooltips / `aria-label` em PT-BR
- [ ] Toasts alinhados ao tema (`useTheme`)
- [ ] Smoke: header, sidebar, card, tabela, input, modal, dropdown nos dois temas
- [ ] Mobile: header sem overflow crítico
- [ ] Critérios da §9 verificados
- [ ] Lista atualizada de **hardcodes** restantes (dívida §10.2)

---

## 12. Referências rápidas no repositório (contexto)

- Tokens globais: `src/index.css` (`:root`, `.dark`)
- Tailwind dark: `tailwind.config.ts` (`darkMode: ["class"]`)
- Referência estética neutros premium (home): `src/landingpage/landingpage.css` (`.landing-page`)
- Header + sino: `src/layouts/AppLayout.tsx` (`Header`)
- Toaster + `useTheme`: `src/components/ui/sonner.tsx`

---

## 13. Encerramento da frente — Etapas 2, 3, 4 e 5 (implementado)

Registro objetivo do que foi **concluído** nesta frente (além da Etapa 1 de especificação/tokens). A **Etapa 6** do plano original (QA formal e polimento transversal) permanece recomendada como **rotina** em cada deploy e como **QA manual** nas áreas abaixo; não bloqueia o encerramento do escopo de desenvolvimento da Etapa 5.

### Etapa 2 — Base global do tema (**concluída**)

- `ThemeProvider` (`next-themes`): `attribute="class"`, `defaultTheme="light"`, `enableSystem={false}`, temas apenas `light` e `dark`, `storageKey` definido (ex.: `painelcrm-theme`).
- Classe `dark` no `<html>`; **anti-flash** em `index.html` alinhado ao `storageKey`.
- Bloco **`.dark`** em `src/index.css` com neutros/superfícies premium (sem recolorir a marca).
- Ajustes em **Sonner** / integração com tema.

### Etapa 3 — `ThemeToggle` e header (**concluída**)

- Componente **`ThemeToggle`** reutilizável (sol/lua, trilho).
- Inclusão no **header** do app autenticado e no layout **Super Admin**, coerente com o shell.

### Etapa 4 — Componentes globais (primeira onda) (**concluída**)

- **Primitives** compartilhados: cards, tabelas, inputs, selects, dialogs, sheets, dropdowns, tooltips, badges, command, sidebar, etc., alinhados a tokens e `dark:` onde necessário.
- **Layouts** (`AppLayout`, `SuperAdminLayout`): navegação ativa, bordas e estados de foco coerentes com o tema.

### Etapa 5 — Páginas e hardcodes (segunda onda, gradual) (**concluída** no escopo acordado)

Entrega em subfases documentais:

| Subfase | Foco | Situação |
|--------|------|----------|
| **5A** | **Dashboard**; primeiras passagens em **Chat** e **Settings** | Concluída |
| **5B** | **Chat** (lista, bolhas, composer, painéis); **top 5 secções** de Settings (ex.: empresa, utilizadores, WhatsApp, pagamentos/gateway, cobrança) | Concluída |
| **5C** | Subfluxos **Chat**: `ChatWhatsappModelPickerDialog`, `MessageStatusIndicator`, formularação embutida (**`CustomerInvoiceNew`**, **`ProposalCreateForm`** no contexto chat); restantes **WhatsApp/Settings**: `QRCodePopup`, `QRCodeScanner`, `ConnectionStatus`, `InstanceDetailsDialog`, `EvolutionApiConfig` | Concluída |

**Critério atingido para Etapa 5:** áreas prioritárias **usáveis e coerentes** em claro e escuro, com padrão de tokens; sem exigência de varredura de **todas** as rotas do produto (isso passa a **lotes futuros**, §14).

---

## 14. Fora do escopo já encerrado — próximos lotes de expansão

O seguinte **não** faz parte do encerramento da Etapa 5 e deve ser tratado como **novo lote** de dark mode ou **melhoria pontual** após QA:

| Área | Notas |
|------|--------|
| **Funil** (`Funnel`, `FunnelDetails`, Kanban, cartões, pipelines) | Muitos estados de cor, arrastar-soltar e densidade visual — lote dedicado recomendado. |
| **Faturas / Financeiro** (listas, detalhe, fluxos de pagamento internos) | Tabelas densas, valores monetários, badges de estado; possível sobreposição parcial com ajustes já feitos em `CustomerInvoiceNew` só no contexto Chat. |
| **Clientes** (lista, perfil, formulários) | Grandes superfícies e componentes partilhados (ex. combobox) a rever no contexto de página completa. |
| **Contratos** (listas, detalhe, assinatura, modelos) | Fluxos longos, editores, pré-visualizações. |
| **Loja** (admin: produtos, checkout, vitrine) | Possível mistura de padrões de marketing e tabelas; **checkout público** pode ter regras à parte. |
| **SuperAdmin** (páginas além do shell já alinhado) | Muitas tabelas e formulários; menor prioridade por audiência, mas dívida visual acumulada possível. |
| **Chat** | `Chat.tsx` pode ainda conter diálogos secundários não revistos; **ChatKanban** / rotas satélite — fora do fecho 5C explícito. |
| **WhatsApp (outros fluxos)** | Ex.: `AddConnectionDialog` e fluxos não listados na 5C. |
| **Settings (restantes secções)** | Notificações, segurança, aparência espelhada do tema, CRM auxiliar, domínio, templates, etc. |
| **Landing pública** | Continua fora da Fase 1 salvo decisão de produto (§2, §7). |
| **Modo sistema / “seguir SO”** | Continua fora do escopo (§2, §10.3). |

---

## 15. QA manual — riscos e observações importantes

| Tema | Observação |
|------|------------|
| **QR Code (WhatsApp)** | Na expansão do dark mode, o container do QR deixou de usar **branco puro** em alguns fluxos, em troca de `bg-card` / bordas com tokens — **melhor aspeto no escuro**, com **risco residual**: alguns telemóveis/câmaras podem preferir contraste máximo no quadrante do código. **Validar** leitura real (iOS/Android) em claro e escuro; se falhar, ajuste **pontual** só na área do bitmap (ex. fundo claro mínimo dentro do frame) sem reabrir a frente inteira. |
| **Flash de tema** | Testar primeira visita, regresso com `localStorage` e hard refresh (§8). |
| **Formulários longos embutidos no Chat** | Fatura e proposta dentro do painel de conversa: scroll, foco e modais aninhados — testar em viewport estreito. |
| **Gráficos** | Dashboard já tratado; outras páginas com Recharts/hex fixos ainda podem existir fora do escopo fechado. |
| **Contraste e legibilidade** | Verificar estados **hover/focus** em listas densas e **badges** semânticos (sucesso/alerta) nas novas rotas quando forem abordadas. |

---

## 16. Proposta — próximo épico / lote de expansão do dark mode

**Objetivo:** estender o mesmo padrão de tokens (`border-border`, `bg-muted`, `text-muted-foreground`, variantes `dark:`, primária preservada) às rotas ainda não cobertas, **sem redesenho**, por **incrementos** testáveis.

### Ordem recomendada

| Ordem | Área | Justificativa curta | Risco visual | Risco técnico | Notas de sequência |
|-------|------|---------------------|--------------|---------------|---------------------|
| **1** | **Funil** | Alto tráfego; impacto imediato na perceção “o produto está escuro”; semelhante a Dashboard (cartões, listas). | **Alto** — colunas Kanban, cartões, etiquetas, possíveis cores de estágio. | **Médio** — DnD, reordenação, virtualização se existir. | Fazer **depois** do shell global já estável; primeiro lote grande “só” de CRM operacional. |
| **2** | **Faturas / Financeiro** | Dados críticos (valores, estados); tabelas e detalhe intensivos; alinha com confiança no produto. | **Alto** — densidade, zebra, badges de pagamento. | **Médio** — muitos estados e links para gateways. | Reutilizar padrões de **tabela** e **badge** já validados em Settings pagamentos. |
| **3** | **Clientes** | Núcleo CRM; lista + perfil + ações; beneficia de comboboxes e cards já parcialmente alinhados noutros sítios. | **Médio–Alto** — perfil pode ser longo e com abas. | **Baixo–Médio** — sobretudo composição de componentes existentes. | Bom momento para **unificar** padrões de lista/detalhe antes de Contratos. |
| **4** | **Contratos** | Fluxos longos (edição, PDF, assinatura); menos frequência que Funil/Faturas mas **alto risco de regressão** se mal feito. | **Alto** — leitura prolongada, PDF, estados legais. | **Médio** — editores ricos, anexos. | Entrar quando **Clientes** e **Faturas** já estabilizarem padrões de formulário e alertas. |
| **5** | **Loja** | Admin de catálogo/checkout; possível mistura de componentes de marketing. | **Médio** — variedade de cartões e formulários. | **Médio** — rotas públicas de loja podem excluir-se ou tratar-se à parte. | Avaliar se **checkout público** fica no mesmo épico ou épico “público”. |
| **6** | **SuperAdmin** | Menor % de utilizadores; muitas tabelas semelhantes — bom **fecho** para consolidar padrões. | **Médio** — densidade de dados. | **Baixo** — em geral CRUD + tabelas. | Útil como **varredura final** de tabelas e formulários administrativos. |

### Melhor sequência incremental (sugestão)

1. **Incremento A — Funil (MVP visual):** lista de funis + detalhe + quadro Kanban com tokens; sem alterar lógica de negócio.
2. **Incremento B — Faturas:** listagem principal + detalhe + estados; depois subfluxos (pagamento, links) se necessário.
3. **Incremento C — Clientes:** lista + perfil (abas por fases se útil).
4. **Incremento D — Contratos:** por tipo de ecrã (lista → detalhe → editor).
5. **Incremento E — Loja:** admin primeiro; decisão explícita sobre storefront público.
6. **Incremento F — SuperAdmin:** por módulo (planos, tenants, pagamentos…) para limitar regressões.

Cada incremento deve terminar com **build limpo** e **smoke** claro/escuro nas rotas tocadas.

---

*Versão refinada — abril/2026 — plano original aprovado; §13–§16 adicionados após encerramento da Etapa 5.*
