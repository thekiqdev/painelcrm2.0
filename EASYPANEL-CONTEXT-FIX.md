# Correção: Erro "packages/backend/package.json not found"

## Problema

O Easypanel está tentando fazer build, mas não encontra `packages/backend/package.json`. Isso indica que o **contexto de build** não está correto.

## Solução Aplicada

O Dockerfile foi atualizado para:
1. Copiar **tudo** primeiro (`COPY . .`)
2. Verificar a estrutura antes de continuar
3. Trabalhar dentro do diretório correto

## Configuração no Easypanel

### ⚠️ IMPORTANTE: Build Context

No Easypanel, configure:

1. **Build Context**: Deve ser `.` (ponto = raiz do repositório)
   - **NÃO** use `packages/backend`
   - **NÃO** deixe vazio se o padrão não for a raiz

2. **Dockerfile Path**: `Dockerfile` (ou deixe vazio se estiver na raiz)

3. **Verificar Estrutura**: O repositório deve ter esta estrutura:
   ```
   painelcrm/
   ├── Dockerfile              ← Na raiz
   ├── packages/
   │   └── backend/
   │       ├── package.json
   │       ├── package-lock.json
   │       └── src/
   └── ...
   ```

## Passos para Corrigir no Easypanel

1. **Vá em Settings do serviço Backend**
2. **Verifique "Build Context"**:
   - Deve ser exatamente: `.` (ponto)
   - Se estiver vazio, tente colocar `.`
3. **Verifique "Dockerfile Path"**:
   - Deve ser: `Dockerfile` (sem caminho)
   - Ou deixe vazio se o Dockerfile estiver na raiz
4. **Salve e tente fazer deploy novamente**

## Teste Local

Antes de fazer deploy, teste localmente:

```bash
# Na raiz do repositório
docker build -f Dockerfile -t painelcrm-backend .
```

Se funcionar localmente, o problema é apenas na configuração do Easypanel.

## Alternativa: Dockerfile Simplificado

Se o problema persistir, podemos criar um Dockerfile que funciona mesmo se o contexto estiver errado, mas isso não é recomendado. O ideal é corrigir o Build Context no Easypanel.

