# Contratos — ajuste UI (aba Links) e correção do vínculo de cliente

## Reorganização da tela de detalhe

- Removido o **banner verde** (“Contrato assinado por todas as partes”) e os botões duplicados no topo.
- Quando todas as assinaturas estão concluídas, mostra-se apenas um **Badge** discreto (“Todas as assinaturas concluídas”) junto ao título e ao estado.
- Removido o **AlertDialog** branco do link de visualização pública; o fluxo foi **absorvido** na nova aba.

## Nova aba **Links**

Ordem das abas: **Detalhes → Assinaturas → Links → Timeline → Anexos**.

### Secção 1 — Visualização pública

- Estado do link (ativo / sem link ativo), data “ativo desde” quando aplicável.
- Botões **Copiar link** e **Abrir link** (habilitados quando existe token na sessão após gerar/regenerar).
- **Opções avançadas** (menu): Gerar e copiar, Regenerar e copiar, Revogar link.

### Secção 2 — Links de assinatura

- Tabela por signatário: nome/e-mail, estado da assinatura, estado do convite, **Copiar**, **Abrir**, menu **⋮** (gerar, regenerar, lembrete, textos, revogar, ampliar assinatura quando assinado).

## O que foi removido ou deslocado

- Card verde e CTA repetidos no topo.
- Item do menu global “Link de visualização pública” substituído por **“Abrir aba Links”** quando faz sentido.
- Colunas **Convite** e **Ações (⋮)** na aba **Assinaturas**; a aba Assinaturas foca assinatura, e-sign e evidências. Convites e operações de link concentrados em **Links**.

## Bug do `client_id` — causa raiz

1. **`ClientSearchCombobox` em modo `remoteSearch`** não recebia `clients`; `selectedFromLocal` ficava sempre vazio, o que podia gerar UX frágil e inconsistência na percepção do valor selecionado.
2. Possível envio de **`client_id` como string vazia** no JSON em alguns cenários: o Zod espera UUID ou omissão; `""` falha na validação e impede persistência correta (ou gera erro 400 conforme o corpo).

## Correção no frontend (`NewContract.tsx`)

- Estado **`linkedClientForCombo`**: ao carregar edição, `getClientById` preenche a lista local; ao selecionar cliente, hidrata de novo — o combobox vê o objeto `Client` e mantém o UUID alinhado à busca global.
- **`handleContractClientChange`** substitui o `onChange` inline.
- Payloads usam **`formData.client_id.trim() || undefined`** para nunca enviar espaços nem string vazia.

## Correção no backend (`contractsController.ts`)

- **`normalizeContractPayload`**: remove chaves `client_id`, `responsible_id`, `template_id`, `linked_proposal_id`, `linked_invoice_id` quando o valor é `""` ou só espaços, antes do `parse` Zod — compatível com POST/PATCH e com `partial()`.

## Riscos remanescentes

- Tokens de link continuam **opacos** e dependem da sessão/browser para copiar sem regenerar.
- Regenerar link de visualização **invalida** o anterior (comportamento já existente).

## Checklist

- [x] Card verde removido  
- [x] Aba Links criada  
- [x] Link público de visualização na aba Links  
- [x] Links de assinatura na aba Links  
- [x] Ações avançadas em menu secundário  
- [x] Cliente persistido com normalização + hidratação  
- [x] Reabrir contrato mostra cliente no combobox (via `getClientById`)  
- [x] `client_id` alinhado à busca global (mesmos UUIDs da API clients)  
