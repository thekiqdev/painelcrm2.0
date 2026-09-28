# Diagnóstico — Mídias / avatares WhatsApp em produção (VPS / EasyPanel)

Documento de investigação **ponta a ponta**: arquitetura no código, envs, volume, Nginx, assinatura, base de dados e frontend.  
Correções só depois de classificar a causa (A–H no final).

---

## 1. Arquitetura atual (código)

### Quem grava o avatar WhatsApp (fluxo novo — MediaService)

| Peça | Ficheiro | Função | Caminho físico | Endpoint gravado na DB |
|------|-----------|--------|----------------|---------------------------|
| Cache ao normalizar conversa | `packages/backend/src/services/whatsappAvatarCacheService.ts` | `resolveConversationAvatarWithCache` → `cacheWhatsappAvatarToCatalog` quando `MEDIA_AVATAR_WHATSAPP_ENABLED=true` | `getMediaStorageRoot()` + `storageKey` relativo (`tenants/.../whatsapp_avatar/...`) via `mediaLocalStorageAdapter.saveBuffer` | `buildMediaRawSignedRelativeUrl` → **`/api/media/v1/raw?k=&s=`** |
| Worker periódico | `packages/backend/src/services/whatsappAvatarCacheWorker.ts` | Reprocessa conversas com CDN/proxy em URL | Idem | Idem |
| Save genérico | `packages/backend/src/services/media/mediaService.ts` | `saveFromBuffer` | Idem | `relativeUrl` assinada |

**Raiz em disco:** `packages/backend/src/services/media/mediaConfig.ts` → `getMediaStorageRoot()`:

- `MEDIA_STORAGE_ROOT` (absoluto, `path.resolve`) **ou**
- Padrão: `{process.cwd()}/storage/media`

### Catálogo legado (fallback quando `MEDIA_AVATAR_WHATSAPP_ENABLED=false`)

| Peça | Ficheiro | Caminho |
|------|-----------|---------|
| Upload / cache legado | `catalogMediaUploadService.ts` | `CATALOG_MEDIA_STORAGE_PATH` + `/catalog-media/...` |
| URL pública | `catalogMediaPublicSignedUrl.ts` | **`/api/public/catalog-media/raw?k=&s=`** ou caminho legacy **`/media/catalog/...`** |

### Quem serve os ficheiros

| Rota HTTP | Montagem Express | Handler |
|-----------|------------------|---------|
| **`GET /api/media/v1/raw`** | `index.ts`: `app.use('/api/media', mediaRoutes)` | `mediaRoutes.ts` → `getMediaRawBySignedKey` (`mediaController.ts`) |
| **`GET /api/public/catalog-media/raw`** | `catalogMediaRoutes` | Catálogo |
| **`GET /api/chat/avatar-proxy`** | `chatRoutes` (auth CRM) | `chatAvatarProxyController.ts` — proxy à CDN WhatsApp (Bearer no cliente via blob) |

### Frontend

| Ficheiro | Papel |
|----------|--------|
| `src/lib/chatAvatarUrl.ts` | `chatAvatarUrlForImgSrc`: prefixa `getApiUrl()` para `/api/media/v1/raw`, `/api/public/catalog-media/raw`; CDN `*.whatsapp.net` → `/api/chat/avatar-proxy` |
| *(não existe `resolveMediaUrl.ts` no repo)* | Tratamento está concentrado em `chatAvatarUrl.ts` e `normalizeConversation` em `src/services/chat.ts` |

---

## 2. Confirmar ENV no processo real (sem expor segredos)

### Opção A — Endpoint Super Admin (recomendado)

`GET /api/superadmin/advanced/media/storage-diagnostics`  
(Header `Authorization: Bearer …` de super admin)

Resposta inclui (entre outros):

- `resolvedMediaStorageRoot` — caminho absoluto usado pelo Node
- `envMediaStorageRootRaw` — valor literal de `MEDIA_STORAGE_ROOT`
- `processCwd`
- `signingSecretSource` — uma de: `MEDIA_SIGNING_SECRET` \| `CATALOG_MEDIA_PUBLIC_TOKEN_SECRET` \| `JWT_SECRET` \| `dev_fallback` (**sem valor**)
- `mediaAvatarWhatsappEnabled`, `mediaAssetsWriteEnabled`
- `storageRootReadable`, `storageRootWritable`

### Opção B — Resposta ampliada do teste de escrita

`POST /api/superadmin/advanced/media/test-save-buffer`  
Corpo opcional: `{ "tenantId": "<uuid-tenant>", "writeAssetRecord": true }`

A resposta inclui agora também:

- `resolvedMediaStorageRoot`, `processCwd`, `signingSecretSource`

---

## 3. Teste controlado escrita + leitura

1. **POST** `…/advanced/media/test-save-buffer` (Super Admin).
2. Copiar `relativeUrl` (ex.: `/api/media/v1/raw?k=…&s=…`).
3. No browser (sessão normal ou anónima — rota é **pública**):  
   `https://SEU_DOMINIO` + `relativeUrl`
4. **`curl -I`** no mesmo URL completo.

**Esperado:** `200`, `Content-Type` adequado, corpo não HTML.

**400 “Assinatura inválida”:** segredo usado à assinatura ≠ segredo no processo que serve GET (ou URL antiga).

**404 “Ficheiro não encontrado”:** `storageKey` ok mas ficheiro não existe em `resolvedMediaStorageRoot` (volume errado, outro container, path diferente).

**200 `text/html`:** proxy entrega o **SPA** em vez do Node — Nginx/EasyPanel a não encaminhar `/api/` ao backend.

---

## 4. No container (SSH / console EasyPanel)

```bash
echo "$MEDIA_STORAGE_ROOT"
pwd
ls -lah /storage/media 2>/dev/null || true
find /storage/media -type f 2>/dev/null | tail -20
```

Validar: diretório existe, ficheiros após `test-save-buffer`, permissões uid do Node, **volume montado no serviço do backend** (não só no frontend).

---

## 5. EasyPanel — volume

- Montar volume **no serviço da API/backend**.
- **Mount path dentro do container** deve coincidir com **`MEDIA_STORAGE_ROOT`** (ex.: `/storage/media`).
- Evitar confundir com `CATALOG_MEDIA_STORAGE_PATH` (ex.: `/data/catalog-media`) — são **raízes diferentes**.
- Várias réplicas: **mesmo volume partilhado** ou **sticky sessions + um único writer**; caso contrário ficheiros “saltam” entre hosts.

---

## 6. Logs sanitizados em `GET /api/media/v1/raw`

Definir temporariamente:

```env
MEDIA_RAW_DIAGNOSTIC_LOGS=true
```

Reiniciar o backend. Nos logs aparecem linhas `[media-raw-request]` JSON com:

- `phase`, `storageKeyPrefix`, `signatureOk`, `storageRoot`, `absolutePathExists`, `contentType` / `error`

**Nunca** inclui assinatura completa nem segredo.

Desligar após o diagnóstico.

---

## 7. SQL sugerido (produção)

```sql
SELECT id, left(avatar_url, 100), left(avatar_cached_url, 120),
       avatar_cache_status, avatar_cached_at, updated_at
FROM chat_conversations
WHERE avatar_url IS NOT NULL OR avatar_cached_url IS NOT NULL
ORDER BY updated_at DESC
LIMIT 30;
```

```sql
SELECT id, tenant_id::text, scope, left(storage_key, 80), left(public_url, 120), status, created_at
FROM media_assets
WHERE scope = 'whatsapp_avatar'
ORDER BY created_at DESC
LIMIT 30;
```

Classificar URLs: `/api/media/v1/raw`, `/api/public/catalog-media/raw`, `/media/catalog`, `pps.whatsapp.net`, `localhost`, vazio.

---

## 8. DevTools (browser)

Para uma imagem que falha: **Network → Img** — URL, status, `Content-Type`.  
Mapear para: **A–H** abaixo.

---

## 9. Classificação de causas

| ID | Causa |
|----|--------|
| **A** | Volume não montado no backend |
| **B** | `MEDIA_STORAGE_ROOT` aponta para path sem volume ou diferente do mount EasyPanel |
| **C** | Processo sem leitura/escrita no path |
| **D** | `/api/media/v1/raw` não chega ao Node (HTML do SPA ou 404 Nginx) |
| **E** | `MEDIA_SIGNING_SECRET` / fallback inconsistente ou URLs antigas |
| **F** | URLs antigas só em catálogo legado / localhost |
| **G** | Frontend com URL mal prefixada (menos comum se `getApiUrl()` relativo em HTTPS) |
| **H** | CDN WhatsApp bloqueia servidor + cache local falhou → dependência do **avatar-proxy** |

---

## 10. Correções típicas (após evidência)

| Causa | Ação |
|-------|------|
| A–C | Volume persistente no backend no path = `MEDIA_STORAGE_ROOT`; permissões; redeploy |
| D | Nginx / proxy: `location ^~ /api/` → upstream Node |
| E | Definir `MEDIA_SIGNING_SECRET` fixo; reiniciar; reprocessar avatares (Super Admin script / worker) |
| F | Migrar URLs ou re-cache |
| G | Revisar `chatAvatarUrl.ts` / env `VITE_API_URL` em cenários HTTP mistos |
| H | Garantir cache (`MEDIA_AVATAR_WHATSAPP_ENABLED` + volume); validar logs `[avatar-proxy]` |

---

## 11. Checklist pós-correção

- [ ] `storage-diagnostics`: `storageRootWritable` true  
- [ ] `test-save-buffer` → GET `relativeUrl` → **200**  
- [ ] `curl -I` ao URL completo → não HTML  
- [ ] Nova conversa / sync → entradas em `media_assets` ou URLs `/api/media/v1/raw` na conversa  
- [ ] Lista do chat mostra foto ou iniciais (não buraco branco)  
- [ ] Desligar `MEDIA_RAW_DIAGNOSTIC_LOGS` após diagnóstico  

---

*Última atualização do doc alinhada ao código do branch; endpoints `storage-diagnostics` e logs `[media-raw-request]` disponíveis após deploy do backend.*
