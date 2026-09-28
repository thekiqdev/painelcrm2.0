# Billing 2.0 Sprint 9 — PCI / Tokenização (ops)

## Princípio

PainelCRM **nunca** armazena PAN nem CVV. Só persiste `creditCardToken` do Asaas + máscara (`brand` / `last4`).

## Onde os dados vivem

| Dado | Onde | Notas |
|------|------|-------|
| PAN / CVV | Só no request ao Asaas (memória transitória) | Não logar; não gravar em `gateway_metadata` |
| `creditCardToken` | `subscriptions.card_token` | Gateway-safe; tratar como segredo |
| last4 / brand | `subscriptions.card_last4` / `card_brand` | UI `/saas-pay` |
| Audit | `billing_audit_events` | Keys sensíveis redigidas (`token` → `[redacted]`) |

## Feature Flag

- `billing2.card_auto_renew` default **OFF**
- OFF = renovação continua charge aberta (PIX/boleto/cartão manual em `/saas-pay`)
- ON + token = captura automática na renovação (engine OFF captura no worker; engine ON via action `charge_card`)

## Pré-requisito Asaas

Tokenização precisa estar **habilitada na conta** (sandbox já; produção via gerente Asaas). Ver `BILLING2_SPRINT0_ASAAS_SPIKE.md`.

## Troca de cartão

Em `/saas-pay`: pagar com formulário novo substitui o token (`upsert`). “Pagar com cartão salvo” usa `use_saved_card: true`.

## Rollback

1. Super Admin → `billing2.card_auto_renew` = OFF  
2. Tokens podem permanecer no banco (inertes)  
3. Limpar token: `card_token_status = cleared` / NULL via ops se necessário  

## Proibido

- Logar número de cartão, CVV ou token completo  
- Enviar token para analytics / SIEM sem máscara  
- Usar Assinatura nativa Asaas como SSOT (fora do escopo S9)
