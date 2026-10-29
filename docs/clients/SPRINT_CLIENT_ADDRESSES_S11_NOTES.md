# Sprint S11 — Prefill OS + CEP-first + espaçamento — Notas

| Campo | Valor |
|-------|-------|
| **Status** | **FEITO** |
| **Data** | 2026-10-29 |
| **Plano** | [`PLANO_CLIENT_ADDRESSES_E_OS_PREFILL.md`](../PLANO_CLIENT_ADDRESSES_E_OS_PREFILL.md) |

## Entregas

| Item | Status |
|------|--------|
| Select de endereços do cliente na OS | ✅ padrão / único auto; N → select; “Outro (manual)” |
| CEP em 1º + ViaCEP no manual | ✅ |
| Campos estruturados + `line`/`city_uf` legacy no snapshot | ✅ |
| Espaçamento criação (`max-w-7xl` + padding) | ✅ `NewServiceOrder` + `ServiceOrderForm` |

## Aceite smoke

1. Cliente sem endereço → manual + ViaCEP  
2. Cliente com 1 endereço (ou padrão) → preenche ao selecionar  
3. Cliente com N → select troca o endereço  
4. Criação OS com margem lateral alinhada ao detalhe  

## Encerrado

S10–S11 do plano de endereços concluídos.
