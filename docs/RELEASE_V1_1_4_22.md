# Atualização da Plataforma — v1.1.4.22

## Resumo

Esta versão entrega a **grande evolução da área de Assinaturas CRM**: nova experiência financeira unificada, confirmação de pagamento inline, motor de billing certificado para produção e shell de performance no detalhe da assinatura. O foco é operação recorrente confiável (semanal/mensal), visão financeira consistente e menos fricção para o utilizador — sem sair da tela da assinatura para ações críticas.

---

## Assinaturas — upgrade visual e experiência

### Detalhe da assinatura (nova experiência financeira)

- **Calendário financeiro** com competências futuras (previstas) e eventos por dia.
- **Histórico financeiro inteligente** com filtros, busca e estados unificados (Prevista, Pendente, Emitida, Paga, Cancelada, etc.).
- **Card “Próxima cobrança”** alinhado ao histórico e à sidebar — mesma competência, mesmo destaque.
- **Sidebar financeira** com próximo recebimento, último pagamento e valores em aberto.
- **KPIs e insights** derivados da mesma fonte de eventos (`FinancialEventStore`).
- **Timeline operacional** e painéis de contrato/pendências com datas seguras (sem erros de timezone na UI).
- **Shell-first / lazy loading**: secções pesadas carregam sob demanda para abrir a assinatura mais rápido.

### Fonte única de verdade (Sprint 4.1L)

- Todos os componentes financeiros consomem a mesma coleção `subscriptionFinancialEvents`.
- Apenas a **próxima competência prevista** aparece no histórico (demais previstas ficam no calendário).
- Selo **“Próxima cobrança”** e botão **“Gerar agora”** migram automaticamente após geração manual ou automática.
- Paridade validada: Calendário = Histórico = Sidebar = Card.

### Confirmação de pagamento (Sprint 4.1M)

- Botão **Confirmar pagamento** abre dialog **na própria assinatura** (sem redirecionar para a fatura).
- Campos: valor recebido, data do pagamento, forma de pagamento, **conta bancária** (lista do financeiro; auto-seleção se houver só uma), observações.
- Após confirmar: histórico, KPIs, calendário e sidebar atualizam **sem F5**.
- Ícone de confirmar pagamento **oculto** quando a cobrança já está paga.
- Datas financeiras no **fuso da conta** (`America/Sao_Paulo` por defeito).

### Lista e contratos

- Melhorias na listagem de assinaturas e filtros de período.
- Painéis de **histórico de contrato**, banner de contrato pendente e edição de contrato.
- Exibição recorrente e labels de periodicidade alinhados ao billing semanal.

### Ações diretas na cobrança

- Ícones para abrir cobrança, copiar link público e confirmar pagamento (quando aplicável).
- Geração manual de cobrança a partir do histórico (competência destacada).

---

## Motor de billing e plataforma (backend)

### Billing Engine 3.0 + Billing Platform 4.0

- **Billing Plans** e **Billing Plan Items** com provisionamento e reparo automático.
- **Billing Runtime** certificado (4.1J): validação de datas, ciclos, invoices e reparo recoverable.
- **Pipeline de próxima cobrança** (4.1K): promoção automática da competência seguinte após gerar.
- **Renewal engine** e worker CRM com rastreio de lifecycle e persistência endurecida.

### Certificação para produção (Sprint 4.2)

- Novo comando: `npm run billing:production-cert`
- Auditoria de todas as assinaturas, worker, financeiro, migração, calendário, timezone e performance.
- Artefatos JSON em `storage/debug/billing-production/`
- Checklist de deploy com 16 itens (`docs/billing/BILLING_DEPLOY_CHECKLIST.md`)

### API e confirmação manual de pagamento

- `POST /api/customer-invoices/:id/confirm-manual-payment` aceita data, método, notas e conta financeira.
- Integração com lançamento no módulo financeiro unificado quando conta selecionada.

---

## Migrações de base de dados

Executar migrações em `database/init` (ordem em `packages/backend/src/startup/migrationOrder.ts`), incluindo scripts **279–290**:

| Script | Tema |
|--------|------|
| 279–282 | Billing plans, domain hardening, items, versioning |
| 283–289 | Shadow, consistency, migration readiness, simulation, cutover, certification |
| 290 | Strategy GA cleanup |

---

## Comandos úteis pós-deploy

```bash
cd packages/backend
npm run migrate:tsx
npm run billing:production-cert
npm run billing:subscription-cycles-reconcile
```

---

## Impacto para o utilizador

- Visão financeira da assinatura **clara e consistente** — uma só “próxima cobrança” em todo o ecrã.
- **Confirmar pagamento** sem sair da assinatura, com escolha do banco recebedor.
- **Gerar cobrança** e ver o destaque migrar para a competência seguinte imediatamente.
- Menos erros de data na interface e maior confiança na recorrência semanal/mensal.
- Plataforma preparada para **deploy em produção** com auditoria automatizada.

---

## Documentação principal

- `docs/billing/BILLING_PRODUCTION_READINESS.md`
- `docs/billing/FINANCIAL_EXPERIENCE_CERTIFICATION.md`
- `docs/billing/PAYMENT_CONFIRMATION_UX_REPORT.md`
- `docs/billing/BILLING_DEPLOY_CHECKLIST.md`
- `docs/billing/BILLING_RUNTIME_CERTIFICATION.md`

---

## Notas de deploy

1. Fazer **backup** da base de dados antes das migrações.
2. Aplicar migrações e reiniciar API + workers (`billing:scheduler`, `billing:worker`).
3. Correr `npm run billing:production-cert` e validar checklist verde.
4. Não versionar `.env` nem artefatos em `storage/debug/`.

---

*Branch: `deploy-v1.1.4.22`.*
