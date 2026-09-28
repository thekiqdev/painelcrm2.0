# Mobile — Perfil do contato no chat e fluxos comerciais

Este documento descreve o comportamento acordado para **mobile em primeiro lugar**, sem alterar regras de negócio no backend. O desktop mantém densidade e fluxos existentes; onde há painel partilhado, usa-se **drawer à direita** em vez de tela cheia.

## 1. Perfil do contato (substitui o menu dos três pontos)

- No cabeçalho da conversa, o botão **⋯** abre o **perfil do contato** (`ChatContactProfileSheet`), não o menu antigo em lista.
- **Mobile:** painel em **tela cheia** (sheet), com safe area e botão **« Voltar para conversa »** no rodapé (fecha o painel).
- **Desktop:** o mesmo componente abre como **painel lateral** (largura máxima `sm:max-w-md`), com botão fechar padrão do sheet.

### Conteúdo do perfil

- Avatar, nome, telefone.
- Indicação **Cliente**, **Lead** ou **Sem vínculo CRM**.
- **Última interação** (texto relativo, alinhado à lista de conversas).
- **Responsável** e **equipe / fila**, quando existirem na conversa.
- **Etiquetas** derivadas do cadastro (ex.: estágio do funil, grupo do cliente), quando houver.
- **Dados cadastrados** (e-mail, empresa, CPF/CNPJ, notas resumidas no lead).

### Ações rápidas (ordem)

1. **Criar fatura** — só se existir `client_id` na conversa **e** permissão `canCreate('billing')` (módulo **billing** no `ModulePermissionsContext`).
2. **Criar proposta** — se houver cliente ou lead vinculado **e** `canCreate('proposals')`.
3. **Criar contrato** — idem **e** `canCreate('contracts')`.
4. **Transferir atendimento** — mesma regra já usada no chat: conversa em `in_service`, com operador atribuído, e o utilizador é o assignee **ou** admin do tenant (`is_tenant_admin`). Equivale à capacidade de transferência já exposta no header (não há slug `chat.transfer` separado).

**Mais ações:** sincronizar conversa, criar tarefa, abrir ticket, converter lead, vincular / adicionar lead, remover vínculo — com a mesma lógica de visibilidade que existia no dropdown.

**Importante:** se o utilizador **não** tiver permissão de criação, o botão **não** aparece (não fica apenas desativado).

## 2. Fluxos de criação a partir do chat

- Fatura, proposta e contrato continuam **embutidos** no chat (`viewMode`), com cliente/lead pré-preenchidos como antes.
- Em **mobile**, o bloco de criação usa `MobileCommerceScreenLayout`: **cabeçalho fixo** com « Conversa » (volta ao `viewMode` conversa) e título **Nova fatura / Nova proposta / Novo contrato**.
- Em desktop, mantém-se o botão textual **« Voltar para conversa »** acima do formulário.

## 3. Contexto « voltar à conversa » na rota de nova fatura (opcional)

Para abrir **Nova fatura** fora do chat com retorno à conversa, a rota pode incluir:

- `origin=chat`
- `return_to=<path>` — por exemplo `/chat/<conversationId>` ou URL completa interna.

Após **criar** a fatura com sucesso:

- Navegação para o **detalhe** da fatura com `state.chatReturnTo`.
- Na página de detalhe (`CustomerInvoiceDetail`), é mostrado um **alerta** com **« Voltar para conversa »**, que executa `navigate(chatReturnTo)`.

Propostas e contratos em `/proposals/new` e `/contracts/new` podem evoluir com o mesmo padrão (`return_to` + banner) numa iteração seguinte.

## 4. Listagens mobile — faturas, propostas, contratos

- **Faturas:** em `md:hidden`, a tabela dá lugar a **cards** com número, cliente, valor, vencimento, status, indicação assinatura vs avulsa e atalhos **Abrir**, **Copiar link** (quando há `payment_token`), **Pagar / enviar** (link para o detalhe).
- **Propostas e contratos:** já tinham lista em cards no mobile; foram **reforçados** (altura/padding) e, nos contratos, **valor** quando `total_value` está preenchido.
- **Desktop:** tabelas e filtros mantidos.

## 5. Atalhos horizontais (chips)

- **Faturas:** Nova fatura (se `billing` create), Nova assinatura (`/crm-subscriptions`), Fatura por link (`/customer-invoices/new`), Copiar link (primeira fatura com token na página atual), Ver vencidas / Ver pendentes.
- **Propostas:** Nova proposta, Ver abertas (`sent`), Ver aceitas (`accepted`), Templates.
- **Contratos:** Novo contrato (se permissão), Aguardando assinatura (`PENDING_SIGNATURE`), Ver vencidos (`EXPIRED`), Templates.

## 6. Padrão de layout — `MobileCommerceScreenLayout`

Componente em `src/components/mobile/MobileCommerceScreenLayout.tsx`:

- `enabled={true}`: coluna flex com **header** opcional fixo, **corpo** rolável e **footer** opcional com safe area inferior.
- `enabled={false}`: apenas os `children` (sem alterar desktop).

Utilizado no chat (modos de criação) e na página **Nova fatura** standalone em viewport mobile (`fixed inset-0 z-40` + header com voltar que respeita `return_to`).

## 7. Critérios de aceite (checklist)

| Critério | Estado |
|----------|--------|
| Mobile: ⋯ abre perfil em tela cheia | Sim (`ChatContactProfileSheet` + `isMobile`) |
| Perfil mostra dados úteis do contato | Sim |
| Ações rápidas respeitam permissões (ocultar) | Sim (`billing`, `proposals`, `contracts`, transferência) |
| Criar fatura/proposta/contrato no chat mantém contexto | Sim (fluxo embutido) |
| Telas de criação com header fixo no mobile (chat + nova fatura) | Sim |
| Botão voltar à conversa (chat embutido + sheet) | Sim |
| Listas em cards no mobile (faturas; propostas/contratos reforçados) | Sim |
| Header claro nas novas experiências | Sim |
| Desktop não quebrado | Drawer / layout anterior preservado onde aplicável |
| Build a verificar localmente | `npm run build` |

## 8. Testes manuais sugeridos

1. Mobile: conversa com cliente → ⋯ → perfil → Criar fatura → gravar → voltar à conversa.
2. Utilizador sem `billing` create: perfil **sem** botão Criar fatura.
3. Lead sem cliente: perfil **sem** fatura, **com** proposta/contrato se permitido.
4. ` /customer-invoices/new?origin=chat&return_to=/chat/<id>` → após criar, detalhe mostra **Voltar para conversa**.
5. Desktop: ⋯ abre drawer; fechar e regressar à conversa.
