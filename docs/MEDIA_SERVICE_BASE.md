# MediaService Base (Prompt 2)

## Objetivo

Criar a camada base de media no backend para:

- padronizar `storageKey`;
- centralizar assinatura/leitura de mídia;
- permitir storage local hoje e adapter cloud no futuro;
- manter compatibilidade com endpoints antigos.

Sem migração de módulos nesta fase.

## Estrutura criada

- `packages/backend/src/services/media/mediaTypes.ts`
- `packages/backend/src/services/media/mediaConfig.ts`
- `packages/backend/src/services/media/mediaStorageKey.ts`
- `packages/backend/src/services/media/mediaUrlSigner.ts`
- `packages/backend/src/services/media/mediaLocalStorageAdapter.ts`
- `packages/backend/src/services/media/mediaGuards.ts`
- `packages/backend/src/services/media/mediaService.ts`
- `packages/backend/src/services/media/mediaController.ts`
- `packages/backend/src/services/media/mediaRoutes.ts`

## Configuração

- `MEDIA_STORAGE_ROOT` (default: `storage/media`)
- `MEDIA_SIGNING_SECRET` (fallback para `CATALOG_MEDIA_PUBLIC_TOKEN_SECRET` e depois `JWT_SECRET`)
- `MEDIA_MAX_FILE_BYTES` (default: 8MB)
- `MEDIA_ASSETS_WRITE_ENABLED` (default: desligado; controla indexação automática em `media_assets`)
- `MEDIA_SIMPLE_UPLOADS_SERVICE_ENABLED` (default: `false`) — quando `true`, **novos** uploads de avatar de perfil, logos da empresa (claro/escuro) e logo da loja passam por `saveFromBuffer`, URL relativa `/api/media/v1/raw?...`, registo em `media_assets` (`writeAssetRecord`); com `false` mantém-se o fluxo catalog (`/api/public/catalog-media/raw?...`). Não há migração de ficheiros antigos.
- `MEDIA_AVATAR_WHATSAPP_ENABLED` (default: `false`; migrar cache de avatar CDN → MediaService + `media_assets` apenas quando explicitamente ligado)
- **Worker gradual (automático)** — só corre se **ambos** `MEDIA_AVATAR_WHATSAPP_ENABLED` e `MEDIA_AVATAR_WHATSAPP_WORKER_ENABLED` estiverem ligados:
  - `MEDIA_AVATAR_WHATSAPP_WORKER_ENABLED` (default: `false`)
  - `MEDIA_AVATAR_WHATSAPP_WORKER_LIMIT` (default: `20`, máx. 500 por ciclo)
  - `MEDIA_AVATAR_WHATSAPP_WORKER_INTERVAL_MINUTES` (default: `30`)
  - `MEDIA_AVATAR_WHATSAPP_WORKER_MAX_FAILURES` (default: `3`)

Colunas e métricas do worker: migration `206_chat_avatar_cache_worker.sql` (`avatar_cache_attempts`, `avatar_cache_last_error`, `avatar_cache_next_retry_at`, tabela `whatsapp_avatar_cache_worker_state`). Estado na UI: Super Admin → Avançado → Scripts (cartão **Automação de cache de avatares WhatsApp**).

Em produção, secret fraco/ausente lança erro no primeiro uso da assinatura.

## Padrão de storageKey

Formato:

`tenants/{tenantId}/{scope}/{ownerType}/{ownerId}/{uuid}.{ext}`

Sem `ownerId`:

`tenants/{tenantId}/{scope}/{ownerType}/unassigned/{uuid}.{ext}`

Regras:

- nome final sempre UUID;
- extensão inferida do mime type (ou fallback seguro);
- sem uso do nome original como chave;
- sem path traversal.

## Endpoint novo

`GET /api/media/v1/raw?k=...&s=...`

- `k`: storage key em base64url.
- `s`: assinatura HMAC SHA-256 estável.
- valida assinatura e caminho.
- lê via adapter local.
- retorna `Cache-Control: public, max-age=31536000, immutable`.
- erros:
  - `400` para parâmetro/assinatura inválidos.
  - `404` para arquivo inexistente.

## Uso de `saveFromBuffer`

```ts
const saved = await saveFromBuffer({
  tenantId: 'tenant-id',
  ownerType: 'product',
  ownerId: 'product-id',
  scope: 'product_image',
  buffer: fileBuffer,
  mimeType: 'image/webp',
});
```

Retorna:

- `storageKey`
- `relativeUrl` (sempre `'/api/media/v1/raw?...'`)
- `checksum` (sha256)
- `sizeBytes`

## Uso de `cacheRemoteUrl`

- aceita apenas `http/https`;
- timeout de download;
- valida content-type básico;
- valida tamanho máximo;
- salva internamente via `saveFromBuffer`;
- em erro retorna `{ ok: false, reason }`.

## O que ainda não migrou por completo

- chat attachments;
- catálogo/produtos (fluxo legado de upload);
- uploads existentes fora do MediaService.

**Avatar WhatsApp:** migração opcional por flag (`MEDIA_AVATAR_WHATSAPP_ENABLED`). Com flag `false`, o fluxo continua no catálogo local histórico; com flag `true`, o cache remoto usa `cacheRemoteUrl` e URLs `/api/media/v1/raw?...` (ver checklist abaixo).

**Indexação:** a tabela `media_assets` existe (Prompt 3); gravação controlada por `MEDIA_ASSETS_WRITE_ENABLED` ou `writeAssetRecord`. No fluxo de avatar com flag ligada, o backend pode forçar registro no asset para esse caminho.

## Endpoint de teste controlado

`POST /api/superadmin/advanced/media/test-save-buffer`

Retorna:

- `storageKey`
- `relativeUrl`
- `checksum`
- `sizeBytes`

## Rollback

1. remover montagem da rota `/api/media` no `index.ts`;
2. remover endpoint de teste em `superadminRoutes.ts`;
3. manter arquivos antigos (`/api/public/catalog-media/raw`, `/media/catalog`) intactos;
4. excluir pasta `services/media` se necessário.

## Validação controlada — avatar WhatsApp (`MEDIA_AVATAR_WHATSAPP_ENABLED`)

### Política de ambientes

- **Produção:** manter `MEDIA_AVATAR_WHATSAPP_ENABLED=false` até haver validação final explícita em staging (comportamento legado inalterado).
- **Local / staging:** definir `MEDIA_AVATAR_WHATSAPP_ENABLED=true` para exercitar o novo caminho (download CDN → `cacheRemoteUrl` → storage local → URL assinada).

Variáveis recomendadas em staging ao testar avatar:

- `MEDIA_AVATAR_WHATSAPP_ENABLED=true`
- `MEDIA_STORAGE_ROOT` apontando para diretório persistente (ou default documentado).
- `MEDIA_SIGNING_SECRET` forte e estável (ou fallback aceite apenas em dev).

Opcional: `MEDIA_ASSETS_WRITE_ENABLED=true` para indexação genérica; **sem isso**, o fluxo de avatar ainda pode registrar em `media_assets` quando o código passa gravação forçada do asset para esse caso.

### Como validar `/api/media/v1/raw` no Network (DevTools)

1. Abrir o Chat / lista de conversas após sincronizar uma conversa com foto na CDN WhatsApp.
2. No separador **Network**, filtrar por `raw` ou por `media`.
3. Confirmar um pedido **GET** ao path **`/api/media/v1/raw`** com query `k` e `s`, resposta **200** e `Content-Type` de imagem.
4. Confirmar que **não** é necessário `GET /api/chat/avatar-proxy?url=...` para esse contacto quando o cache interno já existe (o cliente prefixa URLs relativas do MediaService como faz para catalog-media).

### Consultas SQL — `media_assets` (`scope = whatsapp_avatar`)

```sql
SELECT id, tenant_id, owner_type, owner_id, scope, storage_key,
       mime_type, size_bytes, left(checksum, 16) AS checksum_prefix,
       public_url, source_url, created_at
FROM public.media_assets
WHERE scope = 'whatsapp_avatar'
ORDER BY created_at DESC
LIMIT 20;
```

### Consultas SQL — `chat_conversations` (avatar em cache interno)

Substituir o UUID pelo da conversa testada:

```sql
SELECT id,
       avatar_url,
       avatar_cached_url,
       avatar_source_url,
       avatar_cache_status,
       avatar_cached_at
FROM public.chat_conversations
WHERE id = '<conversation_uuid>'::uuid;
```

**Critérios após cache bem-sucedido:** `avatar_cached_url` (e, em sucesso, `avatar_url`) devem referenciar URL **interna** assinada (`/api/media/v1/raw?...`), não hostname `*.whatsapp.net` / `*.whatsapp.com`. `avatar_source_url` pode manter a URL original da CDN como referência.

### Regra de falha

Se o download da CDN falhar (403, timeout, corpo vazio, tipo inválido, etc.), o sistema **não remove** avatar nem cache anterior utilizável: aplica-se merge com URLs já persistidas e estados como `avatar_cache_status = 'fetch_failed'` quando aplicável. Nunca apagar ou sobrescrever com CDN efémera como único valor final.

### Documentação relacionada

- Indexação e flags de `media_assets`: `docs/MEDIA_ASSETS_BASE.md`.

## Próximos passos

- vincular mais módulos gradualmente por feature flag;
- adicionar adapter cloud (R2/S3) mantendo contrato do `MediaService`.
