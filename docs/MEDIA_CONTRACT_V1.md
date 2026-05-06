# Contrato v1 — Mídia, storage e resolução (PainelCRM)

**Versão:** 1.1  
**Estado:** norma obrigatória para implementação futura; alinha com `PLANO_ARQUITETURA_MEDIA_PAINELCRM.md`.  
**Objetivo:** uma única fonte de verdade para evitar bugs invisíveis no frontend, colisões de ficheiro e rollback caótico.

---

## 1. Prioridade de resolução (backend — resolver único)

Toda leitura de “URL final” para exibição ou processamento **deve** passar por **um** serviço/resolver no backend (ex.: `MediaResolutionService` ou extensão de `MediaService`), com esta ordem **fixa** para **mídia genérica** (produtos, anexos, futuro unificado):

| Ordem | Fonte | Quando usa |
|------:|--------|------------|
| 1 | **`media_assets`** | Registo existe, `status` permitido para leitura, `storage_key` válido (futuro: também `assetId` em colunas de negócio). |
| 2 | **Catálogo (path relativo assinado)** | URL do tipo `/api/public/catalog-media/raw?k=&s=` (ou path canónico equivalente guardado na BD). |
| 3 | **`avatar_cached_url`** (e campos equivalentes de cache) | Colunas de cache de avatar quando ainda não houver `assetId`. |
| 4 | **Fallback proxy** | Apenas origens explicitamente permitidas (ex. CDN WhatsApp) quando não há asset nem catálogo; **nunca** como primeiro passo. |

**Avatar de conversas / contatos / CRM:** a precedência entre colunas de avatar e proxy está **obrigatoriamente** definida em **§2** (evita o principal bug silencioso atual). O resolver de avatar deve incorporar §1 quando existir `media_assets`, depois aplicar **§2** para `avatar_cached_url` / `avatar_url` / proxy.

**Regra:** o frontend **não** implementa esta ordem; recebe já uma URL ou um `{ resolvedUrl, sourceKind }` definidos pelo backend.

---

## 2. Precedência de avatar (obrigatório)

Ao resolver **avatar** no backend (lista de conversas, cliente, lead, cabeçalho de chat, etc.):

### Ordem de prioridade

1. **`avatar_cached_url`** — se **válido** (path interno assinado, catálogo cacheado, ou URL já normalizada aceite pelo contrato).
2. **`avatar_url`** — se **válido** e **interno** (ex.: path relativo `/api/public/catalog-media/...`, não CDN efémera como valor final persistido).
3. **Fallback de proxy** (ex. avatar-proxy para CDN WhatsApp) — **somente se necessário** (nenhuma das anteriores disponível ou válida).

Se existir vínculo explícito com **`media_assets`** / `assetId` para esse avatar, resolver esse registo **antes** de interpretar colunas legadas (alinhado a §1).

### Regras duras

- **Nunca** sobrescrever `avatar_cached_url` com URL de CDN WhatsApp (efémera) ao persistir.
- **Nunca** sobrescrever valor existente **válido** por `null` ou por string vazia.
- **Nunca** usar **avatar-proxy** se já existir **`avatar_cached_url` válido**.

### Objetivo

Evitar: sumiço de avatar, loop de proxy, inconsistência entre ecrãs.

---

## 3. `storage_key` — contrato definitivo de objeto

Padronização **obrigatória** para novos uploads e para migração S3/R2 (evita colisão, duplicação e paths ad-hoc).

### Formato

```text
tenants/{tenantId}/{scope}/{entityType}/{entityId}/{uuid}.{ext}
```

- **`tenantId`:** UUID do tenant (string sem espaços).
- **`scope`:** domínio funcional em minúsculas (ex.: `avatar`, `product`, `message`, `tenant_logo`, `conversation`).
- **`entityType`:** tipo da entidade ligada (ex.: `conversation`, `product`, `user`, `tenant`).
- **`entityId`:** ID estável da entidade no nosso sistema (UUID ou ID numérico como string).
- **`uuid`:** UUID v4 (ou ULID) gerado no upload.
- **`ext`:** extensão real do ficheiro (`png`, `webp`, `jpg`, `pdf`, …).

### Exemplos

```text
tenants/abc123e4-.../avatar/conversation/xyz789f0-.../a1b2c3d4-e5f6-7890-abcd-ef1234567890.png
tenants/abc123e4-.../product/123/f8e7d6c5-b4a3-2109-8765-432109876543.webp
```

### Disco local (transição)

O prefixo físico legado `uploads/catalog-media/...` pode **mapear** para o mesmo `storage_key` lógico (sem duplicar semântica no contrato). Novos ficheiros **devem** seguir o formato acima desde o primeiro dia da migração formal.

---

## 4. `media_assets` — deduplicação por checksum

Desde a criação da tabela:

- Coluna **`checksum`** (ex.: SHA-256 hex, 64 chars) preenchida sempre que o blob for conhecido no upload.
- **Índice único parcial** (impede o mesmo ficheiro 10× no mesmo tenant):

```sql
CREATE UNIQUE INDEX idx_media_checksum_tenant
ON media_assets (tenant_id, checksum)
WHERE checksum IS NOT NULL;
```

**Semântica:** segundo upload com mesmo `tenant_id` + `checksum` → reutilizar linha existente (incrementar `ref_count` se existir) ou falhar controlado; **nunca** duplicar blob em disco/bucket.

---

## 5. Política de limpeza (garbage / lifecycle)

Estados sugeridos na linha `media_assets` (ou equivalente): `active`, `deleted`, `purged` (opcional).

| Evento | Ação |
|--------|------|
| Pedido de eliminação | **`deleted`** — soft delete **imediato**; URL pública deixa de autorizar leitura; referências de negócio podem ser atualizadas assincronamente. |
| **T + 7 dias** após `deleted_at` | Remover **ficheiro físico** (disco ou objeto em bucket). Idempotente. |
| **T + 30 dias** após `deleted_at` | Remover **linha na BD** (ou arquivar para auditoria se política exigir). |

Jobs cron ou fila dedicada; logs por `tenant_id` / `storage_key`.  
Evita crescimento infinito sem apagar referências antes do tempo seguro.

---

## 6. Chat — contrato obrigatório de `media` (antes da fase 5 de migração total)

**Problema atual:** base64, URLs externas, proxy, catálogo e metadata misturados — **alto risco**.

### Forma canónica persistida (novos fluxos)

```json
{
  "media": [
    {
      "type": "image | file | audio",
      "assetId": "uuid-opcional-media_assets",
      "url": "/api/public/catalog-media/raw?k=...&s=...",
      "status": "pending | ready",
      "mimeType": "optional",
      "sizeBytes": null
    }
  ]
}
```

- **`url`:** apenas para **legado** ou transição; deve ser path relativo ou `assetId` preferido.
- **`status`:** `pending` durante upload assíncrono; `ready` após blob persistido e checksum opcional.

### Regra obrigatória

- **Nunca** persistir payload **base64** completo em `chat_messages` / metadata de mensagem como formato final.
- Base64 só em memória durante ingestão; fluxo deve gravar ficheiro + referência (`assetId` ou URL assinada curta).

---

## 7. Modo compatível global (`MEDIA_MODE`)

Variável de ambiente (ou feature flag centralizada no backend):

```bash
MEDIA_MODE=legacy | hybrid | assets
```

| Modo | Comportamento |
|------|----------------|
| **`legacy`** | Comportamento atual: URLs legadas, catálogo, cache, proxy — sem exigir `media_assets`. |
| **`hybrid`** | Escreve **dois** caminhos onde aplicável: colunas legadas + linha `media_assets`; leitura usa **prioridade §1** e **§2** para avatar. |
| **`assets`** | Fonte de verdade **só** `media_assets` + resolver; legado só leitura até migração completa. |

Objetivo: rollback ordenado sem deploy caótico.

---

## 8. Assinatura de URL — endpoint neutro (alias)

**Hoje:** leitura pública acoplada ao catálogo:

```http
GET /api/public/catalog-media/raw?k=&s=
```

**Ajuste obrigatório (sem quebrar clientes):**

- Manter o endpoint atual **indefinidamente** (compat).
- Introduzir alias neutro para evolução (mesmo handler ou delegação interna):

```http
GET /api/media/v1/raw?k=&s=
```

Mesmos parâmetros `k` e `s` (ou superset documentado). Documentação e novos clientes devem preferir `/api/media/v1/raw`.

---

## 9. Normalização: backend = verdade; frontend = host apenas

**Risco:** dupla normalização (backend + frontend) quebra URLs em *edge cases*.

| Camada | Responsabilidade |
|--------|------------------|
| **Backend** | Fonte da verdade: estrutura do path, query `k`/`s`, ordem §1 e §2, rejeição de valores inválidos para persistência (§10). |
| **Frontend** | **Apenas** resolver o *host* da API (prefixar base URL em dev/prod quando a string for path relativo). **Não** alterar estrutura da URL (path, query, ordem de parâmetros, encoding). |

Proibido no cliente: reescrever `/api/public/...` para outro formato, “corrigir” assinatura ou remover segmentos.

---

## 10. `assertPersistableMediaUrl` — comportamento não destrutivo

Para URLs candidatas a **persistência** em colunas de negócio:

Se a URL for **inválida** para persistência (host proibido, CDN efémera como valor final, esquema não permitido, etc.):

- **Não** gravar a nova URL no campo-alvo.
- **Manter** o valor antigo do campo (se existir e for válido ou aceite como legado).
- **Registar log** estruturado (tenant, entidade, campo, motivo, valor rejeitado truncado).
- **Opcionalmente** persistir a origem em **`source_url`** ou equivalente em metadata **se** o modelo tiver campo para tentativa / auditoria — **nunca** como URL final de exibição sem passar pelo resolver.

**Nunca:**

- sobrescrever com `null` por falha de validação da nova entrada;
- sobrescrever com valor inválido “para limpar” ou “para registar erro”.

---

## 11. Proxy de avatar — proteção contra retry infinito (frontend)

Se o pedido ao **avatar-proxy** falhar (**HTTP ≠ 200**, *timeout*, *CORS*, etc.):

- Marcar essa URL/conversa como **falha em memória** para a **sessão** atual (ex.: `Map` ou estado por `conversationId`).
- **Não** repetir o pedido ao mesmo proxy para o mesmo recurso na mesma sessão.
- **Fallback:** exibir **iniciais** do contacto / utilizador (ou placeholder já usado na UI).

Objetivo: evitar loop de requisições e martelar o backend/CDN.

---

## 12. Auditoria em campos JSON (identificar apenas)

Além de colunas dedicadas a URL, auditar **JSON** que possa embutir URLs problemáticas:

- `chat_messages.metadata`
- `notifications.metadata`
- payloads de campanhas / templates
- qualquer `jsonb` com histórico de mídia ou links

**Padrões de busca sugeridos (relatório / script):** `%localhost%`, `%whatsapp.net%`, `%avatar-proxy%`, `%/api/public/catalog-media/%`.

**Política:** **apenas identificar e quantificar** — **não** corrigir automaticamente em massa sem revisão (risco de alterar payloads opacos).

---

## 13. Upload — proteção na entrada (resposta da API)

Nos serviços de upload (catálogo, perfil, tenant logo, etc.):

- **Nunca** devolver URL absoluta com **host hardcoded** (`http://localhost:3001/...`, IP fixo, domínio de dev).
- **Sempre** devolver **path relativo** canónico alinhado ao contrato interno.

Exemplos:

- ✔ `/api/public/catalog-media/raw?k=...&s=...`
- ✔ `/api/media/v1/raw?k=...&s=...` (quando o alias existir)
- ❌ `http://localhost:3001/api/public/catalog-media/raw?...`

O cliente então aplica apenas §9 (prefixo de API).

---

## 14. SQL de auditoria / migração — evitar regex perigoso

Expressões do tipo `regexp_replace(avatar_url, '^https?://[^/]+', '')` **arriscam** cortar o host errado em URLs atípicas ou multi-barra.

**Preferível** para inventários e *updates* dirigidos:

- Filtrar com predicado **explícito**, por exemplo:

```sql
-- Exemplo: encontrar linhas já no formato path útil (ajustar coluna/tabela)
WHERE avatar_url LIKE '%/api/public/catalog-media/raw%'
```

- Ou: normalização em **código** (backend) com biblioteca de URL, com testes unitários — não depender de regex frágil em SQL para transformações críticas.

---

## Checklist de implementação (referência)

- [ ] Resolver único §1; avatar §2.
- [ ] Uploads com `storage_key` §3; resposta relativa §13.
- [ ] Migração SQL + índice §4; GC §5.
- [ ] Validação de payload chat §6; `MEDIA_MODE` §7.
- [ ] Rota `GET /api/media/v1/raw` §8.
- [ ] Frontend: só host §9; proxy sem retry §11.
- [ ] `assertPersistableMediaUrl` não destrutivo §10.
- [ ] Relatório JSON §12; SQL seguro §14.

---

*Última atualização: contrato v1.1 — precedência de avatar, anti-dupla normalização, persistência não destrutiva, proxy, JSON, upload e SQL.*
