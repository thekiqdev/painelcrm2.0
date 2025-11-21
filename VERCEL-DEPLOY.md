# Guia de Deploy no Vercel

Este guia explica como fazer o deploy do frontend no Vercel.

## Configuração Inicial

1. **Conectar o repositório ao Vercel**
   - Acesse [vercel.com](https://vercel.com)
   - Importe o repositório GitHub
   - O Vercel detectará automaticamente que é um projeto Vite

## Variáveis de Ambiente

Configure as seguintes variáveis de ambiente no painel do Vercel:

### Variáveis Obrigatórias

```
VITE_API_URL=https://seu-backend.com/api
```

**Importante:** Substitua `https://seu-backend.com/api` pela URL real do seu backend.

### Exemplo de Configuração

Se o backend estiver em:
- **Railway**: `https://seu-app.railway.app`
- **Render**: `https://seu-app.onrender.com`
- **VPS própria**: `https://api.seudominio.com`

Configure:
```
VITE_API_URL=https://seu-backend.com/api
```

## Estrutura do Projeto

O Vercel está configurado para:
- **Framework**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

## Arquivos de Configuração

- `vercel.json` - Configuração do Vercel
- `.vercelignore` - Arquivos ignorados no deploy (backend, docker, etc.)

## Notas Importantes

1. **Backend Separado**: O Vercel só faz deploy do frontend. O backend precisa estar hospedado separadamente (Railway, Render, VPS, etc.)

2. **CORS**: Certifique-se de que o backend permite requisições do domínio do Vercel:
   ```
   FRONTEND_URL=https://seu-app.vercel.app
   ```

3. **Build**: O build é feito automaticamente pelo Vercel a cada push no branch `main`

## Troubleshooting

### Erro: "Cannot find module"
- Verifique se todas as dependências estão no `package.json`
- Execute `npm install` localmente para verificar

### Erro: "Build failed"
- Verifique os logs do build no Vercel
- Teste o build localmente: `npm run build`

### Erro: "API URL not found"
- Configure a variável `VITE_API_URL` no painel do Vercel
- Verifique se a URL está correta (com `/api` no final se necessário)

## Deploy Manual

Se precisar fazer deploy manual:

```bash
# Instalar Vercel CLI
npm i -g vercel

# Fazer deploy
vercel

# Deploy em produção
vercel --prod
```

