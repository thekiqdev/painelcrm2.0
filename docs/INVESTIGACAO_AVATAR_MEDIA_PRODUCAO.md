# Investigação — avatares/perfis após MediaService (produção)

Documento de apoio à análise de causas raiz. **Não substitui** colher evidências no browser, na API e no SQL. Atualize as secções “Evidências” com os valores reais do vosso ambiente.

---

## 1. Resumo do que o código faz (verificado no repositório)

### 1.1 Assinatura `/api/media/v1/raw` (MediaService)

- **Gerar `s`:** `signMediaStorageKey` em `packages/backend/src/services/media/mediaUrlSigner.ts` — HMAC-SHA256 da chave em base64url, usando `getMediaSigningSecret()` de `mediaConfig.ts`.
- **Validar:** `verifyMediaSignature` — mesmo HMAC, comparação em tempo constante.
- **Secret efectivo:** em `getMediaSigningSecret()` (`packages/backend/src/services/media/mediaConfig.ts`), por ordem:
  1. `MEDIA_SIGNING_SECRET`
  2. `CATALOG_MEDIA_PUBLIC_TOKEN_SECRET`
  3. `JWT_SECRET`
  4. fallback de desenvolvimento (só se não for produção fraca).

Em **produção**, se o secret efectivo for considerado “fraco” (< 24 caracteres ou padrões óbvios), o backend pode **lançar erro** ao assinar/validar — isto é independente de haver ou não `MEDIA_SIGNING_SECRET` definido só para métricas de diagnóstico.

**Diagnóstico que vimos:** `MEDIA_SIGNING_SECRET_configured: false`, `CATALOG_MEDIA_PUBLIC_TOKEN_SECRET_configured: false`, `signing_secret_source: JWT_SECRET` → as URLs **assinação de mídia nova** usam o **mesmo segredo que o JWT**.

**Risco:** rotação de `JWT_SECRET` (ou diferença de env entre réplicas) invalida assinaturas **já persistidas** em `avatar_*_url` / `public_url` — sintoma típico: “funcionou e deixou de funcionar após deploy”.

### 1.2 Catálogo legado `/api/public/catalog-media/raw`

- **Validação:** `verifyCatalogMediaPublicQuery` em `packages/backend/src/utils/catalogMediaPublicSignedUrl.ts`.
- **Secret do catálogo:** `CATALOG_MEDIA_PUBLIC_TOKEN_SECRET` **ou** `JWT_SECRET` **ou** fallback de dev.

**Ficheiros no disco:** raiz `getCatalogMediaStorageRoot()` em `catalogMediaUploadService.ts` — por defeito `{cwd}/uploads/catalog-media`, ou `CATALOG_MEDIA_STORAGE_PATH` + subpasta `catalog-media`. **Não é** o mesmo path que `MEDIA_STORAGE_ROOT` (`/storage/media` no vosso caso), salvo configuração explícita.

**Risco:** URLs antigas apontam para ficheiros sob **outro volume**; se só montarem `/storage/media` no EasyPanel e não o path do catálogo, imagens **legadas** quebram mesmo com assinatura válida.

### 1.3 Frontend — como o `<img>` resolve o URL

`src/lib/chatAvatarUrl.ts`:

- Paths `/api/public/catalog-media/raw?...` → prefixa `getApiUrl()` (origem da API).
- Paths `/api/media/v1/raw?...` → idem.
- Hosts `*.whatsapp.net` / `*.whatsapp.com` → **não** usa URL directa; monta `/api/chat/avatar-proxy?url=...` (precisa **sessão CRM** no browser).

Se `getApiUrl()` estiver errado no build de produção (domínio da API ≠ domínio que serve `/api`), o browser pede imagem no host errado → 404/HTML.

---

## 2. Evidências a recolher (obrigatório antes de “corrigir no escuro”)

### 2.1 Uma URL real quebrada (browser)

| Campo | Valor |
|--------|--------|
| URL completa do `src` da imagem (DevTools → Network → Img) | _preencher_ |
| HTTP status | _preencher_ |
| `content-type` | _preencher_ |
| Primeiros bytes (imagem vs HTML vs JSON) | _preencher_ |

Interpretação rápida:

| Sintoma | Hipótese |
|---------|-----------|
| 403 em `pps.whatsapp.net` no `<img>` directo | Esperado — o frontend deve usar **avatar-proxy**; se a BD ainda tem CDN directo sem proxy, falha. |
| 401/403 em `/api/media/v1/raw` | Assinatura inválida (`s`) ou rota protegida por engano. |
| 404 em `/api/media/v1/raw` | Ficheiro ausente em `MEDIA_STORAGE_ROOT` ou `storage_key` errado. |
| 200 `text/html` | Pedido a cair no SPA/Nginx em vez do Node. |
| 502/504 | Proxy/upstream. |

### 2.2 Script `media.diagnose_conversation_avatar`

Correr no Super Admin com UUID de conversa com avatar quebrado.

O resultado inclui (entre outros):

- Campos da BD resumidos (`avatar_url`, `avatar_cached_url`, …).
- Para `/api/media/v1/raw`: assinatura, ficheiro em disco, leitura pelo adapter.
- Para catálogo legado: validação de assinatura do catálogo.
- **`external_http_probe`:** sonda HTTP **a partir do servidor** (HEAD/GET) para a URL primária (path relativo é prefixado com `API_PUBLIC_BASE_URL` / `PUBLIC_API_URL` / etc.). Útil para comparar com o browser; **403 em WhatsApp via servidor** é comum e não invalida sozinho o diagnóstico no cliente.

**Cole aqui o JSON (ou trecho `primary_url.analysis`):** _preencher_

### 2.3 Script `media.test_storage_roundtrip` (execute)

| Campo | Valor esperado se “pipeline OK” |
|--------|-----------------------------------|
| `physicalExists` | `true` |
| `adapterReadOk` | `true` |
| `internalHttpStatus` | `200` (se `API_PUBLIC_BASE_URL`/`PUBLIC_API_URL` apontar para este backend) |
| `internalHttpContentType` | `image/...` |

**Cole resumo:** _preencher_

Interpretação (alinha ao pedido da investigação):

| Round-trip | Leitura |
|------------|---------|
| OK + avatar real falha | Provável **URLs antigas na BD**, **assinatura antiga**, **frontend/host**, ou **tipo de URL** (CDN vs cache interno). |
| HTTP 400 na rota raw | Assinatura/rota — rever secret e query `k`/`s`. |
| HTTP 404 | **Ficheiro** não existe no path resolvido. |
| HTTP 200 HTML | **Proxy** a servir SPA em vez da API. |
| HTTP 500 | Erro no handler ou `getMediaSigningSecret` em produção. |

### 2.4 SQL — amostra de URLs (executar na BD de produção **read-only**)

Trechos sugeridos na especificação:

- `chat_conversations`: últimas linhas com `avatar_*` preenchidos.
- `media_assets` com `scope = 'whatsapp_avatar'`.

**Classificar contagens** (manual ou query agregada):

| Padrão | Contagem |
|--------|----------|
| `/api/media/v1/raw` | _preencher_ |
| `/api/public/catalog-media/raw` | _preencher_ |
| `/media/catalog/` | _preencher_ |
| `pps.whatsapp.net` / `whatsapp.com` | _preencher_ |
| `localhost` | _preencher_ |
| `null` / vazio | _preencher_ |

---

## 3. Causa raiz **provável** (hipótese alinhada ao vosso diagnóstico)

Com:

- Storage OK em `/storage/media`,
- Rotas registadas no código,
- **Sem** `MEDIA_SIGNING_SECRET` nem `CATALOG_MEDIA_PUBLIC_TOKEN_SECRET` dedicados,
- **`signing_secret_source: JWT_SECRET`**

a hipótese mais consistente com “parou após mudança/deploy” é:

1. **Assinatura de mídia amarrada a `JWT_SECRET`** — qualquer alteração ou inconsistência entre instâncias invalida URLs antigas; ou  
2. **Mistura de URLs** — parte das linhas em MediaService (`/api/media/v1/raw`), parte em catálogo (`/api/public/...`) ou CDN, com **volumes** ou **secrets** diferentes; ou  
3. **Frontend** — `getApiUrl()` ou proxy a não enviar `/api` ao mesmo backend que grava os ficheiros.

A secção 2 deve **confirmar qual** com uma URL real + round-trip + SQL.

---

## 4. Correção recomendada (após confirmar causa)

**Não executar em massa até haver evidência.** Direcção típica:

1. **Produção:** definir `MEDIA_SIGNING_SECRET` **forte e estável** (≥ 24 caracteres, não trivial), **só para mídia**, e não voltar a rodar sem migração planeada.
2. Se catálogo legado ainda for servido: definir `CATALOG_MEDIA_PUBLIC_TOKEN_SECRET` e garantir **volume** em `CATALOG_MEDIA_STORAGE_PATH` coerente com ficheiros antigos **ou** migrar/reprocessar para MediaService (plano separado).
3. **Reprocessar avatares** com limite baixo **só depois** de secrets e volumes estáveis — gera novas URLs assinadas com o secret corrente.

---

## 5. Passos no EasyPanel (checklist)

- [ ] Variáveis: `MEDIA_SIGNING_SECRET`, opcional `CATALOG_MEDIA_PUBLIC_TOKEN_SECRET`, `JWT_SECRET` (mantido para auth).
- [ ] Volume backend: **montado** em `MEDIA_STORAGE_ROOT` (ex.: `/storage/media`) e **persistente** entre deploys.
- [ ] Se usar catálogo legado: volume/caminho para `CATALOG_MEDIA_STORAGE_PATH` + `catalog-media` conforme código.
- [ ] Uma única origem de verdade para URL pública da API: `API_PUBLIC_BASE_URL` ou `PUBLIC_API_URL` alinhada com o domínio que o browser usa para `/api/...`.
- [ ] Após alterar secrets: **reiniciar** todos os réplicas do backend com o **mesmo** env.
- [ ] Validar: `media.diagnose_system` → `media.test_storage_roundtrip` (execute) → uma conversa com `media.diagnose_conversation_avatar`.

---

## 6. Referência rápida — ficheiros de código

| Tema | Ficheiro |
|------|-----------|
| Secret e ordem de fallback (mídia) | `packages/backend/src/services/media/mediaConfig.ts` |
| Assinar/verificar raw mídia | `packages/backend/src/services/media/mediaUrlSigner.ts` |
| Catálogo público assinado | `packages/backend/src/utils/catalogMediaPublicSignedUrl.ts` |
| Raiz de disco catálogo | `packages/backend/src/services/catalogMediaUploadService.ts` |
| `<img>` / proxy WhatsApp | `src/lib/chatAvatarUrl.ts` |
| Scripts Super Admin | `packages/backend/src/services/adminScripts/mediaDiagnosticsAdminScript.ts` |

---

*Última actualização: gerado com base na análise estática do código; preencher evidências de produção antes de mudanças definitivas.*
