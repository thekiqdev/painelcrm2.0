# Plano de sprints — Assentos avulsos (SE)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-28 |
| **Tipo** | Plano comercial (catálogo + Meu Plano) |
| **Nome** | **SE — Usuários avulsos em planos com teto** |
| **Status** | **S1–S2 feitos** · S3 pendente |
| **Modelo** | Espelha WhatsApp extra (WI2–WI4): preço no catálogo → add-on → renovação |

---

## 1. Meta do produto

1. Na home `#planos`, destacar quantos usuários o plano inclui quando `max_users` está definido.
2. Na criação/edição do plano (Super Admin), informar **valor por usuário avulso**.
3. Depois (S2–S3): quem contratou plano com teto pode comprar mais usuários no Meu Plano, como no personalizado — com cobrança correta na renovação.

---

## 2. Decisões

| ID | Decisão |
|----|----------|
| **D-SE.1** | Reutilizar `plan_interval_prices.price_per_user_cents` no plano **standard** = preço unitário de **usuário além do incluso** (não é o preço base do plano) |
| **D-SE.2** | No **custom**, `price_per_user_cents` continua sendo o preço base por usuário |
| **D-SE.3** | `max_users` NULL = ilimitado → sem venda de avulso (S2) |
| **D-SE.4** | S1 = vitrine + catálogo; compra e renovação ficam S2/S3 |

---

## 3. Sprints

| Sprint | Escopo | Status |
|--------|--------|--------|
| **S1** | `#planos` destaca usuários inclusos; Super Admin: campo “valor por usuário avulso”; persistência no intervalo do plano | **Feito** |
| **S2** | Abrir `seat_addon` para standard com teto + preço; UI Meu Plano; freeze unitário; não corromper base flat | **Feito** |
| **S3** | Renovação: base do plano + `(override − max_users) × unit`; testes | Pendente |

---

## 4. Aceite S1

- [x] Card standard com `max_users` mostra destaque (ex. “Até N usuários”)
- [x] Se houver preço avulso, linha discreta “+ R$ X por usuário adicional”
- [x] Super Admin (plano standard): campo valor por usuário avulso
- [x] Save não zera mais `price_per_user_cents` no standard
- [x] S2/S3 não misturados nesta entrega

---

## 4.1 Aceite S2

- [x] Preview/checkout de assentos permite **standard** com `max_users` + preço avulso
- [x] Standard ilimitado ou sem preço → erro claro
- [x] Standard: extras podem ultrapassar `max_users` (incluso ≠ teto de compra)
- [x] Activate: grava `max_users_override` + congela `contracted_price_per_user_cents`; **não** sobrescreve `contracted_plan_price_cents` com pró-rata
- [x] Meu Plano: “Adicionar usuários” quando elegível (espelho WhatsApp)
- [x] Downgrade agendado no standard com piso = usuários inclusos
- [x] Renovação base+extras → **S3**

---

## 5. Próximo

**S3** — renovação: `amount = contracted_plan_price + (override − max_users) × unit`.
