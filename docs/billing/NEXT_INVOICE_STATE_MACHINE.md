# Next Invoice State Machine — Sprint 4.1K

```mermaid
stateDiagram-v2
  [*] --> ScanTimeline
  ScanTimeline --> CandidateFound: primeiro ciclo sem invoice
  ScanTimeline --> AwaitingScan: nenhum sem invoice
  AwaitingScan --> CandidateFound: awaiting_generation sem invoice
  AwaitingScan --> Project: nenhum na timeline
  Project --> CandidateFound: due projetado
  Project --> Empty: assinatura cancelada
  CandidateFound --> CardGenerate: invoice_id null
  CandidateFound --> CardOpen: invoice_id presente (edge)
  CardGenerate --> AfterGenerate: generateRenewalNow OK
  AfterGenerate --> ScanTimeline: load() atualiza detail
```

## Estados do candidato

| Estado | Card | Ação |
|--------|------|------|
| Sem invoice | Próxima cobrança | Gerar cobrança |
| Com invoice (edge) | Próxima cobrança | Abrir cobrança |
| Após gerar | Histórico + card promovido | Próxima competência |

## Invariantes

- Nunca duplicar competência no card
- Nunca perder competência futura
- Card sempre aponta para **primeiro ciclo futuro sem invoice**

_Sprint 4.1K_
