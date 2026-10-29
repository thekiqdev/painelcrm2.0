# Sprint S10 — Endereços do cliente + ViaCEP — Notas

| Campo | Valor |
|-------|-------|
| **Status** | **FEITO** |
| **Data** | 2026-10-29 |
| **Plano** | [`PLANO_CLIENT_ADDRESSES_E_OS_PREFILL.md`](../PLANO_CLIENT_ADDRESSES_E_OS_PREFILL.md) |

## Entregas

| Item | Status |
|------|--------|
| Migration `364_client_addresses.sql` | ✅ |
| API CRUD `/api/clients/:id/addresses` | ✅ |
| Tenant scope + `TENANT_SCOPED_TABLES` | ✅ |
| ViaCEP FE (`src/lib/viacep.ts`) | ✅ |
| Form CEP-first (`ClientAddressFormFields`) | ✅ |
| Card Endereços após Cadastro Completo | ✅ |
| Testes CEP helpers | ✅ |

## Ops

Rodar migração `364_client_addresses.sql` nos ambientes.

## Próximo

**S11** — Prefill na OS + CEP-first no formulário de execução + espaçamento criação.
