# Billing Timezone Certification — Sprint 4.2 (Backend)

## Fusos testados

- `America/Sao_Paulo`
- `UTC`
- `America/New_York` (UTC-4/EDT)
- `Europe/Berlin` (UTC+2/CET)

## Casos

- Normalização YMD civil (`normalizeBillingDate`)
- Virada do dia: `2026-07-01T02:30Z` → SP = 30/06, UTC = 01/07
- Ano bissexto: `2024-02-29`

## Módulo

`audit/timezone/timezoneCertification.ts`

## UI (4.1M)

`financialTodayYmd()` em `src/lib/billingSafeDate.ts`
