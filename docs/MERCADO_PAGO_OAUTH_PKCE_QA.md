# QA manual — OAuth Mercado Pago com PKCE (Fase 2)

## Pré-requisitos

- Migração `181_mercado_pago_oauth_pkce.sql` aplicada (tabela `mercado_pago_oauth_pkce_challenges`).
- `MERCADO_PAGO_GATEWAY_ENABLED=true` e variáveis OAuth preenchidas no servidor.
- Redirect URI no painel Mercado Pago igual a `MERCADO_PAGO_REDIRECT_URI`.

## Checklist

1. **Connect**  
   - Em Configurações → Pagamentos → Mercado Pago, clicar **Conectar Mercado Pago**.  
   - Confirmar redirecionamento para `auth.mercadopago.com.br` (ou base configurada) com parâmetros incluindo `code_challenge` e `code_challenge_method=S256`.

2. **Autorizar**  
   - Concluir login/autorização no Mercado Pago.

3. **Callback**  
   - Voltar ao PainelCRM sem erro `code_verifier`.  
   - Mensagem de sucesso ou estado **Conectado** no card.

4. **Status**  
   - `GET /api/integrations/mercado-pago/status` (logado) deve indicar conexão ativa.

5. **Testar conexão**  
   - Botão **Testar conexão** deve concluir com sucesso.

6. **Desconectar**  
   - **Desconectar** deve limpar tokens da configuração MP do tenant.

7. **Repetir**  
   - Conectar novamente após desconectar — fluxo completo deve funcionar.

## Erros esperados (comportamento)

- **“Sessão OAuth expirada ou inválida…”** — novo fluxo sem PKCE salvo (expirou ~10 min, outro dispositivo limpou a linha, ou migração não aplicada). Solução: iniciar **Conectar** de novo.

## Fora do âmbito deste QA

- Webhooks Mercado Pago e mensagens `production_webhook_secret_rejected` de outros fluxos.
- Cobrança / domínio de pagamento principal (Asaas).
