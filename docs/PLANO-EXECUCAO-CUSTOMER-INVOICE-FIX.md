# Plano de execução — Correção do fluxo Customer Invoice

**Objetivo:** Organizar a implementação em fases seguras, testáveis e controladas, com base na auditoria funcional (`AUDITORIA-FUNCIONAL-CUSTOMER-INVOICE-FLOW.md`).

**Regras:** Não pular etapas; testar cada fase antes de avançar; manter fases independentes e reversíveis quando possível.

---

## Ordem de prioridade geral

1. **Tornar CPF/CNPJ funcional** (backend → frontend → perfil).
2. **Corrigir problema "gateway não configurado"** (UX e critério).
3. **Melhorar validações e consistência** (normalização e mensagens).

---

## Fase 1 – Suporte a CPF/CNPJ no backend

### Objetivo da fase

Permitir que a API de clientes **aceite e persista** o campo `cpf_cnpj` na criação e na atualização de clientes, para que a pré-condição “Cliente possui CPF/CNPJ” possa ser atendida via fluxo normal.

### Arquivos a modificar

- `packages/backend/src/controllers/clientsController.ts`

### O que deve ser alterado (alto nível)

1. **Schema de validação (`clientSchema`)**  
   - Incluir `cpf_cnpj` como campo opcional (string, permitir vazio/null).

2. **createClient**  
   - Incluir `cpf_cnpj` no objeto que monta os dados limpos (`cleanData`).  
   - Tratar string vazia como `null`.  
   - Incluir a coluna `cpf_cnpj` na lista de colunas do `INSERT` e o valor correspondente na lista de parâmetros.  
   - Garantir que a ordem dos parâmetros no `INSERT` permaneça correta.

3. **updateClient**  
   - O `clientSchema.partial().parse(req.body)` já permitirá `cpf_cnpj` assim que o campo for adicionado ao schema.  
   - O UPDATE dinâmico (Object.entries) passará a incluir `cpf_cnpj` quando enviado.  
   - Garantir que valor vazio seja persistido como `null` (e não string vazia), se for o padrão do banco.

Nenhuma migration é necessária: a coluna `cpf_cnpj` já existe em `clients` (migration 72).

### Riscos envolvidos

- **Baixo:** Campo é opcional e nullable; clientes existentes continuam com `cpf_cnpj` null.  
- **Atenção:** Qualquer cliente que a API retorne (GET lista/detalhe) já pode incluir `cpf_cnpj` (SELECT c.*); garantir que o frontend não quebre se o valor vier null/undefined.

### Como testar (passo a passo)

1. **Backend rodando** (ex.: `npm run dev` no backend).
2. **Criar cliente com CPF/CNPJ (API):**  
   - Enviar `POST /api/clients` com body contendo `cpf_cnpj` (ex.: `"12345678901"` ou com pontuação).  
   - Verificar status 201 e que o JSON retornado inclui `cpf_cnpj` com o valor persistido (ou normalizado, se já houver normalização nesta fase).  
3. **Criar cliente sem CPF/CNPJ:**  
   - `POST /api/clients` sem `cpf_cnpj` ou com `cpf_cnpj: null`.  
   - Verificar que o cliente é criado e `cpf_cnpj` vem null ou ausente.  
4. **Atualizar cliente (PATCH):**  
   - `PATCH /api/clients/:id` com `cpf_cnpj` preenchido para um cliente existente.  
   - Verificar 200 e que `GET /api/clients/:id` retorna o `cpf_cnpj` atualizado.  
5. **Atualizar removendo CPF/CNPJ:**  
   - `PATCH /api/clients/:id` com `cpf_cnpj: null` ou `""`.  
   - Verificar que o valor é removido/zerado no banco (conforme regra definida).  
6. **GET lista e GET por id:**  
   - Confirmar que as respostas incluem o campo `cpf_cnpj` quando existir (e null quando não houver).

Critério de sucesso da Fase 1: a API aceita e persiste `cpf_cnpj` em create e update; GET continua funcionando e expõe o campo.

---

## Fase 2 – Suporte a CPF/CNPJ no frontend

### Objetivo da fase

Permitir que o usuário **informe e edite** CPF/CNPJ do cliente nas telas de listagem de clientes (criar e editar cliente), de forma que os dados sejam enviados para a API e a pré-condição de fatura possa ser atendida.

### Arquivos a modificar

- `src/services/clients.ts`
- `src/pages/Clients.tsx`

### O que deve ser alterado (alto nível)

1. **Tipo `Client` (`src/services/clients.ts`)**  
   - Adicionar propriedade opcional `cpf_cnpj?: string` (ou `string | null`) na interface `Client`.

2. **Página `Clients.tsx`**  
   - **Estado do novo cliente (`newClient`):** Incluir campo `cpf_cnpj` (ex.: string vazia inicial).  
   - **Estado do cliente em edição (`editedClient`):** Incluir `cpf_cnpj`, preenchido ao abrir o modal de edição a partir do cliente selecionado (ex.: `selectedClient.cpf_cnpj ?? ""`).  
   - **Formulário de criação (modal/página “Novo cliente”):** Adicionar um campo de input (label “CPF/CNPJ” ou “CPF ou CNPJ”), controlado pelo estado, posicionado de forma consistente com os demais campos (ex.: após telefone ou empresa).  
   - **Formulário de edição (modal “Editar cliente”):** Adicionar o mesmo campo, vinculado a `editedClient.cpf_cnpj`.  
   - **Envio ao backend:** Incluir `cpf_cnpj` no payload de `createClient` (ao adicionar cliente) e no payload de `updateClient` (ao salvar edição). Tratar string vazia como null ou omitir, conforme contrato da API.  
   - **Reset do formulário:** Ao fechar o modal de novo cliente ou após criar com sucesso, resetar `cpf_cnpj` junto com os demais campos.

Não é obrigatório implementar máscara ou validação de formato nesta fase; pode ser apenas um input de texto. Máscara/validação ficam para a Fase 5.

### Riscos envolvidos

- **Baixo:** Campo opcional; se o backend não retornar `cpf_cnpj` em algum cliente antigo, usar fallback (ex.: `""` ou `undefined`) para evitar erro de leitura.  
- **Compatibilidade:** Garantir que o payload enviado (create/update) não inclua chaves undefined que possam ser rejeitadas pelo backend; enviar `null` ou omitir quando vazio, conforme definido na Fase 1.

### Como testar (passo a passo)

1. **Frontend e backend rodando.**  
2. **Criar cliente pela UI:**  
   - Abrir a página de clientes; abrir o modal/formulário de novo cliente.  
   - Preencher nome e CPF/CNPJ (ex.: 12345678901 ou 12.345.678/0001-90).  
   - Salvar.  
   - Verificar que o cliente aparece na lista e que, ao abrir edição ou detalhe, o CPF/CNPJ está preenchido.  
3. **Editar cliente existente:**  
   - Selecionar um cliente; abrir edição.  
   - Preencher ou alterar o CPF/CNPJ; salvar.  
   - Recarregar ou reabrir o cliente e confirmar que o valor foi persistido.  
4. **Cliente sem CPF/CNPJ:**  
   - Criar ou editar cliente deixando CPF/CNPJ em branco; salvar.  
   - Verificar que não há erro e que a API recebe o valor correto (null ou omitido).  
5. **Integração com pré-condições:**  
   - Para um cliente que agora tem CPF/CNPJ preenchido, abrir “Nova Fatura”, selecionar esse cliente e verificar se o checklist de pré-requisitos mostra “Cliente possui CPF/CNPJ” como atendido (após o gateway estar ok ou em fase posterior).

Critério de sucesso da Fase 2: o usuário consegue informar e editar CPF/CNPJ na tela de clientes e os dados são persistidos via API; o checklist de faturas reflete o valor quando aplicável.

---

## Fase 3 – Integração no perfil do cliente

### Objetivo da fase

Exibir o CPF/CNPJ na **página de perfil do cliente** e, se houver edição nessa tela, permitir alterá-lo; caso a edição seja feita apenas na lista, garantir que o perfil mostre o valor retornado pela API (GET por id).

### Arquivos a modificar

- `src/pages/ClientProfile.tsx`

### O que deve ser alterado (alto nível)

1. **Exibição do CPF/CNPJ**  
   - Na área onde são mostrados dados do cliente (nome, empresa, e-mail, telefone), adicionar uma linha ou bloco para “CPF/CNPJ” (ou “CPF ou CNPJ”), exibindo `client.cpf_cnpj` quando existir e um texto como “Não informado” ou “—” quando for null/vazio.  
   - Garantir que o componente só acesse `client.cpf_cnpj` após o cliente estar carregado e que valores null/undefined não quebrem a UI.

2. **Edição (se aplicável)**  
   - Se na mesma página existir formulário de edição de dados do cliente (ou modal de edição), incluir o campo `cpf_cnpj` nesse formulário e no payload de atualização (ex.: `clientsService.updateClient(client.id, { ... })`).  
   - Se a edição for feita apenas na lista (`Clients.tsx`), não é obrigatório ter campo editável no perfil; basta exibir. O link “Editar cliente” no checklist de faturas pode continuar levando à lista ou ao perfil, desde que em algum fluxo o usuário consiga editar o CPF/CNPJ (já coberto na Fase 2).

### Riscos envolvidos

- **Baixo:** Apenas leitura e eventualmente escrita de um campo opcional; cliente já carregado via GET por id, que passa a incluir `cpf_cnpj` (já retornado pelo backend com `SELECT c.*`).

### Como testar (passo a passo)

1. **Cliente com CPF/CNPJ:**  
   - Garantir um cliente com `cpf_cnpj` preenchido (via API ou pela UI da Fase 2).  
   - Abrir o perfil desse cliente (`/clients/:id` ou equivalente).  
   - Verificar que o CPF/CNPJ é exibido corretamente.  
2. **Cliente sem CPF/CNPJ:**  
   - Abrir o perfil de um cliente sem CPF/CNPJ.  
   - Verificar que não há erro e que aparece “Não informado” ou equivalente.  
3. **Edição no perfil (se implementada):**  
   - Alterar o CPF/CNPJ no perfil e salvar.  
   - Recarregar a página e confirmar que o valor foi persistido.  
4. **Link “Editar cliente” no modal de faturas:**  
   - No fluxo “Nova Fatura”, para um cliente sem CPF/CNPJ, clicar em “Editar cliente” e verificar que o destino (lista ou perfil) permite editar e que, após preencher CPF/CNPJ e salvar, o checklist de pré-requisitos passa a mostrar o item como atendido ao reabrir o modal (ou ao trocar de cliente e voltar).

Critério de sucesso da Fase 3: o perfil do cliente exibe o CPF/CNPJ de forma consistente com a API; se houver edição no perfil, o valor é persistido.

---

## Fase 4 – Ajuste de UX do gateway (“configurado” vs “testado”)

### Objetivo da fase

Alinhar a expectativa do usuário com o comportamento do sistema: deixar claro quando o gateway está apenas “salvo” e quando está “configurado e testado” para emissão de faturas; ou alterar o critério de “configurado” nas pré-condições para não exigir teste, mantendo o uso de config testada apenas na hora de criar cobrança.

### Arquivos a modificar (dependem da opção escolhida)

**Opção A – Manter exigência de teste e melhorar mensagens**

- `src/pages/CustomerInvoices.tsx` (textos do checklist no modal “Nova Fatura — Pré-requisitos”).
- Componentes de configuração de gateway do tenant (ex.: `src/pages/settings/PaymentsPanelPage.tsx`, `src/components/settings/PaymentGatewayCard.tsx` ou equivalente onde existir texto sobre “configurado” / “testar”).

**Opção B – Relaxar critério “configurado” apenas no checklist**

- `packages/backend/src/services/customerInvoicePreconditions.ts` (função `validateInvoicePreconditions`).
- Possivelmente `packages/backend/src/services/paymentGatewayConfigService.ts` se for criada uma função auxiliar (ex.: “existe config tenant com credencial?”) que não exija `status = 'active'`.
- `src/pages/CustomerInvoices.tsx` (textos do checklist, se necessário).

### O que deve ser alterado (alto nível)

**Opção A – Apenas UX e mensagens**

1. **Checklist no modal de Nova Fatura**  
   - No item do gateway, trocar o texto de “Gateway de pagamento configurado” para algo como “Gateway de pagamento configurado e testado” (ou “Gateway configurado e conexão testada”).  
   - Manter os ícones ✔/❌ e o link “Configurar gateway” quando não atendido; o link pode levar à tela onde o usuário salva a config e executa “Testar conexão”.

2. **Tela de configuração do gateway (tenant)**  
   - Adicionar texto explicativo próximo ao botão “Testar conexão”: que é necessário salvar e em seguida testar a conexão para que o gateway fique ativo para emissão de faturas de clientes.  
   - Opcional: indicar na mesma tela que “Gateway ativo para faturas” só após teste bem-sucedido.

Nenhuma alteração na lógica de `getActiveConfig` ou na persistência de `status`.

**Opção B – Critério “configurado” no checklist**

1. **Backend – pré-condições**  
   - Em `validateInvoicePreconditions`, para determinar “gateway configurado”, não usar apenas `getActiveConfig('crm', tenantId)`.  
   - Usar um critério mais fraco: por exemplo, verificar se existe config do tenant com `is_active = true` e credencial (ex.: `api_key`) preenchida. Isso pode ser uma nova função no `paymentGatewayConfigService` (ex.: “getTenantConfigForPrecondition” ou reutilizar algo como `getConfigForTest('tenant', tenantId)` sem filtrar por status) e considerar “configurado” se retornar config.  
   - Manter inalterado o uso de `getActiveConfig('crm', tenantId)` no **customerBillingService** (criação de cobrança), para que a cobrança só use config com `status = 'active'`.

2. **Frontend – checklist**  
   - Texto pode permanecer “Gateway de pagamento configurado” (já que “configurado” passará a significar “tem config com credencial”).  
   - Opcional: tooltip ou texto auxiliar explicando que, para cobrança, é recomendado testar a conexão na configuração.

Escolha da opção: definir entre A (só mensagens) ou B (mudar critério no backend para o checklist). Não implementar as duas ao mesmo tempo para o mesmo critério.

### Riscos envolvidos

- **Opção A:** Nenhum risco de regressão de lógica; apenas texto. Usuário pode continuar confuso se não ler a mensagem.
- **Opção B:** Risco baixo se a alteração for apenas em `validateInvoicePreconditions` e o critério de “configurado” for “existe config com credencial”. O fluxo de criar cobrança continua usando `getActiveConfig`, então não se usa config não testada para cobrança.

### Como testar (passo a passo)

**Opção A**

1. Com gateway salvo mas **sem** ter clicado em “Testar conexão” (status permanece `pending`): abrir “Nova Fatura”, selecionar cliente com CPF/CNPJ; verificar que o checklist mostra texto do tipo “Gateway configurado e testado” com ❌ e link para configurar/testar.  
2. Na tela de configuração do gateway, verificar que o texto explicativo sobre “salvar e testar” está visível.  
3. Executar “Testar conexão” com sucesso; em seguida, no modal de Nova Fatura, verificar que o item do gateway passa a ✔.

**Opção B**

1. Com gateway salvo e **sem** ter executado “Testar conexão”: abrir “Nova Fatura”, selecionar cliente com CPF/CNPJ; verificar que o checklist mostra “Gateway configurado” como ✔ (porque existe config com credencial).  
2. Verificar que o botão “Continuar” é habilitado (desde que o cliente tenha CPF/CNPJ).  
3. Ao criar a fatura, o backend deve usar `getActiveConfig` para a cobrança; se a config estiver apenas com credencial e sem `status = 'active'`, o fluxo de criação de cobrança pode falhar — nesse caso, a Opção B deve ser combinada com “considerar config como utilizável para cobrança apenas se status = 'active'”, mantendo a regra atual de cobrança e relaxando só o checklist.  
4. Executar “Testar conexão” com sucesso e criar uma fatura de teste; verificar que a cobrança foi criada no gateway.

Critério de sucesso da Fase 4: o usuário entende quando o gateway está “configurado” (e, se Opção A, “testado”); ou o checklist não exige mais teste para mostrar “configurado”, e a cobrança continua segura.

---

## Fase 5 – Validação e normalização de dados

### Objetivo da fase

Garantir que o CPF/CNPJ seja armazenado de forma consistente (apenas dígitos) e que a experiência do usuário seja melhor com validação e, opcionalmente, máscara; reduzir erros de digitação e incompatibilidade com o gateway.

### Arquivos a modificar

- `packages/backend/src/controllers/clientsController.ts`
- `src/pages/Clients.tsx` (e, se houver campo de CPF/CNPJ editável, `src/pages/ClientProfile.tsx`)
- Opcional: componente reutilizável de input CPF/CNPJ ou máscara (ex.: em `src/components/...`).

### O que deve ser alterado (alto nível)

1. **Backend – normalização**  
   - No create e no update de clientes, ao receber `cpf_cnpj`:  
     - Remover caracteres não numéricos (ex.: `replace(/\D/g, '')`).  
     - Se o resultado for string vazia, persistir `null`.  
     - Caso contrário, persistir apenas os dígitos (e opcionalmente validar tamanho 11 ou 14 antes de persistir).

2. **Backend – validação (opcional)**  
   - Se o valor normalizado tiver tamanho diferente de 11 e diferente de 14, rejeitar com 400 e mensagem clara (ex.: “CPF/CNPJ deve ter 11 (CPF) ou 14 (CNPJ) dígitos”).  
   - Opcional: validação de dígitos verificadores para CPF/CNPJ; pode ficar para iteração futura.

3. **Frontend – máscara (opcional)**  
   - No(s) campo(s) de CPF/CNPJ em `Clients.tsx` (e em `ClientProfile.tsx` se houver edição): aplicar máscara de exibição (ex.: 000.000.000-00 para 11 dígitos, 00.000.000/0000-00 para 14).  
   - O valor enviado à API pode ser só dígitos (frontend envia já normalizado) ou com pontuação (e o backend normaliza); o importante é o backend persistir apenas dígitos.

4. **Frontend – validação (opcional)**  
   - Validação em tempo real ou no submit: tamanho 11 ou 14 dígitos após remoção de não dígitos; mensagem de erro amigável.  
   - Não bloquear envio se o campo for opcional; apenas quando o usuário preencher algo inválido.

### Riscos envolvidos

- **Normalização:** Valores já salvos com pontuação (se existirem) podem ser exibidos “diferentes” após normalização no próximo update; para dados novos não há impacto.  
- **Validação estrita:** Rejeitar CPF/CNPJ inválido pode impedir cadastros legados ou de outros países; decidir se a validação é só de tamanho ou também de algoritmo.

### Como testar (passo a passo)

1. **Backend – normalização**  
   - Enviar `POST /api/clients` com `cpf_cnpj: "123.456.789-01"`. Verificar que no banco ou na resposta o valor está como `12345678901`.  
   - Enviar `cpf_cnpj: "12.345.678/0001-90"`. Verificar persistência como 14 dígitos.  
   - Enviar `cpf_cnpj: ""` ou só espaços; verificar que é persistido como null.

2. **Backend – validação (se implementada)**  
   - Enviar `cpf_cnpj` com 10 ou 12 dígitos; verificar 400 e mensagem de erro.  
   - Enviar 11 ou 14 dígitos; verificar sucesso.

3. **Frontend – máscara**  
   - Digitar no campo CPF/CNPJ e verificar que a formatação aparece (e que o valor enviado ou o valor persistido está correto).  
   - Criar/editar cliente e verificar que o gateway (e o endpoint de pré-condições) continua considerando o cliente com CPF/CNPJ quando preenchido corretamente.

4. **Pré-condições e cobrança**  
   - Garantir que um cliente com CPF/CNPJ normalizado (só dígitos) continua passando na pré-condição e que a criação de fatura/cobrança no gateway segue funcionando (ex.: Asaas recebe o documento correto).

Critério de sucesso da Fase 5: CPF/CNPJ é armazenado apenas com dígitos; validação e máscara (se implementadas) funcionam sem quebrar create/update nem o fluxo de faturas.

---

## Resumo das fases e dependências

| Fase | Objetivo principal        | Depende de   | Teste rápido de conclusão                    |
|------|---------------------------|-------------|----------------------------------------------|
| 1    | CPF/CNPJ na API (create/update) | Nada        | POST/PATCH com `cpf_cnpj` e GET retornando o campo |
| 2    | CPF/CNPJ na UI (lista/clientes) | Fase 1      | Criar/editar cliente com CPF/CNPJ pela tela  |
| 3    | CPF/CNPJ no perfil       | Fase 1 (e 2 para ter dados) | Ver valor no perfil (e edição se houver)     |
| 4    | UX gateway               | Nada        | Checklist e/ou config com mensagens corretas |
| 5    | Normalização e validação | Fase 1 e 2  | Persistência só dígitos; máscara/validação   |

---

## Ordem recomendada de execução

1. **Fase 1** → testar → commit (ex.: “feat(clients): API aceita e persiste cpf_cnpj”).
2. **Fase 2** → testar → commit (ex.: “feat(clients): UI criar/editar cliente com CPF/CNPJ”).
3. **Fase 3** → testar → commit (ex.: “feat(clients): exibir CPF/CNPJ no perfil do cliente”).
4. **Fase 4** → testar → commit (ex.: “fix(billing): UX gateway configurado vs testado”).
5. **Fase 5** → testar → commit (ex.: “feat(clients): normalização e validação CPF/CNPJ”).

Fases 1, 2 e 3 podem ser validadas em conjunto no fluxo “Nova Fatura” (pré-requisitos + criação). A Fase 4 pode ser feita em paralelo ou após as fases 1–3. A Fase 5 deve ser feita após o fluxo básico de CPF/CNPJ estar estável (após 1 e 2).

---

**Documento pronto para uso na implementação fase a fase, sem escrita de código neste momento.**
