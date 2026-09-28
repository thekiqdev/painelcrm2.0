# Correção: resolução de instância no webhook do chat (Etapa 1)

## Problema

O handler do webhook da UazAPI resolvia `chat_instances` assim:

1. Busca por `external_instance_name = $1` com `LIMIT 1`.
2. **Fallback inseguro:** `WHERE name = $1 LIMIT 1`.

Como a restrição no banco é `UNIQUE(user_id, name)` e **não** unicidade global de `name`, dois usuários (tenants diferentes) podem ter instância com o **mesmo** `name`. O `LIMIT 1` escolhia uma linha **arbitrária**, permitindo gravar conversas/mensagens na instância **de outro tenant**.

## Causa

- Identificador enviado pelo provedor foi tratado como equivalente ao `name` local quando `external_instance_name` não batia.
- `name` não é chave global; o fallback violava isolamento lógico multi-tenant na **escrita** via webhook.

## Antes / depois

| Aspecto | Antes | Depois |
|--------|--------|--------|
| Match de instância | `external_instance_name` **ou** `name` | **Somente** `external_instance_name` |
| Zero resultados | Log com amostra de até 10 instâncias | Log mínimo: `instanceName`, `reason: instance_not_found` |
| Vários resultados | Impossível com `LIMIT 1` (silencioso se duplicado no DB) | **409** + log **critical** `duplicate_external_instance_name` |
| Secret em produção | Opcional mesmo com env configurado | Se `NODE_ENV=production` **e** `UAZAPI_WEBHOOK_SECRET` definido: secret **obrigatório** e deve coincidir |
| Secret em produção ausente | — | **WARNING** forte no log; webhook **continua** aceito (não quebra deploy atual) |
| Não produção | Comportamento anterior preservado (valida se ambos enviados; permite sem recebido) | Mantido para dev/staging |

## Impacto

- **Positivo:** elimina associação incorreta de instância por colisão de `name`.
- **Operacional:** instâncias cuja UazAPI envia apenas um valor que estava gravado só em `name` (e `external_instance_name` vazio/diferente) **deixam de receber** webhook até alinhar dados: preencher `external_instance_name` igual ao identificador que o provedor envia (ou reconfigurar instância). O valor recebido é normalizado com `trim()` antes da busca.
- **Performance:** índice parcial `88_chat_instances_external_name_index.sql` em `external_instance_name` para lookup do webhook.

## Arquivos

- `packages/backend/src/controllers/chatController.ts` — `handleWebhook`
- `database/init/88_chat_instances_external_name_index.sql` — índice (não único)
- `packages/backend/src/migrate.ts` — ordem da migration

## Como validar

### 1. Webhook com instância válida

- Ter `chat_instances.external_instance_name` igual ao valor que a UazAPI envia (`instance` / header / etc.).
- Enviar POST do webhook (ou simular com o mesmo payload).
- **Esperado:** `200`, `received: true`, processamento assíncrono como antes.

### 2. Webhook com instância inválida (desconhecida)

- Identificador que **não** existe em `external_instance_name`.
- **Esperado:** `404`, corpo `Instance not registered`, log com `reason: instance_not_found` (sem listar outras instâncias).

### 3. Duas instâncias com o mesmo `external_instance_name` (dados ruins)

- Inserir duplicata em teste ou detectar em staging.
- **Esperado:** `409`, `Ambiguous instance configuration`, log `severity: critical`, `duplicate_external_instance_name`. **Nenhum** processamento de mensagem.

### 4. Dois tenants com o mesmo `name` interno, `external_instance_name` distintos

- Garantir que o provedor envia o **external** correto para cada um.
- **Esperado:** cada webhook atualiza **sua** instância; **não** há mistura (o cenário de risco antigo era mesmo `name` no fallback).

### 5. Produção + secret configurado

- `NODE_ENV=production`, `UAZAPI_WEBHOOK_SECRET` definido.
- Requisição **sem** secret ou secret errado → **401**.
- Requisição com secret correto → segue fluxo normal.

### 6. Produção sem secret configurado

- **Esperado:** log `UAZAPI_WEBHOOK_SECRET_NOT_SET_IN_PRODUCTION` (WARNING), request ainda processada se demais validações OK — até configurarem o secret.

## Regra adotada

Em dúvida na resolução de instância: **falhar** (não processar), **nunca** escolher linha ambígua ou por `name` global.
