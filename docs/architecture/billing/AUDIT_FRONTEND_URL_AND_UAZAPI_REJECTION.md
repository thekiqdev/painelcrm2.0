# AUDIT: `FRONTEND_URL` e rejeição UazAPI

**Modo:** READ ONLY  
**Data:** 2026-06-15  
**Hipótese:** troca `https://localhost` → `http://localhost` no link da fatura causou `error_message = "true"`

---

## 1. `buildCustomerInvoicePayAbsoluteUrl()`

**Arquivo:** `packages/backend/src/services/notificationsEngine/businessTransactionalNotifications.ts`

```33:36:packages/backend/src/services/notificationsEngine/businessTransactionalNotifications.ts
function resolveFrontendBaseUrl(): string {
  const raw = (process.env.FRONTEND_URL || process.env.PUBLIC_APP_URL || '').split(',')[0]?.trim() ?? '';
  return raw.replace(/\/$/, '');
}
```

```329:334:packages/backend/src/services/notificationsEngine/businessTransactionalNotifications.ts
function buildCustomerInvoicePayAbsoluteUrl(paymentToken: string | null | undefined): string {
  const base = resolveFrontendBaseUrl();
  const t = paymentToken != null && String(paymentToken).trim() ? String(paymentToken).trim() : '';
  if (!t || !base) return '';
  return `${base}/pay/${t}`;
}
```

### De onde vem a URL?

| Fonte | Usado? |
|-------|--------|
| **`.env` / variável de ambiente** `FRONTEND_URL` | **Sim** — primeira opção |
| **`PUBLIC_APP_URL`** | Fallback se `FRONTEND_URL` vazio |
| **Runtime config / Super Admin** | **Não** nesta função |
| **Config por tenant** | **Não** — mesmo URL para todos os tenants |

Não há leitura de `tenants`, BD ou feature flag — só `process.env` no processo Node que renderiza a notificação.

### Valores conhecidos

| Ambiente | `FRONTEND_URL` | Fonte |
|----------|----------------|-------|
| **Dev local (este BD)** | `http://localhost:8081` | `.env` L25 |
| **Dev local (comentado)** | `https://localhost:8081` | `.env` L53 (comentário: "use só em HTTPS local") |
| **Produção (Easypanel)** | `https://sistemas-painelcrm-frontend.g8o2qm.easypanel.host` | `EASYPANEL-SERVICOS.md` L44 |
| **Produção real em runtime** | **Não verificado** nesta auditoria (sem acesso ao pod/container) | — |

**Nota:** Os dados do BD (`rendered_body` com `localhost`) indicam que as notificações analisadas foram geradas em **ambiente de desenvolvimento local**, não com a URL do Easypanel.

---

## 2. Histórico — `rendered_body` completo

### Invoice **sent** — `97704d29` (2026-05-14)

```
Olá, *11920079901*.

Criamos a fatura *CINV-2026-97704d29*.

*Valor:* R$ 90,00
*Vencimento:* 14/05/2026

*Consulte ou pague aqui:*
https://localhost:8081/pay/9d5de73b-d518-485c-8e7f-1a747d5b00d2

Agência Dev
```

### Invoice **failed** — `c9747fa1` (2026-06-07)

```
Olá, *11920079901*.

Criamos a fatura *CINV-4ECC0B33-MQ412V64*.

*Valor:* R$ 90,00
*Vencimento:* 14/06/2026

*Consulte ou pague aqui:*
http://localhost:8081/pay/23eda8a6-6c68-424a-b9bf-0d80e1e4bfb4

Agência Dev
```

### Diferenças observáveis

| Campo | Maio (sent) | Junho (failed) |
|-------|-------------|----------------|
| **Esquema do link** | `https://` | `http://` |
| **Host** | `localhost:8081` | `localhost:8081` |
| **Path** | `/pay/{token}` | `/pay/{token}` |
| **Telefone / cliente** | `11920079901` | `11920079901` |
| **Valor** | R$ 90,00 | R$ 90,00 |
| **Nº fatura** | `CINV-2026-97704d29` | `CINV-4ECC0B33-MQ412V64` |
| **Payload UazAPI** (`number`, `text`, flags) | Estruturalmente idêntico exceto texto | Idêntico |

**Única diferença material no corpo enviado à UazAPI:** esquema do link (`https` vs `http`) e metadados da fatura (número, token, vencimento).

---

## 3. Logs UazAPI (2026-06-07 17:00–17:02 UTC)

**Arquivo:** `packages/backend/src/services/uazapi.ts` — linhas 130–133

```typescript
console.error('[UazAPI] Request failed:', {
  status: response.status,
  message: payload?.error || payload?.message || response.statusText,
});
```

### Verificação

| Fonte | Resultado |
|-------|-----------|
| Terminais Cursor (`terminals/*.txt`) | **Nenhum** `[UazAPI] Request failed` |
| Repositório / arquivos de log | **Nenhum** log persistido encontrado |
| BD (`provider_response`) | **Sem** status HTTP nem body |

**Conclusão:** `status`, `payload` e `responseText` da janela 17:00–17:02 UTC **não estão recuperáveis** nesta investigação READ ONLY. Só se infere `error_message = "true"` persistido no motor.

---

## 4. Documentação UazAPI — validação de `localhost` / `http`

**Arquivo:** `docs/uazapi-openapi-spec.yaml`

| Tópico | Achado |
|--------|--------|
| **Rejeição explícita de `localhost`** | **Não documentada** |
| **Rejeição de `http://` vs `https://`** | **Não documentada** |
| **Links não públicos** | **Não documentada** |
| **Link preview** | **Documentado** — `/send/text` suporta `linkPreview`; quando ativo, gera preview do primeiro link no texto (L3478–3492). Em outro endpoint: *"O preview será gerado automaticamente a partir da URL contida no texto"* (L9270–9272). |

`dispatchWhatsAppText` **não envia** `linkPreview: false`:

```65:72:packages/backend/src/services/notificationsEngine/whatsappChannelDispatcher.ts
    const messageResponse = (await uazapiService.sendTextMessage(token, {
      number: params.phone,
      text: outboundText,
      readchat: false,
      readmessages: false,
      delay: 0,
      track_source: 'painelcrm-notifications-engine',
    }))
```

Se a UazAPI (`entregakit.uazapi.com`) tentar buscar preview de `http(s)://localhost:8081/...`, o fetch **falha** (host não roteável na internet). Isso é **inferência** — não há erro documentado com nome `localhost` na OpenAPI.

---

## 5. Histórico geral — `error_message = 'true'`

### Query

```sql
SELECT rendered_body, status, created_at
FROM notification_outbound_deliveries
WHERE error_message = 'true';
```

### Padrão (BD local, 32 registros)

| Padrão no `rendered_body` | Quantidade |
|---------------------------|------------|
| Contém `http://localhost` | **30** |
| Contém `https://localhost` | **0** |
| Sem link `/pay/` | 2 |

### Cruzamento `invoice.created` × esquema × status

| status | link no body | count | período (datas) |
|--------|--------------|-------|-----------------|
| **sent** | `http://localhost` | 15 | 2026-04-22 → 2026-04-24 |
| **sent** | `https://localhost` | 21 | 2026-04-28 → 2026-05-26 |
| **failed** | `http://localhost` | 17 | 2026-04-24 → 2026-06-07 |
| **failed** | `https://localhost` | **0** | — |

### Leitura do padrão

1. **`http://localhost` não falha sempre** — 15 envios `sent` com `http` existem (até 24/04).
2. **A partir de ~24/04**, `http://localhost` passa a dominar falhas `error:true`.
3. **Período 28/04–26/05** (inclui maio sent): só `https://localhost` nos envios bem-sucedidos; **zero** falhas `https`.
4. **Junho failed** volta a `http://localhost` — alinhado ao `.env` atual (`FRONTEND_URL=http://localhost:8081`).

**Nem todos** os `error_message='true'` têm link (2 sem `/pay/`), mas **94%** dos casos com link usam `http://localhost`.

---

## 6. Classificação final

| Código | Aplica? | Comentário |
|--------|---------|------------|
| **A** `FRONTEND_URL` incorreto | **Sim (dev)** | `localhost` em envio via UazAPI na nuvem é inatingível; produção deveria usar domínio público |
| **B** Link localhost rejeitado | **Correlação forte** | 0 falhas `https://localhost`; 30/32 falhas com `http://localhost` |
| **C** Bug UazAPI | **Possível** | Resposta `{ error: true }` booleano é comportamento anômalo |
| **D** Outro payload | **Parcial** | Mesmo telefone/sender; diferença principal é URL no texto |
| **E** Não relacionado ao link | **Parcial** | 2 falhas sem link; `http` já funcionou em 22–24/04 |

### A troca `https://localhost` → `http://localhost` introduziu as falhas?

| Escopo | Resposta |
|--------|----------|
| **Par maio/junho (esta assinatura)** | **Sim, correlaciona.** Única diferença relevante no `rendered_body` é o esquema. Maio `sent` = `https`; junho `failed` = `http`. |
| **Classe de falha `error:true` globalmente** | **Não.** Falhas com `http://localhost` existem desde **2026-04-24**, antes do ciclo de junho. A classe não nasceu em junho. |
| **O que a troca fez em junho** | **Reexpôs** um modo de falha já presente quando `FRONTEND_URL` usa `http://localhost:8081` — período em que `https://localhost` (`.env` comentado L53) tinha coincidido com 21 envios `sent` e 0 falhas `https`. |

### Causa mais provável (READ ONLY, com ressalvas)

```
FRONTEND_URL=http://localhost:8081
  → link http://localhost no WhatsApp
  → UazAPI (servidor remoto) processa /send/text com URL no corpo
  → falha HTTP com { error: true } (poss. preview ou validação interna)
  → Error("true") no motor
```

**Não comprovado sem log UazAPI:** se a falha é preview de link, validação de esquema `http`, ou outro motivo.

### Classificação composta

**A + B** — `FRONTEND_URL` de desenvolvimento (`localhost`) inadequado para envio via UazAPI remota, com **correlação estatística forte** entre `http://localhost` e `error:true`, e **reversão https→http** alinhada à regressão maio→junho neste par.

**Não é** evidência suficiente para afirmar que **somente** a troca de esquema causa falha (15 `sent` com `http` existem no histórico).

---

## Referências

| Item | Local |
|------|-------|
| Resolução da base URL | `businessTransactionalNotifications.ts` L33–36, L329–334 |
| Payload WhatsApp | `whatsappChannelDispatcher.ts` L64–72 |
| Erro UazAPI | `uazapi.ts` L118–135 |
| `.env` dev | `FRONTEND_URL=http://localhost:8081` (L25) |
| `.env` https comentado | L53 |
| Produção (doc) | `EASYPANEL-SERVICOS.md` L44 |

---

*Auditoria READ ONLY. Sem alteração de código ou dados.*
