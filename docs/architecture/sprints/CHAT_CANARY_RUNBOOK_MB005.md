# Runbook — Canário Chat (MB-005)

| Campo | Valor |
|---|---|
| **MB** | MB-005 |
| **Sprint** | Phase 0 |
| **Relacionado** | MB-001, FEATURE_FLAGS_AUDIT, ADR-010 |

## Ligar (staging / cohort)

1. Abrir Super Admin → Chat migration flags (ou API equivalente).  
2. Aplicar composição oficial em `CHAT_CANARY_COMPOSITION_MB001.md`.  
3. Confirmar `GET /api/chat/migration-flags` no browser autenticado.  
4. Hard refresh `/chat`.

## Desligar / Rollback

1. Reverter flags para **OFF** (catalog default).  
2. Hard refresh.  
3. Validar smoke legado (lista + send).  
4. Não é necessário redeploy se flags são runtime.

## Smoke tests (obrigatórios)

| # | Caso | Esperado |
|---|---|---|
| 1 | Login | Shell carrega |
| 2 | `/chat` lista | Conversas (não arquivadas) |
| 3 | Abrir conversa | Mensagens |
| 4 | Enviar texto | Entrega / status |
| 5 | Receber (ou webhook) | Lista atualiza |
| 6 | Filtro Arquivadas | Só `wa_archived` |
| 7 | Groups + Arquivadas | Mesma regra |
| 8 | Logout | Limpa sessão |

## Checklist pré-produção

- [ ] Staging smoke OK  
- [ ] Rollback testado (flags OFF)  
- [ ] Métricas/erros observados  
- [ ] Cohort definido  

## Contacto / ownership

Engenharia Chat + Ops. Em falha crítica: flags OFF imediato; **não** iniciar Phase 1.
