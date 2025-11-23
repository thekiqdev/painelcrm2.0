# Configuração de Serviços no Easypanel

## 📋 Estrutura de Serviços

Você precisa de **3 serviços** no Easypanel:

### 1. 🗄️ PostgreSQL (painelcrmbd) ✅ JÁ CRIADO

- **Tipo**: PostgreSQL
- **Nome**: `painelcrmbd` (ou `sistemas_painelcrmbd`)
- **Status**: ✅ Já está rodando

**Variáveis de Ambiente** (se necessário):
- `POSTGRES_USER`: `postgres`
- `POSTGRES_PASSWORD`: `f3e7198c7920451a4bc4`
- `POSTGRES_DB`: `sistemas`

---

### 2. 🔧 Backend API (painelcrm) ✅ JÁ CRIADO

- **Tipo**: App
- **Nome**: `painelcrm` (ou o nome que você usou)
- **Dockerfile**: `Dockerfile` (raiz do projeto)
- **Contexto de Build**: Raiz do repositório (`.`)
- **Porta**: `3001` (expor/publicar)
- **Status**: ✅ Já está rodando

**Variáveis de Ambiente**:
```
POSTGRES_HOST=sistemas_painelcrmbd
POSTGRES_PORT=5432
POSTGRES_DB=sistemas
POSTGRES_USER=postgres
POSTGRES_PASSWORD=f3e7198c7920451a4bc4
API_PORT=3001
NODE_ENV=production
JWT_SECRET=V9cX70RguVATn6cB6dWJhQemdADTf/+6DGe2mtnG3QPIZklpXHSS3pnnGrSBsn0QP3LtKyVw4D7EwmSV5bJTHw==
JWT_EXPIRES_IN=7d
FRONTEND_URL=https://sistemas-painelcrm-frontend.g8o2qm.easypanel.host
```

**Health Check**: `/health`

**Dependências**: `painelcrmbd` (deve iniciar após o banco)

---

### 3. 🌐 Frontend (painelcrm-frontend) ❌ PRECISA CRIAR

- **Tipo**: App
- **Nome**: `painelcrm-frontend` (ou qualquer nome)
- **Dockerfile**: `Dockerfile.frontend` (raiz do projeto)
- **Contexto de Build**: Raiz do repositório (`.`)
- **Porta**: `80` (expor/publicar)
- **Status**: ❌ **PRECISA CRIAR**

**Variáveis de Ambiente**:
```
VITE_API_URL=
```

**Nota**: 
- Deixe `VITE_API_URL` vazio em produção para usar URLs relativas (`/api`)
- O Nginx faz proxy de `/api` para o backend automaticamente
- Isso evita erros de Mixed Content (HTTPS bloqueando HTTP)
- Se o serviço backend se chama outro nome, ajuste no `nginx.conf.prod` também

**Health Check**: `/health` ou `/`

**Dependências**: `painelcrm` (deve iniciar após o backend)

---

## 🚀 Passo a Passo para Criar o Frontend

### 1. Criar Novo Serviço no Easypanel

1. No Easypanel, clique em **"New Service"** ou **"Novo Serviço"**
2. Escolha **"App"** como tipo
3. Configure:

   **Geral**:
   - **Nome**: `painelcrm-frontend`
   - **Source**: GitHub (seu repositório)
   - **Branch**: `main`

   **Build**:
   - **Dockerfile**: `Dockerfile.frontend`
   - **Build Context**: `.` (raiz do repositório)
   - **Build Command**: (deixar vazio, o Dockerfile faz tudo)

   **Deploy**:
   - **Port**: `80`
   - **Expose Port**: ✅ Sim (marcar para expor publicamente)

   **Environment Variables**:
   ```
   VITE_API_URL=
   ```
   
   **Nota**: 
   - Deixe `VITE_API_URL` vazio em produção para usar URLs relativas (`/api`)
   - O Nginx faz proxy de `/api` para o backend automaticamente
   - Isso evita erros de Mixed Content (HTTPS bloqueando HTTP)

   **Dependencies**:
   - Adicione `painelcrm` como dependência

### 2. Configurar Domínio (Opcional)

No Easypanel, configure o domínio para o frontend:
- **Domain**: `sistemas-painelcrm.g8o2qm.easypanel.host` (ou seu domínio)
- **Service**: `painelcrm-frontend`
- **Port**: `80`

### 3. Verificar nginx.conf.prod

O arquivo `nginx.conf.prod` já está configurado para fazer proxy das requisições `/api` para o backend. Verifique se o nome do serviço está correto:

```nginx
location /api {
    proxy_pass http://painelcrm:3001;
}
```

**Se o seu serviço backend tiver outro nome**, edite `nginx.conf.prod` e substitua `painelcrm` pelo nome correto.

---

## ✅ Verificação

Após criar o serviço frontend:

1. **Aguarde o build completar** (pode levar alguns minutos)
2. **Verifique os logs** do serviço `painelcrm-frontend`
3. **Acesse o domínio** configurado
4. **Teste o health check**: `http://seu-dominio/health`

---

## 🔍 Troubleshooting

### Frontend não carrega

1. Verifique se o serviço está rodando (status verde)
2. Verifique os logs do serviço `painelcrm-frontend`
3. Verifique se a porta `80` está exposta
4. Verifique se o domínio está configurado corretamente

### Erro "Service is not reachable"

1. Verifique se o serviço está rodando
2. Verifique se a porta está exposta/publicada
3. Verifique os logs para erros
4. Teste o health check diretamente

### API não funciona no frontend

1. Verifique se `VITE_API_URL` está configurado corretamente
2. Verifique se o nome do serviço backend em `nginx.conf.prod` está correto
3. Verifique se o backend está acessível: `http://painelcrm:3001/health`
4. Verifique os logs do nginx no frontend

---

## 📝 Resumo dos Nomes dos Serviços

| Serviço | Nome no Easypanel | Porta | Status |
|---------|-------------------|-------|--------|
| PostgreSQL | `painelcrmbd` ou `sistemas_painelcrmbd` | 5432 | ✅ Criado |
| Backend API | `painelcrm` | 3001 | ✅ Criado |
| Frontend | `painelcrm-frontend` | 80 | ❌ **Criar** |

---

## 🎯 Próximos Passos

1. ✅ Criar serviço `painelcrm-frontend` no Easypanel
2. ✅ Configurar variável `VITE_API_URL=http://painelcrm:3001`
3. ✅ Configurar domínio (se necessário)
4. ✅ Aguardar build e deploy
5. ✅ Testar acesso ao frontend

