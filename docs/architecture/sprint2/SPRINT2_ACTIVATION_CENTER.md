# Sprint 2 — Central de Ativação da Operação

## Objetivo

Transformar o checklist do dashboard em uma **Central de Ativação** premium, sem alterar backend, regras ou banco.

## Escopo

| Incluído | Excluído |
|----------|----------|
| UI em `DashboardActivationBlock.tsx` | Nova tabela / rota / onboarding |
| Mesmo endpoint `GET /api/dashboard/activation-checklist` | Alteração em `activationChecklistService.ts` |
| Mesmas 5 missões e `progressPercent` | Novo motor de progresso |

## Missões (regras inalteradas)

1. WhatsApp conectado
2. Primeiro cliente
3. Gateway configurado
4. Primeira cobrança
5. Usuários convidados (se plano permitir)

## UI

- **Header:** “Sua operação está X% pronta” + subtítulo fixo
- **Barra:** animação suave do percentual (valor da API)
- **Cards:** status, título, descrição, CTA por missão
- **100%:** “Operação totalmente configurada” + ocultar permanente (`dismiss`)
- **Mobile:** bloco “Próxima ação recomendada” + botão sticky com CTA da missão prioritária

## Arquivo

`src/components/dashboard/DashboardActivationBlock.tsx`
