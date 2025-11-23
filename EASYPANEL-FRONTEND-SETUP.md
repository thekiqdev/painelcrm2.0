# 🎨 Configuração do Frontend no Easypanel

## ⚠️ IMPORTANTE: Frontend é um Serviço Separado!

O frontend precisa ser deployado como um **serviço separado** no Easypanel, usando o `Dockerfile.frontend`.

---

## 📋 Passo a Passo

### 1. Criar Serviço Frontend no Easypanel

1. No Easypanel, vá em **"Services"** ou **"Serviços"**
2. Clique em **"Add Service"** ou **"Adicionar Serviço"**
3. Escolha **"Docker"** ou **"Custom"**
4. Configure:
   - **Nome**: `painelcrm-frontend` (ou outro nome de sua escolha)
   - **Dockerfile Path**: `Dockerfile.frontend`
   - **Build Context**: `.` (raiz do repositório)
   - **Port**: `80` (porta interna do Nginx)

### 2. Configurar Variáveis de Ambiente (Opcional)

Se você quiser usar variáveis de ambiente no build do frontend:

- **VITE_API_URL**: URL do backend (ex: `http://painelcrm-backend:3001` ou URL externa)

**Nota**: No Easypanel, o frontend pode acessar o backend usando o nome do serviço. Se o backend se chama `painelcrm-backend`, use `http://painelcrm-backend:3001`.

### 3. Atualizar nginx.conf.prod

O arquivo `nginx.conf.prod` precisa apontar para o nome correto do serviço backend no Easypanel.

**Se o backend se chama `painelcrm-backend`:**
```nginx
proxy_pass http://painelcrm-backend:3001;
```

**Se o backend tem outro nome, ajuste no arquivo `nginx.conf.prod`.**

### 4. Deploy

1. Faça commit e push das alterações
2. O Easypanel deve fazer o build automaticamente
3. Aguarde o build completar

### 5. Verificar Logs

Nos logs do serviço Frontend, você deve ver:
```
nginx: [notice] ... ready to handle connections
```

---

## 🔍 Verificar se o Frontend Está Rodando

### No Easypanel:
1. Acesse o serviço **Frontend**
2. Vá em **"Logs"**
3. Deve mostrar logs do Nginx sem erros

### Testar:
1. Acesse a URL do frontend (domínio configurado no Easypanel)
2. Deve carregar a aplicação React
3. Se aparecer erro de API, verifique se o proxy está funcionando

---

## 🐛 Troubleshooting

### Erro: "Service is not reachable"

**Possíveis causas:**

1. **Frontend não foi criado como serviço separado**
   - ✅ Solução: Crie o serviço Frontend usando `Dockerfile.frontend`

2. **Porta não está exposta**
   - ✅ Solução: Verifique se a porta `80` está exposta/publicada

3. **Build falhou**
   - ✅ Solução: Verifique os logs do build no Easypanel

4. **Nginx não está iniciando**
   - ✅ Solução: Verifique os logs do serviço Frontend

### Erro: "Cannot connect to API"

**Possíveis causas:**

1. **Nome do serviço backend incorreto no nginx.conf.prod**
   - ✅ Solução: Verifique o nome exato do serviço backend no Easypanel e atualize `nginx.conf.prod`

2. **Backend não está rodando**
   - ✅ Solução: Verifique se o serviço Backend está rodando

3. **CORS não configurado**
   - ✅ Solução: Verifique se `FRONTEND_URL` está configurado no backend

---

## 📝 Checklist

- [ ] Serviço Frontend criado no Easypanel
- [ ] Dockerfile.frontend configurado corretamente
- [ ] nginx.conf.prod aponta para o nome correto do backend
- [ ] Porta 80 exposta/publicada
- [ ] Build do frontend completou com sucesso
- [ ] Logs do Nginx mostram "ready to handle connections"
- [ ] Domínio configurado e apontando para o serviço Frontend
- [ ] Frontend carrega sem erros
- [ ] API está acessível via proxy (/api)

---

## 🔗 Estrutura Final no Easypanel

Você deve ter **3 serviços**:

1. **PostgreSQL** (`sistemas_painelcrmbd`)
   - Porta: 5432
   - Variáveis: POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB

2. **Backend** (`painelcrm-backend` ou nome similar)
   - Dockerfile: `Dockerfile`
   - Porta: 3001
   - Variáveis: POSTGRES_HOST, POSTGRES_PORT, etc.

3. **Frontend** (`painelcrm-frontend` ou nome similar)
   - Dockerfile: `Dockerfile.frontend`
   - Porta: 80
   - Variáveis: (opcional) VITE_API_URL

---

## 🚀 Próximos Passos

Após configurar o frontend:

1. Teste acessar o domínio
2. Verifique se a aplicação carrega
3. Teste fazer login
4. Verifique se as chamadas de API funcionam (abrir DevTools > Network)

