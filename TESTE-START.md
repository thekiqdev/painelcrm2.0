# ✅ Script start.bat Corrigido

## O que foi corrigido:

1. **Node.js no PATH**: Agora adiciona Node.js ao PATH antes de executar qualquer comando npm
2. **Backend usa npx**: O backend agora usa `npx tsx` que encontra automaticamente o tsx em node_modules/.bin
3. **Instalação de dependências**: Garante que node está no PATH antes de instalar
4. **Verificações melhoradas**: Verifica se dependências estão instaladas antes de executar

## Como usar:

```batch
.\start.bat
```

## O que o script faz:

1. ✅ Encontra npm automaticamente
2. ✅ Extrai diretório do Node.js
3. ✅ Adiciona Node.js ao PATH
4. ✅ Verifica Docker (já está rodando ✅)
5. ✅ Inicia Docker se necessário
6. ✅ Instala dependências do backend (se necessário)
7. ✅ Inicia Backend em nova janela usando npx tsx
8. ✅ Instala dependências do frontend (se necessário)
9. ✅ Inicia Frontend em nova janela

## URLs após iniciar:

- **Frontend**: http://localhost:5173 (ou 8080/8081 se 5173 estiver em uso)
- **Backend**: http://localhost:3001
- **Health**: http://localhost:3001/health

## Credenciais Admin:

- **Email**: `admin@painelcrm.com`
- **Telefone**: `5511999999999`
- **Senha**: `admin123`

