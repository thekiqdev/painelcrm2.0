# Financial History Consistency Report — Sprint 4.1L

## Histórico unificado

O histórico agora inclui `upcoming_cycle` → status **Prevista**.

## Destaque

| Campo | Regra |
|-------|-------|
| `isNextCharge` | Exatamente uma linha = `resolveNextChargeEvent()` |
| `canGenerateNow` | Somente a linha destacada sem invoice |
| Badge | "Próxima cobrança" na linha destacada |

## Status suportados

Prevista · Pendente · Emitida · Paga · Cancelada · Reembolsada · Falhou

## Após geração

1. Invoice aparece como **Emitida** no histórico
2. Próxima **Prevista** recebe destaque + botão
3. Card e Sidebar sincronizados via mesma coleção

_Sprint 4.1L_
