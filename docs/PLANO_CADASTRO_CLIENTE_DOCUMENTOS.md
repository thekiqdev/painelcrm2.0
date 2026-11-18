# Plano — Cadastro do cliente: CPF, CNPJ, RG e empresa

**Data:** 2026-11-18  
**Telas:** lista `/clients` (diálogo de cadastro) e perfil do cliente (cartão Cadastro Completo)  
**Objetivo:** separar CPF e CNPJ, incluir RG, dividir o formulário em Cliente e Empresa, e preencher a razão social ao informar o CNPJ. A cobrança no Asaas continua com um único documento.

---

## 1. Decisões fechadas

| ID | Decisão |
|----|---------|
| D1 | Cliente que já tem valor em `clients.cpf_cnpj` mantém esse número como documento do Asaas. |
| D2 | 11 dígitos migram para `cpf`. 14 dígitos migram para `cnpj`. |
| D3 | O primeiro campo preenchido (CPF ou CNPJ) vira o documento de cobrança. Gravar o segundo não troca a estrela. |
| D4 | A estrela só aparece quando CPF e CNPJ estão os dois preenchidos. Com um só, esse é o documento enviado ao Asaas. |
| D5 | RG e razão social ficam no CRM. O Asaas recebe um único `cpfCnpj`, o da estrela. |
| D6 | A coluna `cpf_cnpj` permanece, sempre igual ao documento de cobrança, até lista, contrato, link de pagamento, loja e chatbot lerem os campos novos. |
| D7 | O campo Empresa atual continua sendo o nome fantasia. Razão social é coluna nova e nasce vazia. O texto de Empresa não é copiado para razão social. |
| D8 | A migração não consulta a Receita. A busca de CNPJ só ocorre quando alguém digita um CNPJ válido no formulário. |
| D9 | Lead, empresa (tenant), onboarding e parceiro continuam com a coluna única `cpf_cnpj` deles. Esta implantação é só `clients`. |

---

## 2. Como o cadastro fica

Dois blocos nas duas telas de edição.

**Cliente:** nome, CPF, RG, e-mail, telefone, situação, grupo, observação.

**Empresa:** CNPJ, razão social, Empresa (nome fantasia, coluna `company` que já existe).

A estrela fica ao lado do CPF ou do CNPJ. Um clique troca o documento das próximas faturas e grava `billing_document` (`cpf` ou `cnpj`).

---

## 3. Como o Asaas se comporta

Cada customer do Asaas tem um `cpfCnpj`. A fatura nova usa este documento:

| Cadastro | O que a cobrança usa |
|----------|----------------------|
| Só CPF | O CPF |
| Só CNPJ | O CNPJ |
| Os dois | O campo com a estrela |
| Nenhum | PIX e boleto seguem bloqueados, como hoje. Fatura Stripe do cliente não exige CPF. |

Fatura já emitida não muda de documento. Assinatura e cobrança em aberto permanecem no customer anterior.

Cliente antigo não troca de customer no Asaas nesta implantação, porque o número enviado continua o que já estava em `cpf_cnpj`.

Se alguém mudar a estrela e o customer do Asaas já tiver cobrança, a tela mostra a falha. O sistema não grava a fatura no documento antigo em silêncio. Hoje `syncCustomerDocument` engole o erro e reutiliza o customer (`paymentCustomersService`). Essa etapa troca esse comportamento.

Loja e link público gravam pelo tamanho (11 em CPF, 14 em CNPJ) e não tomam a estrela de quem já tinha documento.

---

## 4. Etapas

### Etapa 1 — Colunas e migração ✅

Arquivo: `database/init/370_clients_cpf_cnpj_split.sql`.

Nova migration em `database/init`, registrada em `packages/backend/src/startup/migrationOrder.ts` depois de `369_finance_goals_module.sql`.

Colunas em `public.clients`:

| Coluna | Tipo | Uso |
|--------|------|-----|
| `cpf` | TEXT | Só dígitos, 11 |
| `cnpj` | TEXT | Só dígitos, 14 |
| `rg` | TEXT | Texto curto, opcional |
| `razao_social` | TEXT | Nome legal |
| `billing_document` | TEXT | `cpf` ou `cnpj`, nulo se não houver documento |

Classificação de `cpf_cnpj` (só dígitos):

| Dígitos | Destino | `billing_document` |
|---------|---------|--------------------|
| 11 | `cpf` | `cpf` |
| 14 | `cnpj` | `cnpj` |
| vazio | os dois vazios | nulo |
| outro tamanho | permanece só em `cpf_cnpj` | nulo, até alguém corrigir |

`rg` e `razao_social` ficam nulos. Valor com 11 dígitos e dígito verificador inválido ainda vai para `cpf`: a coluna já guarda esse número, e a fatura já recusa na validação (`isValidCpfOrCnpj`). Nada é apagado.

**Aceite:** cliente com CPF continua com `billing_document = cpf` e `cpf_cnpj` igual ao de antes. Cliente com CNPJ, o equivalente. Contagem de linhas com tamanho diferente de 11 e 14 fica registrada no comentário da migration ou num log da execução, sem update destrutivo.

### Etapa 2 — API do cliente ✅

`POST` e `PATCH` de `/api/clients` aceitam `cpf`, `cnpj`, `rg`, `razao_social` e `billing_document`. A regra está em `packages/backend/src/services/clientDocumentFields.ts`.

- CPF: 11 dígitos e dígito válido, senão 400.
- CNPJ: 14 dígitos e dígito válido, senão 400.
- RG: texto até 20 caracteres, opcional.
- Razão social: texto até 200 caracteres, opcional.

Se `billing_document` ainda for nulo, o primeiro documento válido que chegar define a estrela e é copiado para `cpf_cnpj`. Se a estrela já existir, gravar o outro documento não altera `billing_document` nem `cpf_cnpj`.

A busca da lista (`q` em `getClients`) passa a incluir `cpf`, `cnpj`, `rg` e `razao_social`, além de `cpf_cnpj`.

**Aceite:** atualizar só o RG não mexe no documento do Asaas. Incluir o segundo documento deixa a estrela no primeiro.

### Etapa 3 — Formulário Cliente e Empresa ✅

Arquivos: `src/pages/Clients.tsx` (criar e editar no diálogo) e `src/pages/ClientProfile.tsx` (Cadastro Completo, edição e leitura). A estrela usa `src/components/clients/DocumentLabel.tsx`.

Blocos descritos na seção 2. A estrela é um botão ao lado do rótulo, visível só com os dois documentos preenchidos. O estado visual sai de `billing_document`.

`src/services/clients.ts` e `src/utils/clients-helpers.ts` passam a enviar os campos novos. A tela continua exibindo o documento de cobrança formatado.

**Aceite:** cliente antigo abre com o número no campo certo e sem estrela. Preencher o segundo campo mostra a estrela no que já cobrava. Salvar não inverte o documento.

### Etapa 4 — Cobrança ✅

A fatura usa o documento da estrela (`clientBillingDigits`). Link de pagamento, loja e conversão de lead gravam CPF ou CNPJ no campo certo e não reescrevem `cpf_cnpj` quando a estrela já existe. Se o Asaas recusar a troca num customer já vinculado, `updateClient` desfaz a estrela e devolve o erro para a tela.

Pontos que hoje leem `clients.cpf_cnpj` e devem usar o documento da estrela (com `cpf_cnpj` ainda espelhado, a leitura antiga segue correta; o ajuste é não deixar um segundo número sobrescrever o espelho):

- `customerBillingService` (fatura manual, recorrente, link `/pay`, troca de método)
- `invoicePaymentAttemptReuseService`
- `storePublicCheckoutService`
- conversão de lead em `flowCrmConvertActions` e `kanbanColumnAutomationService`

Regra da loja e do link: tamanho 11 grava em `cpf`, 14 em `cnpj`. Se `billing_document` já estiver definido, esses fluxos não trocam a estrela nem reescrevem `cpf_cnpj`.

Troca de estrela com customer já vinculado em `payment_customers`: se o Asaas recusar a atualização do `cpfCnpj`, a API devolve o erro para a tela. Sem fallback silencioso para o documento anterior.

**Aceite:** fatura de cliente que já tinha um documento sai com o mesmo número de antes. Troca de estrela recusada pelo Asaas aparece na interface.

### Etapa 5 — Razão social ao digitar o CNPJ ✅

`GET /api/clients/cnpj-lookup/:cnpj` consulta a Brasil API. O formulário espera o campo fechar e preenche razão social e nome fantasia só quando estão vazios. Falha da consulta não bloqueia o salvamento.

Não existe consulta de CNPJ no repositório. Novo endpoint autenticado, por exemplo `GET /api/clients/cnpj-lookup/:cnpj`, chamado pelo backend na Brasil API (`/api/cnpj/v1/{cnpj}`).

- Só dispara com 14 dígitos e dígito válido.
- Espera curta depois que o campo fecha, para não chamar a cada tecla.
- Preenche razão social somente se o campo estiver vazio.
- Preenche Empresa (nome fantasia) somente se `company` estiver vazio.
- Falha da consulta deixa os campos como estão. O cadastro salva sem a razão social.
- A migração da etapa 1 não percorre a base.

**Aceite:** CNPJ válido com razão social vazia preenche o campo. Razão social já digitada não é substituída. Consulta fora do ar não impede salvar.

### Etapa 6 — Importação ✅

A barra de importação manda CPF, CNPJ, RG e razão social para campos separados. Nome fantasia continua em Empresa. Cliente novo com os dois documentos cobra pelo CPF. A importação só cria cliente, então o `billing_document` de quem já está no CRM não muda.

`src/utils/importClientsCsv.ts` e a barra `ClientImportSheet` deixam de juntar CPF e CNPJ num destino só.

| Coluna da planilha | Destino |
|--------------------|---------|
| CPF | `cpf` |
| CNPJ | `cnpj` |
| RG | `rg` |
| Razão social | `razao_social` |
| Empresa / nome fantasia | `company` |

Nos arquivos de exemplo cada linha tem só um documento, então a estrela fica nele. Linha nova com os dois preenchidos: o primeiro na ordem do bloco Cliente (CPF) e depois Empresa (CNPJ) define a estrela. Reimportar um cliente que já existe não tira o `billing_document` que já cobrava.

**Aceite:** `clientes.xlsx` de exemplo continua gerando CPF em quem tem CPF e CNPJ em quem tem CNPJ, com a estrela nesse único documento.

---

## 5. Ordem

```
Etapa 1  colunas + migração
Etapa 2  API
Etapa 3  formulário Cliente / Empresa + estrela + RG
Etapa 4  cobrança (espelho e erro visível no Asaas)
Etapa 5  consulta de CNPJ → razão social ✅
Etapa 6  importação ✅
```

As etapas 1 a 6 entregam o cadastro, a cobrança no documento da estrela, a razão social ao digitar o CNPJ e a importação separada.

## 6. Fora desta implantação

- Separar CPF e CNPJ de tenant, lead, onboarding ou parceiro.
- Consultar a Receita para todos os CNPJs já salvos.
- Enviar RG ou razão social ao Asaas.
- Segundo customer no Asaas para o mesmo cliente. A estrela escolhe o documento do customer único. Cobrança em aberto permanece no customer em que foi criada.
- Campos de inscrição estadual, inscrição municipal e data de nascimento.
