# IX Sprint 6 — Superfície pública

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-30 |
| **Sprint** | **IX6** concluída |
| **Plano** | [`PLAN_IX_IDIOMA_MOEDA_STRIPE.md`](./PLAN_IX_IDIOMA_MOEDA_STRIPE.md) |
| **Sprints** | [`PLAN_SPRINTS_IX_IDIOMA_MOEDA_STRIPE.md`](./PLAN_SPRINTS_IX_IDIOMA_MOEDA_STRIPE.md) |
| **Próximo** | **IX7** — tradução do aplicativo (`ok sprint ix7`) |

Landing, autenticação, checkout e o chrome das páginas legais ficam em pt-BR, en e es. O miolo do app logado fica para a IX7.

---

## O que entrou

- Namespaces `landing`, `auth`, `checkout` e `legal` em `src/locales/{pt-BR,en,es}` e em `complete` no `src/locales/manifest.json`. `npm run check:i18n` falha se faltar chave em en ou es.
- Landing SPA e a landing estática (nav, hero, recursos, como funciona, preços, CTA, rodapé e o mockup). Preço com `formatAppMoney` na moeda da IX2 e no catálogo da IX3. Nome e benefícios do plano continuam no texto da API; sem tradução, o fallback é pt-BR.
- Login, recuperação de senha, sucesso de cadastro e os títulos/CTAs do wizard de aquisição. `AcquisitionPremiumCheckout` só redireciona para o cadastro.
- `PlanCheckout`: rótulos, toasts e os estados de PIX, boleto e cartão.
- Páginas legais: título, lead e erros. O HTML publicado no CMS não é traduzido aqui.
- Seletor de idioma e moeda com rótulos do namespace `common`. A landing estática chama `i18n.changeLanguage` ao trocar o idioma.
- Código de verificação do cadastro (WhatsApp) no idioma do pedido.
- Templates `platform.account.created` (WhatsApp e e-mail) e `platform.auth.password_reset_code_issued` (WhatsApp) em en e es — migration `351_ix6_account_locale_templates.sql`. O motor usa o locale pedido e, se a linha não existir, o template pt-BR. Cobranças e os demais eventos da plataforma continuam em pt-BR (IX9).

O idioma da sessão vem de `?lang`, cookie `painelcrm_locale`, `X-App-Locale` ou `Accept-Language`. No cadastro da conta, esse locale é gravado em `profiles.locale` quando o campo ainda está vazio, e a boas-vindas usa esse valor.

---

## Fora

App logado (menu, CRM, chat, financeiro). Catálogo completo de templates da plataforma. Conteúdo jurídico do CMS. Nome do plano sem `plan_translations`.
