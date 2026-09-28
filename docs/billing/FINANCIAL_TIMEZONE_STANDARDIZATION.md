# Financial Timezone Standardization — Sprint 4.1M

## Helper canônico

`src/lib/billingSafeDate.ts`

| Função | Uso |
|--------|-----|
| `DEFAULT_FINANCIAL_TIMEZONE` | `America/Sao_Paulo` |
| `resolveFinancialTimeZone(tz?)` | Valida IANA; fallback SP |
| `financialTodayYmd(tz?)` | “Hoje” civil no fuso da conta |
| `formatYmdBrSafe(ymd)` | Datas YYYY-MM-DD → dd/MM/yyyy |
| `formatDateTimeBrSafe(iso, tz?)` | Instantes ISO no fuso da conta |
| `safeDate(ymd)` | Parse civil com âncora UTC meio-dia |

## Onde aplicado (4.1M)

- `FinancialEventStoreProvider` — `today` do store via `financialTodayYmd(detail.tenant_billing.timezone)`
- `ConfirmPaymentDialog` — data padrão e label de fuso
- `FinancialTechnicalAccordion` — timestamps de worker/geração

## Regra

Toda data **civil** (vencimento, competência, pagamento) usa YMD + âncora UTC.  
Toda data **instantânea** (logs, `created_at`, worker) usa `formatDateTimeBrSafe(..., tenantTz)`.

## Próximos passos (fora do escopo imediato)

Migrar `new Date().toISOString().slice(0,10)` nos builders `subscriptionFinancial*.ts` para `financialTodayYmd` quando o `detail` estiver disponível.
