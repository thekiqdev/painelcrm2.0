# Investigação e plano — Webhook UazAPI rejeitado (`production_webhook_secret_rejected`)

**Tipo:** investigação técnica + plano de correção (sem implementação neste documento).  
**Contexto:** Produção multi-tenant SaaS; alguns tenants aceitam webhook, outros recebem `401` com `production_webhook_secret_rejected` / `invalid_secret`.

---

## 1. Mapa do fluxo atual (código)

### 1.1 Rotas HTTP

| Arquivo | Função / o que faz |
|--------|---------------------|
| `packages/backend/src/index.ts` | Monta `app.use('/api/webhooks/uazapi', …)` e `app.use('/webhooks/uazapi', …)` |
| `packages/backend/src/routes/uazapiWebhookRoutes.ts` | `POST *` → `handleWebhook` importado de `chatController`; `GET /` health |

### 1.2 Handler principal

| Arquivo | Função | Responsabilidade |
|---------|--------|------------------|
| `packages/backend/src/controllers/chatController.ts` | `handleWebhook` | Ordem: (1) validação de secret em produção, (2) payload vazio, (3) identificador de instância, (4) resolução `chat_instances`, (5) `200` rápido + processamento async |

### 1.3 Extração do identificador de instância (“external key”)

**Função:** `extractUazWebhookInstanceExternalKey(payload, req)` (mesmo arquivo).

**Fontes consideradas (primeira string não vazia):**

- `payload.instance`
- `payload.instanceName`
- `payload.data.instance`
- `payload.data.instanceName`
- `req.query.instance`
- Header `x-uazapi-instance`

**Persistência da consulta:**  
`SELECT * FROM chat_instances WHERE external_instance_name = $1` com esse valor.

**Tabela:** `chat_instances` (coluna `external_instance_name`).

### 1.4 Candidatos de secret recebidos

**Função:** `collectWebhookSecretCandidates(req)`:

| Fonte | Observação |
|-------|------------|
| `req.query.secret` | Query string (ex.: URL do webhook cadastrada na Uaz) |
| `req.headers['x-uazapi-secret']` | Header explícito |
| `req.headers['x-webhook-secret']`, `x-api-secret` | Alternativas |
| `Authorization: Bearer …` | Trecho após `Bearer` |
| `req.body.secret`, `req.body.data.secret` | JSON |

**Normalização:** `normalizeIncomingWebhookSecret` — trim, aspas, `decodeURIComponent`.

**Comparação:** `webhookSecretsEqual` — **timing-safe**, exige **mesmo comprimento** de strings.

### 1.5 Secrets “configurados” no servidor

**Função:** `getConfiguredWebhookSecrets()`:

- Lê **`process.env.UAZAPI_WEBHOOK_SECRET`** apenas.
- Suporta **vários** secrets separados por **vírgula** (cada um normalizado).

Não há hoje leitura de secret por tenant ou por linha de `chat_instances` nesta função.

### 1.6 Secrets esperados a partir da instância (banco)

Só entram na validação se **`instanceMatchCount === 1`** (exatamente uma linha em `chat_instances` para `external_instance_name`):

| Caminho | Função | O que compara |
|---------|--------|----------------|
| Token da instância | `instanceTokenSecretVariants(instance_token)` + `secretCandidatesMatchAnyVariantCaseRelaxed` | Variantes do `instance_token` (com/sem hífen, prefixos/sufixos 25 chars) |
| Metadata Uaz | `collectMetadataWebhookSecretCandidates(metadata)` | Apenas `metadata.webhook.uazDeliverySecrets` (**array de strings**) |

**Importante:** não há uso de `metadata.webhook_secret` nem coluna dedicada `webhook_secret` neste fluxo — apenas **`metadata.webhook.uazDeliverySecrets`** preenchido após sync com a API Uaz (ver auto-configure).

### 1.7 “Trusted IP”

| Função | Comportamento real |
|--------|---------------------|
| `parseUazWebhookTrustIps()` | Lista em `UAZAPI_WEBHOOK_TRUST_IPS`; se não definido em **production**, default `UAZ_DEFAULT_WEBHOOK_EGRESS_IPV4` (`116.202.152.37`). |
| `clientIpForWebhookTrust(req)` | `X-Forwarded-For` primeiro hop ou `req.ip` / socket. |
| `isUazWebhookTrustedProviderIp(req)` | IP está na lista permitida. |
| **`secretMatchesTrustedIp`** | **`isUazWebhookTrustedProviderIp(req) && secretCandidates.length > 0 && instanceMatchCount === 1`** |

**Diagnóstico conceitual (item 9 do pedido):** O nome `secretMatchesTrustedIp` é **enganoso**: não compara secret ao IP. É uma **exceção**: “se já há candidatos de secret no pedido **e** a instância foi resolvida **e** o IP é de confiança, aceita”. Se `instanceMatchCount === 0`, **trusted IP não ajuda**.

### 1.8 Condição de sucesso do secret (produção com `UAZAPI_WEBHOOK_SECRET` definido)

```text
secretOk =
  secretMatchesEnv
  OR secretMatchesInstanceToken
  OR secretMatchesUazMetadata
  OR secretMatchesTrustedIp
```

Com **`hasConfiguredSecret`** e **`NODE_ENV=production`**, se `secretCandidates.length === 0` **ou** `!secretOk` → **`401`** + log `production_webhook_secret_rejected`.

### 1.9 Configuração automática do webhook (lado PainelCRM → Uaz)

**Função:** `autoConfigureWebhook(instance)` no mesmo `chatController.ts`:

- Monta URL base: `UAZAPI_WEBHOOK_URL` ou `PUBLIC_API_URL + /webhooks/uazapi`.
- Se existe `UAZAPI_WEBHOOK_SECRET`, **acrescenta `?secret=` com esse valor global** na URL enviada à Uaz.
- Chama `uazapiService.configureWebhook` e depois `getWebhook` para extrair **`uazDeliverySecrets`** via `extractWebhookDeliverySecretsFromUazRemote`.
- Persiste em **`metadata.webhook`**: `url`, flags, `uazDeliverySecrets`, `uazDeliverySecretsSyncedAt`, etc.

Ou seja: o sistema **assume** um secret global na URL; o que a Uaz **realmente** envia na entrega pode ser **outro** (maior), sincronizado para `uazDeliverySecrets` **se** o GET após configurar funcionar e o parsing achar os campos.

---

## 2. Diagnóstico a partir dos logs fornecidos

### Sinal A — `configuredSecretLens: [11]`

- O env **`UAZAPI_WEBHOOK_SECRET`** (ou o primeiro segmento) tem **11 caracteres**.
- Os candidatos recebidos têm comprimentos **31 / 33 / 39**.
- `webhookSecretsEqual` exige **mesmo comprimento** → **match com env é impossível** se o único configurado for o de 11 caracteres (a menos que se adicionem os secrets longos também no env, separados por vírgula).

### Sinal B — `distinctCandidateLengths: 31, 33, 39` e `hasQuerySecret: true`

- A Uaz está a mandar secret na **query** (provavelmente o configurado no painel Uaz / URL de callback), **diferente** do valor corto no env.
- `hasXUazapiSecret: false`, `hasBodySecret: false` → validação depende da query (e eventualmente de resolução de instância).

### Sinal C — `instanceRowsForToken: 0` (no código: `instanceMatchCount`)

- A query `chat_instances WHERE external_instance_name = ?` **não devolveu linhas** **ou** o identificador extraído do payload/header/query **não bate** com o valor guardado em `external_instance_name`.
- Com **0 linhas**:
  - `secretMatchesInstanceToken` = false  
  - `secretMatchesUazMetadata` = false (precisa 1 linha + array em metadata)  
  - `secretMatchesTrustedIp` = false (**exige** `instanceMatchCount === 1`)  
- Resta apenas **`secretMatchesEnv`**, que falha pelo **mismatch de comprimento** (11 vs 31/33/39).

### Sinal D — `uazMetaSecretsCount: 0`

- Ou não há instância resolvida, ou **`metadata.webhook.uazDeliverySecrets`** está vazio / ausente / não populado após configure.

### Sinal E — `trustIpsConfigured: true`, mas rejeição mesmo assim

- Com instância **não resolvida** (`instanceMatchCount === 0`), o ramo “trusted IP” **nunca** aceita, mesmo com IP na lista.

### Hipótese consolidada (provável)

1. **Secret de entrega real da Uaz** (comprimentos ~31–39) ≠ **secret global** no env (11).  
2. **Instância não encontrada** pelo identificador enviado no webhook → não há segundo factor (token/metadata).  
3. Opcionalmente, **delivery secrets** nunca sincronizados para `metadata.webhook.uazDeliverySecrets`.

---

## 3. Contrato esperado com a UazAPI (o que o código pressupõe)

Com base só no repositório:

- O callback configurado pelo PainelCRM usa **`/webhooks/uazapi`** (ou prefixo com `PUBLIC_API_URL`) e pode incluir **`?secret=<UAZAPI_WEBHOOK_SECRET>`** global.
- A validação na entrada aceita o mesmo secret em query/header/body **e** variantes do **`instance_token`** **e** valores em **`metadata.webhook.uazDeliverySecrets`**.
- O identificador de instância nos eventos deve alinhar com **`chat_instances.external_instance_name`** (valor que a Uaz envia em `instance` / `instanceName` / header / query conforme implementado).

**Lacuna:** não há no handler atual um parâmetro tipo **`instanceId` UUID do PainelCRM** na URL; a resolução é por **nome externo**, não por `chat_instances.id`. Qualquer divergência de nomenclatura entre Uaz e BD explica `instanceRowsForToken: 0`.

Para o **contrato oficial** da Uaz (nomes exatos de campos na API e no webhook), é necessário cruzar com `docs/uazapi-openapi-spec.yaml` (se existir) e documentação Uaz — **fora do âmbito só do grep**.

---

## 4. Queries de auditoria sugeridas (produção, só leitura)

Adaptar schema se os nomes de colunas diferirem no vosso BD.

### 4.1 Visão geral das instâncias

```sql
SELECT
  id,
  tenant_id,
  name,
  phone_number,
  status,
  length(instance_token::text) AS instance_token_len,
  external_instance_name,
  metadata ? 'webhook' AS has_webhook_meta,
  metadata->'webhook' ? 'uazDeliverySecrets' AS has_uaz_delivery_secrets,
  jsonb_array_length(COALESCE(metadata->'webhook'->'uazDeliverySecrets', '[]'::jsonb)) AS uaz_delivery_secrets_count,
  metadata->'webhook'->>'url' AS webhook_url_preview,
  created_at,
  updated_at
FROM chat_instances
ORDER BY updated_at DESC
LIMIT 200;
```

### 4.2 Instâncias sem webhook metadata útil

```sql
SELECT id, tenant_id, name, status, metadata
FROM chat_instances
WHERE metadata IS NULL
   OR metadata = '{}'::jsonb
   OR NOT (metadata ? 'webhook')
   OR NOT (metadata->'webhook' ? 'uazDeliverySecrets');
```

### 4.3 Distribuição de tamanhos (se passarem a guardar secrets em texto)

Se no futuro existir `metadata->'webhook'->>'webhook_secret'` ou coluna dedicada:

```sql
SELECT length(metadata->'webhook'->>'uazDeliverySecrets') AS dummy;
-- Ajustar quando houver coluna ou campo estável por secret.
```

Para arrays JSON de secrets, pode normalizar em query ou exportar e analisar em ferramenta externa.

---

## 5. Modelo alvo para SaaS (recomendação de plano)

Alinhado ao pedido do utilizador, **sem implementar aqui**:

- **Por conexão** (`chat_instances`): secret próprio de webhook, gerado pelo PainelCRM, guardado de forma estável (**colunas** `webhook_secret`, timestamps **ou** `metadata` versionado).
- URL de callback incluir **`instanceId` (UUID interno)** **e** `secret` **persistido**, para resolver tenant/instância sem ambiguidade.
- Manter **`UAZAPI_WEBHOOK_SECRET`** apenas como **fallback legado** durante migração.
- **Não** usar IP como substituto de secret; no máximo camada adicional **depois** de secret válido ou em modo migração explícito.

---

## 6. Ordem de validação segura desejada (futura implementação)

1. Extrair **`chat_instances.id`** (query/body) **se existir** → carregar linha → validar secret contra essa instância.  
2. Senão, extrair identificador externo atual (`external_instance_name`) → mesma validação.  
3. Fallback controlado: env global **só** para URLs antigas / flag `webhook_needs_reconfiguration`.  
4. Trusted IP: opcional, **não** substituir secret; renomear logs para evitar “secretMatchesTrustedIp” como nome de verificação de secret.

---

## 7. Compatibilidade com tenants antigos

- Instâncias sem `webhook_secret` / sem `uazDeliverySecrets`: não falhar em silêncio; marcar **`needsReconfigure`** (já existe ideia em `autoConfigureWebhook` com `needsReconfigure`).
- Fluxo admin/tenant: **“Reconfigurar webhook”** / **rotate secret** → atualizar Uaz + BD.

---

## 8. Log sanitizado sugerido (Fase A — diagnóstico)

Conforme pedido (nunca logar secret completo):

```ts
console.log('[uaz-webhook-debug]', {
  webhookId,
  queryKeys: Object.keys(req.query || {}),
  hasQuerySecret: Boolean(normalizeIncomingWebhookSecret(req.query?.secret)),
  querySecretLen: String(req.query?.secret ?? '').length,
  hasHeaderSecret: Boolean(req.headers['x-uazapi-secret']),
  bodyTopKeys: Object.keys((req.body && typeof req.body === 'object') ? req.body : {}).slice(0, 20),
  candidateLens: secretCandidates.map((c) => c.length),
  externalKeyPresent: Boolean(extractUazWebhookInstanceExternalKey(payload, req)),
});
```

Ativar só com flag tipo `UAZ_INTEGRATION_VERBOSE` (já existe padrão semelhante no projeto).

---

## 9. Plano por fases (implementação futura)

| Fase | Conteúdo |
|------|----------|
| **A — Diagnóstico** | Logs sanitizados; queries §4; relatório de instâncias sem `uazDeliverySecrets` / com `external_instance_name` órfão |
| **B — Compatibilidade** | Aceitar secret por instância (metadata ou coluna); manter env como fallback; **não** remover validação atual de uma vez |
| **C — Reconfiguração** | Endpoint ou botão “Regenerar secret / reconfigurar webhook”; atualizar URL na Uaz; estado `webhook_needs_reconfiguration` |
| **D — Endurecimento** | Reduzir dependência do env global; documentar rotação; revisar semântica de trusted IP nos logs |

---

## 10. Matriz de testes (aceitação)

| Cenário | Resultado esperado |
|---------|-------------------|
| Tenant A — webhook OK hoje | Continua OK após migração com fallback |
| Tenant B — hoje 401 | Passa após secret por instância + URL correta |
| Secret correto por instância | 200 |
| Secret incorreto | 401 |
| Legado sem `instanceId` novo | Aceite só com fallback env + identificador externo válido |
| IP confiável + secret errado | **401** (IP não substitui secret) |
| Secret correto + proxy interno | 200 se candidatos e validação batem |
| Várias instâncias mesmo tenant | Secrets independentes |
| Vários tenants | Isolamento por instância |
| Rodar secret de uma instância | Outras não afetadas |

---

## 11. Resultado esperado (negócio)

- Fim dos reject por **comparação apenas com secret global curto** quando a Uaz envia secret longo por instância/conta.  
- **Cada** conexão WhatsApp com secret próprio persistido e URL estável.  
- SaaS multi-tenant e multi-instância sem depender só de env.  
- **Sem** bypass global nem webhooks anónimos.

---

## 12. Referências rápidas no código

| Tópico | Local principal |
|--------|------------------|
| `production_webhook_secret_rejected` | `chatController.ts` ~9340 |
| Candidatos / env | `collectWebhookSecretCandidates`, `getConfiguredWebhookSecrets` |
| Instância | `extractUazWebhookInstanceExternalKey`, query `external_instance_name` |
| Metadata secrets | `collectMetadataWebhookSecretCandidates` → `metadata.webhook.uazDeliverySecrets` |
| Auto webhook + sync secrets | `autoConfigureWebhook` ~2201–2360 |
| Trusted IP | `parseUazWebhookTrustIps`, `secretMatchesTrustedIp` |

---

*Documento gerado para apoio à investigação em produção; alterações de código devem seguir revisão e rollout faseado.*
