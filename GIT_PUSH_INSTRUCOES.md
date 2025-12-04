# Instruções para fazer push para GitHub

Execute os seguintes comandos no PowerShell na ordem:

```powershell
cd "d:\AGENCIA\SITES\painelcrm.com\PROJETOS\painelcrm"

# 1. Verificar status
git status

# 2. Adicionar todos os arquivos
git add -A

# 3. Verificar o que será commitado
git status --short

# 4. Criar commit
git commit -m "fix: corrige erro Url.parse is not a function no WebSocket com polyfill customizado" -m "- Adiciona polyfill customizado para módulo url" -m "- Configura Vite para usar polyfill via alias" -m "- Atualiza main.tsx para carregar polyfill"

# 5. Verificar branch
git branch --show-current

# 6. Fazer push
git push origin deploy-v1.1.2.1

# Se o push falhar, tentar com force (cuidado!)
# git push origin deploy-v1.1.2.1 --force
```

## Arquivos que devem estar no commit:

- `src/polyfills/url-polyfill.ts` (novo arquivo)
- `src/main.tsx` (modificado)
- `vite.config.ts` (modificado)

## Verificar se o push foi bem-sucedido:

```powershell
git log --oneline -1
git log origin/deploy-v1.1.2.1..HEAD --oneline
```

Se o segundo comando não retornar nada, significa que local e remoto estão sincronizados.
