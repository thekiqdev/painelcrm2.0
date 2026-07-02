# Billing Deploy Checklist — Sprint 4.2

Executar `npm run billing:production-cert` e verificar `production-readiness-summary.json` → `checklist[]` todos `passed: true`.

## Checklist (16 itens)

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
npm run billing:production-cert
npm run billing:production-cert -- --dry-run
npm run billing:production-cert -- --tenant=<uuid> --limit=1000
npm run billing:subscription-cycles-reconcile
npm run billing:pipeline-cert
```
