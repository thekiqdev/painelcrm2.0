# 🚀 Iniciar o Sistema Completo

## Script Único para Iniciar Tudo

Agora você pode iniciar Docker, Backend e Frontend com um único comando!

### ⚡ Método Mais Fácil (Recomendado)

**Windows:**
```batch
start.bat
```

Ou usando npm:
```bash
npm run start
```

### Método Alternativo (PowerShell)

Se preferir usar PowerShell diretamente:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1
```

Ou:
```bash
npm run start:ps1
```

### Linux/Mac

```bash
./scripts/start.sh
```

## O que o script faz

1. ✅ Verifica se Docker está rodando
2. ✅ Inicia PostgreSQL no Docker
3. ✅ Verifica e instala dependências do Backend (se necessário)
4. ✅ Verifica e instala dependências do Frontend (se necessário)
5. ✅ Inicia Backend em nova janela/terminal
6. ✅ Inicia Frontend em nova janela/terminal

## URLs Após Iniciar

- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:3001
- **Health Check**: http://localhost:3001/health

## Parar os Serviços

### Parar Frontend/Backend
- Feche as janelas dos terminais ou pressione `Ctrl+C`

### Parar Docker
```bash
docker-compose down
```

## Troubleshooting

### Erro: "Docker não está rodando"
- Inicie o Docker Desktop (Windows/Mac) ou serviço Docker (Linux)

### Erro: "npm não encontrado"
- **Solução 1**: Reinicie o terminal após instalar Node.js
- **Solução 2**: Execute manualmente nas janelas abertas:
  - Backend: `cd packages/backend && npm install && npm run dev`
  - Frontend: `npm install && npm run dev`
- **Solução 3**: Verifique se Node.js está instalado: `node --version`

### Erro: "Porta já está em uso"
- Verifique se os serviços já estão rodando
- Pare os processos existentes

### Erro de Política de Execução (PowerShell)
- Use `start.bat` ao invés de `.\scripts\start.ps1`
- Ou execute: `powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1`

### Backend/Frontend não abrem em nova janela
- Execute manualmente:
  - Backend: `cd packages/backend && npm run dev`
  - Frontend: `npm run dev`

### PostgreSQL não inicia
- Verifique os logs: `docker-compose logs postgres`
- Verifique se a porta 5432 está livre

## Iniciar Manualmente (se o script não funcionar)

### 1. Docker
```bash
docker-compose up -d postgres
```

### 2. Backend (Terminal 1)
```bash
cd packages/backend
npm install
npm run dev
```

### 3. Frontend (Terminal 2)
```bash
npm install
npm run dev
```

## Próximos Passos

Após iniciar tudo:
1. Acesse http://localhost:5173
2. Registre-se ou faça login
3. Comece a usar o sistema!
