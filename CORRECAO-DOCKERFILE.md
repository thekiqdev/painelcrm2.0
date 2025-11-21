# Correção do Dockerfile - Erro package-lock.json

## Problema

O erro ocorreu porque o `npm ci` precisa do `package-lock.json`, mas ele pode não estar sendo copiado corretamente ou não estar commitado no Git.

## Solução Aplicada

O Dockerfile foi atualizado para:

1. **Copiar explicitamente** o `package-lock.json` (se existir)
2. **Usar fallback** para `npm install` se o `package-lock.json` não existir
3. **Aplicar a mesma lógica** no stage de build e produção

## Próximos Passos

### 1. Verificar se package-lock.json está no Git

```bash
git ls-files packages/backend/package-lock.json
```

Se não estiver, adicione:

```bash
git add packages/backend/package-lock.json
git commit -m "Add package-lock.json for backend"
git push origin main
```

### 2. Fazer Commit do Dockerfile Corrigido

```bash
git add Dockerfile
git commit -m "Fix Dockerfile to handle package-lock.json correctly"
git push origin main
```

### 3. Tentar Deploy Novamente no Easypanel

Após o push, o Easypanel deve conseguir fazer o build corretamente.

## Alternativa: Gerar package-lock.json

Se o `package-lock.json` não existir, você pode gerá-lo:

```bash
cd packages/backend
npm install
cd ../..
git add packages/backend/package-lock.json
git commit -m "Add package-lock.json"
git push origin main
```

