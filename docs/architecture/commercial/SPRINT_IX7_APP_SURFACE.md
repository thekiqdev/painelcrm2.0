# Sprint IX7 — Tradução do aplicativo

**Status:** concluída  
**Plano:** [PLAN_SPRINTS_IX_IDIOMA_MOEDA_STRIPE.md](./PLAN_SPRINTS_IX_IDIOMA_MOEDA_STRIPE.md)

## Entrega

O dia a dia do CRM (menu, dashboard, leads, clientes, funil, chat, agenda, tickets e configurações gerais) lê os namespaces `nav`, `dashboard`, `crm`, `chat`, `agenda`, `tickets` e `settings` em pt-BR, en e es.

Datas dessas telas passam por `dateFnsLocale()` (`formatApp.ts`). A preferência de idioma do perfil (IX1/IX2) continua a fonte: o próximo carregamento aplica o locale.

## O que não traduz

- Corpo de mensagens de WhatsApp e nomes de clientes/leads.
- Miolo de financeiro, contratos, propostas, loja e automações (IX8). Os rótulos desses itens no menu já estão no namespace `nav`.

## Verificação

`npm run check:i18n` — 12 namespaces completos.
