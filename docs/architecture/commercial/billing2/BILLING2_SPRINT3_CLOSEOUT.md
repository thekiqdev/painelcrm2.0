# Billing 2.0 — Sprint 3 Closeout

| Campo | Valor |
|-------|-------|
| **Sprint** | 3 — Collection Policy Engine |
| **Data** | 2026-07-27 |
| **Status** | Implementada — aguardando aprovação |

## Entregáveis

| Item | Status |
|------|--------|
| `interpretCollectionPolicy` Event → Actions | ✅ |
| `executeCollectionActions` + idempotência | ✅ |
| Executores notify_whatsapp / notify_email | ✅ (idempotente via ensure/publish) |
| Executor create_pix (ensure charge) | ✅ |
| Executor reactivate_tenant | ✅ (`activatePlanFromBilling`) |
| write_audit_log | ✅ |
| Stubs charge_card (S9) / pix_automatic (S10) | ✅ |
| suspend / cancel guardados por FF (default OFF) | ✅ |
| Wire `renewal.charge_created` | ✅ (engine ON assume notify) |
| Wire `payment.paid` | ✅ |
| Wire `payment.overdue` | ✅ |
| UI Cobrança Automática | ❌ fora (S4) |
| Dunning agressivo / grace jobs | ❌ fora (S8) |

## Critérios de aceite

- [x] Policy “só WhatsApp+Email” não emite `charge_card` / `create_pix`
- [x] Suspensão automática não ocorre com flag/policy OFF
- [x] `payment.paid` + reativação ON chama path idempotente de activate
- [x] Actions idempotentes por `(entity, action, cycle_key, attempt)`
- [x] Flag `collection_policy_engine_enabled=OFF` → legado puro
- [ ] Smoke staging com flag OFF (regressão renovação/webhook)
- [ ] Smoke opcional com flag ON em staging (não produção)

## Rollback

1. Super Admin → `billing2.collection_policy_engine_enabled` = OFF  
2. Caminho legado de notify/activate permanece  
3. Nenhuma migration nova nesta sprint  

## Notas

- Com engine OFF, produção inalterada (defaults).  
- Ownership de notify unificado só quando engine ON; com OFF o publish legado segue.  
- Cartão tokenizado e Pix Automático continuam stubs até S9/S10.  
- Dupla notificação / avanço de ciclo vs liquidação: documentado; aprofundar em S8.

## Testes

- Unit: interpretador + hook OFF/ON + suspend gated — `collectionPolicy.test.ts`
