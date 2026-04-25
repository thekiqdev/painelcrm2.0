# Correção: cadastro, pagamento e piloto (abr/2026)

## Causas encontradas no código

1. **Cadastro sem notificação**  
   - O fluxo legado `POST /api/auth/register` (`authController.register`) criava o tenant mas **não** chamava `schedulePublishPlatformAccountCreated`, ao contrário de `registerOrganization` e do checkout.  
   - Além disso, a lista de piloto em `platform_notifications_pilot_target_tenant_ids` era aplicada a **todas** as entregas no orquestrador; tenants novos (UUID fora da lista) falhavam com erro de piloto antes de criar delivery.

2. **Pagamento sem notificação**  
   - Mesmo bloqueio de **piloto** (acima).  
   - `publishPlatformBillingPaymentConfirmed` saía cedo se `status !== 'paid'` **e** não tratava o caso em que `paid_at` já estava preenchido (possível desvio eventual entre colunas). Agora considera pago se `status = paid` **ou** `paid_at` não nulo, com log quando ignora.

3. **Trial**  
   - Não existiam eventos `platform.trial.started` / `platform.trial.ended` no catálogo nem publicação nos fluxos; o fim do trial só suspendia o tenant no job `expireTrialsPastDue`.

## Alterações principais

- Piloto restringe apenas **simulações** (`entityType === 'simulate'` ou `metadata.simulate`); eventos de negócio reais não são bloqueados pelo CSV de tenants.  
- `register` dispara boas-vindas + trial started quando aplicável.  
- `expireTrialsPastDue` agenda `platform.trial.ended` por tenant suspenso.  
- Migração `142_platform_notifications_trial_and_template_refresh.sql`: novos eventos + templates e revisão de textos/merge fields.
