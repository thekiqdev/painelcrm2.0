# 🔧 Solução: tsx não encontrado

## Problema
O `tsx` não está sendo encontrado porque as dependências de desenvolvimento não foram instaladas.

## Solução

### Opção 1: Reinstalar Dependências

Execute no diretório do backend:
```powershell
cd packages\backend
& "C:\Program Files\nodejs\npm.cmd" install
```

Isso instalará todas as dependências, incluindo `tsx` que está em `devDependencies`.

### Opção 2: Usar o Script Atualizado

O script `iniciar-backend-simples.bat` foi atualizado para:
- Verificar se `tsx` existe
- Reinstalar dependências se necessário
- Usar `npx` que encontra `tsx` automaticamente

Execute:
```batch
.\iniciar-backend-simples.bat
```

### Opção 3: Usar npx Diretamente

Após instalar dependências, você pode usar:
```powershell
cd packages\backend
& "C:\Program Files\nodejs\npx.cmd" tsx watch src/index.ts
```

O `npx` encontra automaticamente o `tsx` em `node_modules/.bin`.

## Verificar Instalação

Para verificar se `tsx` foi instalado:
```powershell
Test-Path "packages\backend\node_modules\.bin\tsx.cmd"
```

Deve retornar `True`.

