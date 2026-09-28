# Fase 9 — Preparação

Documento de **preparação** para iniciar a Fase 9 com segurança. **Não** é o plano completo da Fase 9, **não** autoriza implementação neste momento e **não** substitui `docs/FASE9-RECORRENCIA-POR-ITEM.md` nem `docs/ENV-BILLING.md`.

**Pré-condição:** Fase 8 **aceita operacionalmente** no ambiente alvo (`docs/FASE8-ACEITE-OPERACIONAL.md` com **go**).

---

## 1. Escopo sugerido (visão enxuta)

A Fase 9, quando **aberta para execução**, deve girar em torno do que já está **descrito** no repositório:

- Motor de **recorrência por item** (regras D3, D5, E1, E2).
- **Flags** de ambiente (`BILLING_CHILD_ITEM_INVOICES_ENABLED`, `BILLING_CHILD_BATCH_LIMIT`).
- **Observabilidade** (`child_batch_summary`, logs `[BILLING]`).
- Ajustes operacionais e de qualidade **sobre o que já existe** — não reinvenção do fluxo de pagamento.

Este arquivo **não** lista backlog detalhado nem sprints.

---

## 2. Dependências já resolvidas na Fase 8

| Dependência | Onde foi endereçada |
|-------------|---------------------|
| Schema **80** (itens avançados) | Migração + código condicional; aceite operacional valida persistência. |
| Schema **81** (pai/filha E2) | Idem. |
| Documentação H (webhook, worker, PCI) | `H1`–`H4` consolidados na Fase 8. |
| Consistência gateway / UI fatura (A1) | Alinhado a `getActiveConfig` / provedor ativo. |
| Runbook migração | `FASE8-ROLLOUT-MIGRACOES-80-81.md` + `FASE8-ACEITE-OPERACIONAL.md`. |

Sem aceite Fase 8 **no mesmo ambiente**, avançar implementação Fase 9 aumenta risco de debug em schema degradado.

---

## 3. Decisões de negócio que precisam ser fechadas antes

Antes de **abrir** a Fase 9 para desenvolvimento ativo, recomenda-se decidir (mesmo que “manter como está”):

| Tema | Pergunta para produto / CS |
|------|----------------------------|
| **E2 em produção** | `BILLING_CHILD_ITEM_INVOICES_ENABLED` deve estar **on** por padrão em todos os tenants ou rollout gradual? |
| **Limites** | `BILLING_CHILD_BATCH_LIMIT` adequado ao volume esperado (default documentado vs. ajuste por ambiente). |
| **Degradação aceitável** | Se algum tenant ficar temporariamente sem 80/81, política de suporte e comunicação. |
| **Métricas** | Quais indicadores mínimos acompanhar após ligar worker E2 (já há direção em docs de Fase 9 / Fase 11 — não implementar agora, só acordar o que será olhado). |

Não é necessário fechar **G3**, **cartão embutido** ou **novos gateways** para iniciar a Fase 9 no escopo de recorrência por item.

---

## 4. Riscos técnicos (contexto)

| Risco | Nota |
|-------|------|
| Duplicação de regras entre serviços | Já citado em H4; mudanças futuras em `calculateNextItemDueDate` / idempotência exigem testes de regressão. |
| Worker + timezone / `period_start` | Cenários de borda já documentados em `FASE9-RECORRENCIA-POR-ITEM.md` — revisar antes de mudar código. |
| Carga no gateway | Filhas E2 geram cobranças adicionais — validar limites com operação. |

Estes itens são **para leitura e planejamento**; não implicam alteração de código neste documento.

---

## 5. O que **NÃO** deve ser implementado ainda

- **Pagamento embutido** (PAN na aplicação) ou mudança de contrato de **webhook** / **createCharge** como “primeiro entregável” da Fase 9.
- **Recorrência nova** não descrita em `FASE9-RECORRENCIA-POR-ITEM.md` (ex.: D4 “fatura inteira diária”) sem decisão explícita.
- **Refatoração ampla** da arquitetura de billing “de passagem” — Fase 9 deve ser incremental sobre o motor existente.
- Qualquer item listado como **fora de escopo** em `FASE8-STATUS-FINAL.md` (G3, multi-gateway na mesma fatura, etc.) **como dependência obrigatória** da Fase 9.

---

## 6. Próximo passo recomendado

1. Concluir **aceite operacional** da Fase 8 em **staging** e depois em **produção** (`FASE8-ACEITE-OPERACIONAL.md`).  
2. Reunião curta (produto + eng + ops): fechar §3 deste documento.  
3. Abrir **épico/ticket** “Fase 9 — execução” com referência a `FASE9-RECORRENCIA-POR-ITEM.md` e `ENV-BILLING.md` — **primeiro PR** só após esse gate.  
4. Manter **FASE9-PREPARACAO.md** como entrada; detalhamento de tarefas fica em issues, não necessariamente neste arquivo.

---

## Separação explícita

| Fase 8 (fechamento) | Fase 9 (preparação / depois execução) |
|----------------------|----------------------------------------|
| Aceite §3–§8 em `FASE8-ACEITE-OPERACIONAL.md` | Leitura de §1–§6 **deste** documento + docs técnicos da Fase 9 |
| Migrações 80/81 + smoke S1–S9 | Flags, worker, observabilidade, cenários E2 **já especificados** |
| Nenhuma nova feature de recorrência | Implementação **somente após** go operacional Fase 8 |

---

## Referências

- `docs/FASE8-ACEITE-OPERACIONAL.md`
- `docs/FASE8-STATUS-FINAL.md`
- `docs/FASE9-RECORRENCIA-POR-ITEM.md`
- `docs/ENV-BILLING.md`
- `docs/PLANO-EVOLUCAO-FATURAS-PROXIMAS-FASES.md` §6 (item 2)
- `docs/FASE11-OPERACAO-E-QUALIDADE.md` (operação / qualidade, se aplicável)
