# Planos — Guia operacional

Resumo para operadores e desenvolvedores: tipos de plano, plano padrão e validações.  
Detalhes de implementação: [PLANO-PLANOS-PERSONALIZADOS-E-PADRAO.md](PLANO-PLANOS-PERSONALIZADOS-E-PADRAO.md).

---

## Tipos de plano

| Tipo | Descrição | Cobrança |
|------|-----------|----------|
| **Standard** | Preço fixo e limites fixos (máx. usuários, perfis, instâncias WhatsApp). | Valor fixo por intervalo (mensal, trimestral, semestral ou anual). |
| **Personalizado (custom)** | Preço por usuário; quantidade de usuários e instâncias definida por empresa (overrides). | Valor = (preço por usuário no intervalo) × (usuários contratados). Permite intervalos: mensal, trimestral, semestral, anual. |

---

## Plano padrão

- **O que é:** o plano marcado como **padrão** é atribuído automaticamente a **novos cadastros feitos pelo site** (registro público, `created_via = 'registration'`).
- **Como definir:** no Super Admin, em **Planos**, edite o plano desejado e marque o checkbox **"Plano padrão (atribuído em novos cadastros no site)"**. Ao salvar, os demais planos são desmarcados (só pode haver um plano padrão).
- **Migração:** se nenhum plano estiver marcado como padrão, a migration `41_seed_default_plan.sql` define como padrão o primeiro plano ativo por ordem de exibição.

---

## Validações

- **Plano personalizado:** é obrigatório ter pelo menos um preço por intervalo em "Preço por usuário por periodicidade" (mensal, trimestral, semestral ou anual). Na edição, se o plano for custom e não houver preços salvos, a API exige o envio de `interval_prices` com pelo menos um item.
- **Plano padrão:** a aplicação garante que apenas um plano tenha `is_default = true` ao salvar.
