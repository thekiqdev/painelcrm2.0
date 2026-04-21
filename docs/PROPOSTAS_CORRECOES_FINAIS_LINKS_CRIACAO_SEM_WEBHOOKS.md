# Propostas / Orçamentos — correções finais (link público, criação, sem webhooks na UX)

Documento da entrega incremental do **pacote final de correções**: simplificar UX, link público desde o create e descontinuar **Webhooks — Propostas** na interface, sem reabrir o núcleo das Etapas 1–5.

## Causa raiz dos botões “Abrir” / “Copiar link” apagados ou inutilizáveis

No detalhe da proposta (`ProposalDetails`), a ação de abrir/copiar dependia de uma combinação restritiva:

1. **`publicPageOpenEligible`** exigia status `sent` ou `accepted` **e** URL disponível **e** meta de link ativa. Em rascunho, os botões ficavam desabilitados mesmo quando o link já existia.
2. A URL muitas vezes só existia em **`sessionStorage`** (após “gerar link” no mesmo navegador). Sem isso, **`Copiar link`** usava `disabled` com variante que parecia inativa.
3. O **GET** da proposta passou a expor **`public_link_path`** quando o token está persistido (cifrado). A UI não priorizava esse campo antes do estado local, o que agravava o sintoma após reload.

**Correção:** resolver a URL com `proposal.public_link_path` → `origin + path`, depois `lastPublicUrl` / sessão; habilitar **Abrir proposta** e **Copiar link** quando `publicLinkMeta.active` e URL efetiva existirem, **sem** exigir `sent`/`accepted` só para visualização pública (aceite/recusa continuam validados no backend para `sent`).

## Novo comportamento de abrir / copiar link

- Textos curtos: **Abrir proposta** e **Copiar link**.
- **Abrir:** `variant` padrão (ação primária visível); **Copiar:** `outline`.
- `disabled` apenas quando não há link ativo na meta **ou** não há URL resolvida.
- Após carregar o detalhe, se vier `public_link_path`, a URL é sincronizada no `sessionStorage` para consistência entre abas.

## Provisionamento automático do link público no create

- No **POST** `/api/proposals`, após o `INSERT`, o backend chama `issueNewPublicTokenForProposal`, monta `public_link_path` e persiste o token com `saveProposalPublicLinkCiphertext` (token opaco, cifrado em repouso quando a chave está configurada).
- A resposta **201** inclui `public_link_path` para o frontend guardar na sessão e navegar já com link disponível.
- **Unicidade:** um token ativo por proposta na lógica existente de emissão/revogação; regenerar revoga o anterior.
- **Automações futuras:** comentário no controller indica que o link nasce no create para fluxos chat/kanban sem passo manual.

### Variável de ambiente (produção)

Sem **`PROPOSAL_WEBHOOK_SECRET_KEY`** válida (≥ 16 caracteres, conforme crypto do projeto), a cifra pode falhar e o **GET** pode não devolver `public_link_path` até nova emissão ou correção de config. O **create** ainda pode devolver o path uma vez na resposta; operação estável exige chave configurada em produção.

### GET `/api/proposals/:id` com 500 (coluna ausente)

Se a migration que adiciona **`public_link_token_ciphertext`** ainda não rodou, o SELECT que referencia essa coluna gerava erro PostgreSQL **42703** e o cliente via **500**. O controller passa a repetir a consulta **sem** essa coluna; o detalhe da proposta volta a carregar e `public_link_path` fica nulo até aplicar o `ALTER TABLE` e reemitir/guardar o token. No **create**, falha ao `UPDATE` com coluna ausente é tratada como aviso (o path ainda pode vir no JSON da criação).

### Conversão em fatura e método de pagamento

A conversão da proposta (`convertAcceptedProposalToInvoice`) passa a resolver o método com **`resolveAutomaticInvoicePaymentMethod`**, usando a config **ativa do CRM** (ou o gateway explícito em `gateway_key`, se informado): respeita o **método padrão** do gateway quando há um definido e válido entre os habilitados; caso contrário usa a mesma ordem de fallback já usada em jobs automáticos.

## CTA principal de criação

- Tela **Nova proposta** (`NewProposal`): um único botão destacado **Criar proposta** (`size="lg"`).
- Removido o fluxo com **“Salvar rascunho e voltar à lista”** e CTAs duplicados (já ausentes nesta versão).

## Webhooks — Propostas descontinuados na experiência do produto

- Removidos do menu **Configurações**: entrada “Webhooks — Propostas”, tipos em `SettingsLayout` e `case` em `Settings.tsx`.
- No detalhe da proposta: removidos o cartão **Entrega de webhooks** e **Eventos de integração** ligados à UX de webhooks; mantida apenas a **linha do tempo** operacional.
- **Não** foram removidas migrations nem rotas de API de webhook em massa: estrutura pode permanecer inativa no banco para compatibilidade; o produto não expõe mais a configuração nem o fluxo operacional.

O ficheiro `ProposalWebhookSettingsSection.tsx` pode permanecer no repositório sem rota, para eventual reativação técnica.

## Riscos remanescentes

- Ambiente sem chave de cifra: link pode não ser reidratado no GET após reload.
- Bookmarks antigos com `?section=proposalWebhooks` deixam de mapear para secção válida (comportamento: permanece secção padrão).
- Integrações externas que dependiam do webhook de propostas deixam de ser configuráveis pela UI (API pode ainda existir).

## Checklist de aceite

- [x] Botão **Abrir proposta** está clicável quando há link ativo e URL.
- [x] Botão **Copiar link** está clicável nas mesmas condições.
- [x] Textos dos botões ficaram mais curtos.
- [x] Proposta nasce com link público automaticamente no create (resposta + persistência quando cifra OK).
- [x] Detalhe da proposta abre com link disponível via `public_link_path` ou sessão.
- [x] Botão principal de criação é **Criar proposta**.
- [x] Botão **Salvar rascunho e voltar à lista** não existe.
- [x] **Webhooks — Propostas** não aparece na experiência do produto.
- [x] Fluxo principal: criar → abrir/copiar link → cliente aceita/recusa na página pública → faturar quando aplicável.
