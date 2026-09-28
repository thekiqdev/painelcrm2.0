# Fase 8 — Controle de Execução

## 1. Tabela de ambientes

## 1.1 Modelo vigente (rastreável e seguro)

> Use as tabelas atualizadas nas seções `## 1` (ambientes), `## 2` (histórico), `## 3` (regras) e `## 4` (critério) como fonte de verdade para operação.

| Ambiente | Status | Versão/Commit | Data de início | Data de conclusão | Responsável | Resultado |
|----------|--------|----------------|-------------------|-------------------|-------------|-----------|
| staging | pendente |  |  |  |  |  |
| produção | pendente |  |  |  |  |  |

**Valores permitidos**
- Status: `pendente` / `em execução` / `validando` / `aprovado` / `reprovado`
- Resultado: `GO` / `NO-GO`

## 2. Histórico de execuções

| Data | Ambiente | Responsável | Resultado | Evidência | Observações |
|------|----------|-------------|-----------|-----------|-------------|
|  |  |  |  |  |  |

## 3. Regras de execução

- staging deve ser validado antes de produção.
- produção só pode ser executado após staging com resultado `GO`.
- qualquer `NO-GO` exige nova execução completa do ambiente (runbook inteiro).
- qualquer `NO-GO` deve conter motivo obrigatório em **Observações**.
- toda execução deve conter link de evidência (preencher coluna **Evidência** e anexar ticket/registro do ambiente).

## 4. Critério organizacional

- A Fase 8 só é considerada concluída quando **todos os ambientes** estiverem com resultado `GO`.
- o resultado deve estar vinculado a uma **Versão/Commit** específica.
- evidência deve ser obrigatória para cada ambiente (preencher coluna **Evidência** e anexar ticket/registro do ambiente).

