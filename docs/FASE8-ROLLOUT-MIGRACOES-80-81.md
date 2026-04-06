# Rollout — Migrações 80 e 81 (Fase 8)

**Objetivo:** processo seguro de aplicação das migrações `customer_invoice_items` (80) e `customer_invoices` hierarquia (81), com **fallback** já implementado no backend.

---

## O que as migrações fazem

| Arquivo | Efeito |
|---------|--------|
| `database/init/80_customer_invoice_items_advanced_schedule.sql` | Colunas em `customer_invoice_items`: `is_recurring`, `recurring_interval`, `scheduled_due_date` (agendamento / recorrência por item). |
| `database/init/81_customer_invoice_parent_child_e2.sql` | Colunas em `customer_invoices`: `parent_invoice_id`, `parent_invoice_item_id` (E2 / fatura filha). |

Ordem em `packages/backend/src/migrate.ts`: **80 antes de 81**.

---

## Fallback no código (sem colunas)

`packages/backend/src/services/customerInvoiceSchema.ts` — `getCustomerInvoiceSchema()` consulta `information_schema` e expõe:

- `hasInvoiceItemAdvancedColumns` — true somente se as **3** colunas da 80 existirem.
- `hasParentInvoiceColumns` — true somente se as **2** colunas da 81 existirem.

Serviços relevantes ramificam `INSERT`/`SELECT` para **não** referenciar colunas inexistentes (evita 500 em deploy antecipado do código).

**Comportamento degradado sem migração 80:** criação/edição de itens com flags de recorrência/agendamento **não persiste** esses campos até a 80 rodar.

**Comportamento degradado sem migração 81:** relações pai/filho em fatura **não persistem** até a 81 rodar.

---

## Processo de rollout recomendado

1. **Staging**
   - Backup do banco (ou ambiente descartável).
   - Aplicar migrações na ordem **80 → 81** (mesmo mecanismo de produção: `migrate.ts` / scripts SQL idempotentes conforme projeto).
   - Reiniciar API.
2. **Smoke pós-migração**
   - `POST /api/customer-invoices` com payload que use itens avançados (se a UI/API expuser).
   - Listagem/detalhe de fatura e itens sem erro 500.
   - (Se E2 ativo) criar cenário com vínculo pai/filho e validar `GET` de detalhe.
3. **Produção**
   - Janela de baixo tráfego.
   - Backup.
   - Aplicar **80**, depois **81**, reiniciar API.
   - Repetir smoke mínimo (criar fatura simples + uma com item recorrente se aplicável).

---

## Rollback

- **Preferência:** restaurar backup do banco **antes** das migrações se houver falha grave.
- **Não** remover colunas em hotfix sem plano: pode quebrar código que já persiste nelas.
- Código atual **tolerante** a ausência de colunas: em cenário extremo, reverter **apenas** deploy da API para versão anterior **e** manter colunas (estado híbrido raro) — alinhar com time antes.

---

## Evidência / critério Fase 8

- Ticket ou checklist interno com: data, ambiente, executor, resultado do smoke.
- Referência cruzada: `docs/PLANO-CORRECAO-FASE-8-V2.md` §6 (migrações 80/81).

---

## Checklist de produção (completo)

- **Aceite formal por ambiente (recomendado):** `docs/FASE8-ACEITE-OPERACIONAL.md` — smokes **S1–S9**, evidências, go/no-go.  
- **Passo a passo com comandos:** `docs/FASE8-VALIDACAO-AMBIENTE.md`.  
- Lista compacta (auditoria): `docs/FASE8-AUDITORIA-FINAL.md` §6.  
Preencher por ambiente e arquivar evidência (ticket / run).
