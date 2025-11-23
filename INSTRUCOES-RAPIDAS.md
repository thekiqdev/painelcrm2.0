# 🚀 Instruções Rápidas - Iniciar Sistema

## Método Mais Fácil

Execute na raiz do projeto:
```batch
.\start.bat
```

Ou:
```bash
npm run start
```

## O que fazer se aparecer "Erro ao instalar"

O script abre janelas do Backend e Frontend. **As janelas tentarão instalar automaticamente** as dependências se necessário.

### Se as janelas mostrarem erro de npm:

1. **Verifique se Node.js está instalado:**
   ```bash
   node --version
   npm --version
   ```

2. **Se não estiver instalado:**
   - Baixe de: https://nodejs.org/
   - Instale a versão LTS
   - **REINICIE o terminal**
   - Execute `.\start.bat` novamente

3. **Se estiver instalado mas não funcionar:**
   - Nas janelas abertas, execute manualmente:
   
   **Janela do Backend:**
   ```bash
   cd packages\backend
   npm install
   npm run dev
   ```
   
   **Janela do Frontend:**
   ```bash
   npm install
   npm run dev
   ```

## Verificar se está funcionando

Após iniciar, acesse:
- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:3001
- **Health Check**: http://localhost:3001/health

## Parar o sistema

- **Backend/Frontend**: Feche as janelas ou `Ctrl+C`
- **Docker**: `docker-compose down`

## Problemas Comuns

### "Docker não está rodando"
- Inicie o Docker Desktop

### "npm não encontrado"
- Instale Node.js e reinicie o terminal
- Ou execute manualmente nas janelas abertas

### "Porta já está em uso"
- Pare os processos existentes
- Ou mude as portas no `.env`



