# Billing Deploy Checklist — Sprint 4.2 / 4.2A

Executar `npm run billing:production-validation` (recomendado) ou `npm run billing:production-cert` e verificar artefatos em `storage/debug/billing-production/`.

## Gate Sprint 4.2A

- [ ] `billing:production-validation` → `status: PRODUCTION READY`
- [ ] `billing_health_score >= 99`
- [ ] `certificates.auditor: AUDITOR CERTIFIED`
- [ ] `definition_of_done[]` todos `passed: true`

## Checklist (16 itens — Sprint 4.2)

- [ ] Todas as assinaturas certificadas
- [ ] Nenhum Billing Plan órfão
- [ ] Nenhum Billing Item órfão
- [ ] Nenhum ciclo inconsistente
- [ ] Nenhuma invoice órfã
- [ ] Nenhuma assinatura sem próxima cobrança
- [ ] Nenhum erro de timezone
- [ ] Nenhum SQL inválido
- [ ] Worker aprovado
- [ ] Scheduler aprovado
- [ ] Retry aprovado
- [ ] Performance aprovada
- [ ] Calendário consistente
- [ ] Histórico consistente
- [ ] Próxima cobrança consistente
- [ ] Assinaturas antigas migradas automaticamente

## Gate

`deployment_approved: true` e `status: PRODUCTION READY`

## Comandos relacionados

```bash
npm run billing:production-validation
npm run billing:production-cert
npm run billing:production-cert -- --dry-run
npm run billing:production-validation -- --tenant=<uuid> --limit=1000
npm run billing:subscription-cycles-reconcile
npm run billing:pipeline-cert
```
