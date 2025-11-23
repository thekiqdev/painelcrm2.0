# ✅ Correção: Vite não encontrado

## Problema

O erro `'vite' não é reconhecido como um comando interno` ocorre porque:
- O `vite` está instalado em `node_modules/.bin/vite`
- O npm normalmente adiciona isso ao PATH automaticamente, mas pode não estar funcionando
- As dependências podem não ter sido instaladas corretamente

## Solução Implementada

Os scripts agora:
1. **Verificam se `node_modules` existe**
2. **Verificam se `vite` está instalado** (em `node_modules/.bin/vite.cmd` ou `vite`)
3. **Adicionam `node_modules/.bin` ao PATH** antes de executar `npm run dev`
4. **Reinstalam dependências** se o vite não for encontrado

## Como Funciona

1. O script verifica se `node_modules` existe
2. Verifica se `vite` está em `node_modules/.bin`
3. Se não encontrar, reinstala as dependências
4. Adiciona `node_modules/.bin` ao PATH
5. Executa `npm run dev` (que agora consegue encontrar o vite)

## Teste

Execute novamente:
```batch
.\start.bat
```

Agora o vite deve ser encontrado e o frontend deve iniciar corretamente!

## Se Ainda Não Funcionar

Execute manualmente no diretório do frontend:
```batch
cd D:\AGENCIA\SITES\painelcrm.com\PROJETOS\painelcrm
npm install
npm run dev
```

Isso garantirá que todas as dependências sejam instaladas corretamente.

