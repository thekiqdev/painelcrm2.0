# Validação pós-Fase 1 — Mídia e avatar

Objetivo: confirmar que a blindagem Fase 1 protege **produção** antes de avançar para **Prompt 2 — MediaService base** (sem migrar ainda anexos de chat).

---

## 1. Auditoria SQL (obrigatório)

**Script:** [`database/scripts/AUDIT_MEDIA_URLS.sql`](../database/scripts/AUDIT_MEDIA_URLS.sql)

```bash
# Base da aplicação tem de estar no connection string (ex.: nome da BD = painelcrm)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/scripts/AUDIT_MEDIA_URLS.sql

# Docker — usar base painelcrm e enviar o SQL pelo stdin (PowerShell, na raiz do repo):
Get-Content .\database\scripts\AUDIT_MEDIA_URLS.sql -Raw | docker exec -i painelcrm_postgres psql -U postgres -d painelcrm -v ON_ERROR_STOP=1
```

Dentro do `psql` interativo, **se** abriu sessão na base errada:

```text
\l                    -- listar bases e confirmar nome (ex.: painelcrm)
\c painelcrm          -- só depois colar / executar o script
```

Se aparecer `relation "public.chat_conversations" does not exist`, está ligado à base **`postgres`** (vazia para esta app) em vez da base **`painelcrm`**.

### O que verificar no output

| Família (resumo no topo) | Critério |
|--------------------------|----------|
| `localhost_em_colunas_texto` | Ideal: **0**. Qualquer linha > 0 → investigar tenant/user afetado. |
| `whatsapp_net_em_campos_finais` | Pode haver linhas em `clients`/`leads.whatsapp_avatar_url` **até** cache completo; rever **amostra**. Em `chat_conversations.avatar_url`, `profiles.avatar_url`, logos **não** devem ser CDN efémera como valor final estável. |
| `avatar_proxy_persistido` | Ideal: **0** em colunas de negócio; proxy é só runtime no `<img>`. |

Secções detalhadas 1–4: confirmar que não há `localhost` inesperado, proxy gravado, ou padrões problemáticos em `chat_messages` / `notifications.data` sem contexto aceitável.

**Nota:** `\pset pager off` é para `psql`; no Azure/DataGrip, executar por blocos se o cliente não suportar meta-comandos.

### Interpretação rápida (exemplo de output real)

| Resumo | Leitura típica |
|--------|------------------|
| `localhost_em_colunas_texto` > 0 | Muitas vezes são URLs gravadas como `http://localhost:PORTA/api/public/catalog-media/...` — o **path** está certo, o **host de dev** não deveria estar na BD. Conta como **dívida**: normalizar para path relativo (repair controlado), não necessariamente “sistema partido” se o front prefixar bem em runtime. |
| `whatsapp_net_em_campos_finais` > 0 | Esperável em parte (`whatsapp_avatar_url` até cache, `communication_contacts` em sync). **Atenção** a `chat_conversations.avatar_url` com só `pps.whatsapp.net`: é CDN efémera como “final” — backlog alinhado ao contrato (cache → catálogo assinado). |
| `avatar_proxy_persistido` = 0 | Bom sinal: proxy não está persistido em colunas. |
| `chat_messages.metadata` com `whatsapp.net` | Normal: payload bruto UazAPI (IDs de chat, URLs de mídia). Não confundir com colunas de avatar. |
| `notifications.data` com CDN | Igual: pode ser snapshot de URL WA; rever se o UI deveria já mostrar cache/path interno. |

Com **localhost** só numa BD de desenvolvimento Docker, o critério “bloqueado por localhost em **produção**” aplica-se ao **deploy público**; na mesma, trate os 22 como **evidência de anti-pattern** a corrigir antes ou logo após Prompt 2.

---

## 2. Avatar WhatsApp (manual — UI)

Abrir DevTools → **Network**, filtrar `avatar-proxy`.

| Onde testar | Passos |
|-------------|--------|
| `/chat` | Lista de conversas com contacto que tenha foto WA + cache. |
| Floating chat | Idem, widget flutuante. |
| Mobile overlay | Viewport mobile / overlay de chat. |
| Cliente / lead | Ficha com conversa vinculada e avatar. |
| Notificação | Toast/lista com avatar de contacto (se aplicável). |
| Kanban | Cartões com avatar de conversa/contacto. |

### Resultado esperado

- Se existir **`avatar_cached_url` válido** (ou equivalente interno assinado) na resposta da API, **não** deve aparecer pedido a **`/api/chat/avatar-proxy`** para esse recurso.
- Avatar estável não deve “piscar” para placeholder por falha repetida de proxy (comportamento anti-retry por sessão, conforme contrato).

---

## 3. Upload (API)

| Fluxo | Verificar na resposta JSON / payload |
|-------|--------------------------------------|
| Perfil (`POST` avatar) | Path **relativo** (`/api/public/catalog-media/...` ou padrão interno), **sem** `http://localhost:...`. |
| Logo tenant | Idem. |
| Imagem de produto | Idem; inspecionar array `images` se aplicável. |

---

## 4. Sync WhatsApp (UazAPI / conversa com `imagePreview`)

- Forçar sync ou receber webhook com nova foto de perfil.
- **Se o cache local falhar:** avatar **anterior** deve permanecer (não apagar válido).
- **Não** persistir URL de CDN (`*.whatsapp.net` / `pps.*`) em **`avatar_url`** como valor final de exibição estável (origem pode ir para `source_url` / metadata conforme implementação).

---

## 5. Consola / Network (sanidade global)

- **Não** deve surgir pedido a **localhost** com porta errada para assets da app em produção (ex.: misturar API de dev).
- **`avatar-proxy`** só aparece quando **não** há avatar local/cacheado válido para aquele render.

---

## 6. Decisão pós-validação

Após os testes das secções 1–5, classificar o resultado usando o checklist e a tabela abaixo.

### Checklist consolidado

- [ ] SQL: contagens resumo aceitáveis + amostras revistas (exceções documentadas).
- [ ] UI: avatar com cache não dispara proxy.
- [ ] Uploads: só URLs relativas na API.
- [ ] Sync: preservação em falha + sem CDN “final” em `avatar_url` indevido.
- [ ] Network: sem localhost incorreto; proxy só como fallback.

### Aprovado

- Todos os critérios do checklist passaram.
- **Pode avançar** para **Prompt 2 — MediaService base** (camada interna de gravação/leitura), **ainda sem** migração massiva de anexos de chat.

### Aprovado com ressalvas

- Existem registos antigos com `whatsapp.net` ou `localhost`, mas **documentados** (escopo, amostra, risco).
- Criar **issue/backlog** de *repair* controlado antes da Fase 3.
- **Pode avançar** para Prompt 2 se **não** afetar produção de forma material (comunicar à equipa).

### Bloqueado

**Não** avançar para Prompt 2 antes de corrigir se qualquer situação se verificar:

- Avatar **cacheado** ainda dispara **proxy** quando não devia.
- **Upload** ainda devolve URL **absoluta** (ex.: `localhost` ou host fixo indevido).
- **Sync** **apaga** avatar existente válido em falha de cache.
- Existem URLs **`localhost`** em **produção** em campos finais (ou tráfego de assets para host errado).
- Outros bloqueios equivalentes identificados nas secções 1–5.

---

*Referência normativa: [`MEDIA_CONTRACT_V1.md`](./MEDIA_CONTRACT_V1.md), [`PLANO_ARQUITETURA_MEDIA_PAINELCRM.md`](./PLANO_ARQUITETURA_MEDIA_PAINELCRM.md).*
