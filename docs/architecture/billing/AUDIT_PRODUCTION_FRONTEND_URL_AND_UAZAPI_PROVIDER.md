# AUDIT: Produção — `FRONTEND_URL` e provider UazAPI

**Modo:** READ ONLY  
**Data:** 2026-06-15  
**Limitação crítica:** não há acesso ao container de produção nem ao PostgreSQL de produção neste ambiente de auditoria.

---

## Resumo executivo

| Pergunta | Resposta |
|----------|----------|
| Confirmamos runtime de produção (`process.env` no container)? | **Não** — sem `docker exec`, SSH ou BD prod |
| BD consultável é produção? | **Não** — `localhost:5433` / DB `painelcrm` = **dev local** |
| Links nas deliveries acessíveis | **100% `localhost`** — zero `painelcrm.com` / `beta.painelcrm.com` |
| Config documentada de produção | `FRONTEND_URL=https://sistemas-painelcrm-frontend.g8o2qm.easypanel.host` |
| `beta.painelcrm.com/health` | **502** no momento da auditoria |

**Conclusão:** o sintoma investigado nas auditorias anteriores (**`http(s)://localhost` no WhatsApp**) reflete o **ambiente local/dev**, não evidência direta do runtime de produção. Para confirmar produção é necessário consultar o **BD prod** ou `printenv` no container `painelcrm` / `painelcrm-billing-worker`.

---

## 1. Runtime do backend — `resolveFrontendBaseUrl()`

**Arquivo:** `packages/backend/src/services/notificationsEngine/businessTransactionalNotifications.ts`  
**Função:** `resolveFrontendBaseUrl()` — linhas 33–36

```33:36:packages/backend/src/services/notificationsEngine/businessTransactionalNotifications.ts
function resolveFrontendBaseUrl(): string {
  const raw = (process.env.FRONTEND_URL || process.env.PUBLIC_APP_URL || '').split(',')[0]?.trim() ?? '';
  return raw.replace(/\/$/, '');
}
```

### Origem da variável

| Fonte | Usada por `resolveFrontendBaseUrl`? |
|-------|-------------------------------------|
| `process.env.FRONTEND_URL` | **Sim** (1ª) |
| `process.env.PUBLIC_APP_URL` | **Sim** (fallback) |
| `process.env.FRONTEND_URLS` | **Não** (só CORS em `corsOrigins.ts`) |
| Config tenant / BD | **Não** |

### Valores conhecidos (não verificados em runtime prod)

| Ambiente | `FRONTEND_URL` | Fonte |
|----------|----------------|-------|
| **Dev local (esta máquina)** | `http://localhost:8081` | `.env` L25 |
| **Easypanel (doc)** | `https://sistemas-painelcrm-frontend.g8o2qm.easypanel.host` | `EASYPANEL-SERVICOS.md` L44 |
| **Snippet Google Drive prod** | `https://beta.painelcrm.com` | `env-snippets/GOOGLE_DRIVE_PRODUCAO.env` |
| **Build Easypanel (log histórico)** | `FRONTEND_URLS=…,https://beta.painelcrm.com` **sem** `FRONTEND_URL` explícito | `cursor_untitled_chat.md` (deploy log) |
| **Container prod agora** | **Desconhecido** | — |

### Risco de configuração em produção

Se o deploy definir **apenas** `FRONTEND_URLS` (válido para CORS) **sem** `FRONTEND_URL` nem `PUBLIC_APP_URL`, então `resolveFrontendBaseUrl()` retorna **`''`** e `buildCustomerInvoicePayAbsoluteUrl()` **não gera link** (linha 332: `if (!t || !base) return ''`).

Isso é diferente de `localhost`, mas também quebra o link na mensagem.

**Billing worker** usa o mesmo env que o backend (`docs/EASYPANEL-BILLING-WORKER-SCHEDULER.md` L33–37).

---

## 2. Invoice recorrente “de produção”

**Não foi possível** selecionar invoice criada no PostgreSQL de produção.

### Substituto: mais recente no BD **local** (dev)

| Campo | Valor |
|-------|-------|
| **invoice_id** | `c9747fa1-5bdd-4c56-8479-74c4f5dd2a3a` |
| **tenant_id** | `4ecc0b33-aecd-4489-a5ae-0d7c6395c35d` |
| **created_at** | `2026-06-07 17:00:28 UTC` |
| **Ambiente** | **Dev local** (`FRONTEND_URL=http://localhost:8081`) |

---

## 3. `notification_outbound_deliveries` (invoice acima)

| Campo | Valor |
|-------|-------|
| **delivery_id** | `7c082911-eb68-43b5-9e74-4c59817c25fd` |
| **event_key** | `invoice.created` |
| **status** | `failed` |
| **channel** | `whatsapp` |
| **error_message** | `true` |
| **recipient_address** | `11920079901` |
| **created_at** | `2026-06-07 17:00:28 UTC` |

---

## 4. `rendered_body` (texto enviado à UazAPI)

```
Olá, *11920079901*.

Criamos a fatura *CINV-4ECC0B33-MQ412V64*.

*Valor:* R$ 90,00
*Vencimento:* 14/06/2026

*Consulte ou pague aqui:*
http://localhost:8081/pay/23eda8a6-6c68-424a-b9bf-0d80e1e4bfb4

Agência Dev
```

**Link:** `http://localhost` — **não** `https://painelcrm.com` nem domínio Easypanel.

---

## 5. Logs UazAPI

**Arquivo:** `uazapi.ts` L118–135 — log `[UazAPI] Request failed` com `status` e `message` (não persiste `responseText` no stdout estruturado completo).

| Fonte | Resultado |
|-------|-----------|
| Terminais / arquivos locais | **Nenhum** log de 2026-06-07 17:00–17:02 UTC |
| BD `provider_response` | **Sem** HTTP status/body |
| Logs Easypanel produção | **Não acessados** nesta auditoria |

---

## 6. Últimas 50 deliveries `invoice.created` (BD local)

### Agrupamento por host no link

| Host no `rendered_body` | sent | failed | processing |
|-------------------------|------|--------|------------|
| **`http://localhost`** | 15 | 17 | 1 |
| **`https://localhost`** | 21 | 0 | 0 |
| **`painelcrm.com` / `beta.painelcrm.com` / easypanel** | **0** | **0** | **0** |
| Sem link HTTP | 1 | 0 | 0 |

### Últimas 50 — padrão

- **49/50** contêm `localhost:8081`
- **0/50** contêm domínio público PainelCRM
- Única falha recente (jun/2026): `http://localhost`
- Envios recentes bem-sucedidos (mai/2026): `https://localhost`

**Interpretação:** o BD acessível é **exclusivamente ambiente de desenvolvimento** com `FRONTEND_URL` apontando para `localhost`.

---

## 7. Classificação

| Código | Aplica ao BD auditado | Aplica a produção (sem acesso) |
|--------|----------------------|-------------------------------|
| **A** Produção usa domínio correto | **Não** (BD local = localhost) | **Documentação diz sim** — **não confirmado** |
| **B** Produção usa localhost | **Sim (dev)** | **Indeterminado** |
| **C** Erro no provider | **Sim** — `failed` + `error:true` após UazAPI | Provável se mesmo payload |
| **D** Problema é URL gerada | **Sim (dev)** — link localhost inatingível pela UazAPI remota | **Possível** se `FRONTEND_URL` errado em prod |
| **E** Independente do link | Parcial — 2 falhas sem `/pay/` no histórico | — |

### Classificação composta (ambiente auditável)

**B + D + C** — URL gerada com `localhost` (dev) → UazAPI remota (`entregakit.uazapi.com` / `free.uazapi.com`) rejeita → `error_message = "true"`.

### Produção — o que falta para fechar

Executar **no container** `painelcrm` ou `painelcrm-billing-worker`:

```bash
printenv FRONTEND_URL PUBLIC_APP_URL FRONTEND_URLS
```

E no **PostgreSQL de produção**:

```sql
SELECT substring(rendered_body from 'https?://[^\\s]+') AS link,
       status, error_message, created_at
FROM notification_outbound_deliveries
WHERE event_key = 'invoice.created'
ORDER BY created_at DESC LIMIT 20;
```

---

## Camada onde a invoice deixa de avançar

| Ambiente | Camada |
|----------|--------|
| **Dev (dados auditados)** | **URL gerada** (`FRONTEND_URL` → localhost) → **provider UazAPI** (`failed`) |
| **Produção (hipótese)** | Se `FRONTEND_URL` estiver correto no doc → avança até provider; se igual ao dev → mesma ruptura. Se só `FRONTEND_URLS` → ruptura na **geração do link** (vazio). |

---

## Referências

| Item | Local |
|------|-------|
| `resolveFrontendBaseUrl` | `businessTransactionalNotifications.ts` L33–36 |
| `buildCustomerInvoicePayAbsoluteUrl` | `businessTransactionalNotifications.ts` L329–334 |
| Env prod documentado | `EASYPANEL-SERVICOS.md` L44 |
| Worker compartilha env | `docs/EASYPANEL-BILLING-WORKER-SCHEDULER.md` L33–37 |
| `FRONTEND_URLS` ≠ notificações | `corsOrigins.ts` vs `businessTransactionalNotifications.ts` |

---

*Auditoria READ ONLY. Sem alteração de código ou infraestrutura.*
