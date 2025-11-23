# 🔧 Correção: Domínios e Health Check

## 🚨 Problemas Identificados

### Problema 1: Backend Reiniciando (Status Laranja)
O backend está recebendo `SIGTERM` constantemente, indicando que o **health check do Easypanel está falhando**.

### Problema 2: Configuração de Domínios Incorreta
Os domínios do **frontend** (`painelcrm`) estão apontando para `http://sistemas_painelcrm:80/` (backend), quando deveriam apontar para `http://painelcrm:80/` (o próprio frontend).

---

## ✅ SOLUÇÃO 1: Corrigir Health Check do Backend

### No Easypanel → Serviço Backend (`painelcrm` ou `sistemas_painelcrm`):

1. **Acesse as configurações do serviço**
2. **Vá em "Health Check" ou "Saúde"**
3. **Configure:**
   - **Path**: `/health`
   - **Port**: `3001`
   - **Interval**: `30s` (ou padrão)
   - **Timeout**: `10s`
   - **Start Period**: `40s` (dar tempo para o backend iniciar)
   - **Retries**: `3`

4. **Salve as alterações**

**O que isso faz:**
- O Easypanel vai verificar se o backend responde em `/health`
- Se o endpoint retornar `200 OK`, o serviço será considerado saudável
- Isso evita os reinícios constantes (SIGTERM)

---

## ✅ SOLUÇÃO 2: Corrigir Configuração de Domínios

### No Easypanel → Serviço Frontend (`painelcrm` ou `painelcrm_frontend`):

1. **Acesse "Domínios"**
2. **Para cada domínio configurado:**
   - Clique no ícone de **editar** (lápis)
   - **Altere o destino de:**
     ```
     http://sistemas_painelcrm:80/
     ```
   - **Para:**
     ```
     http://painelcrm:80/
     ```
     ou
     ```
     http://painelcrm_frontend:80/
     ```
     (use o nome exato do serviço frontend no Easypanel)

3. **Salve as alterações**

**Por que isso é importante:**
- Os domínios públicos (`https://sistemas-painelcrm.g8o2...` e `https://beta.painelcrm.com/`) devem apontar para o **frontend** (Nginx)
- O Nginx dentro do container frontend faz proxy de `/api` para o backend
- Se os domínios apontarem diretamente para o backend, você terá erro 502

---

## 🧪 Verificações Após Correção

### 1. Verificar Backend está Saudável

**No Easypanel → Serviço Backend → Logs:**
- Deve aparecer: `🚀 Server running on port 3001`
- **Status deve ficar VERDE** (não mais laranja)
- Não deve mais aparecer `SIGTERM`

### 2. Testar Health Check Manualmente

**No Easypanel → Serviço Backend → Terminal:**
```bash
wget -O- http://localhost:3001/health
```

**Resultado esperado:**
```json
{"status":"ok","database":"connected","timestamp":"..."}
```

### 3. Verificar Frontend está Acessível

**Acesse o domínio público:**
- `https://sistemas-painelcrm.g8o2qm.easypanel.host/`
- Deve carregar a página de login (não erro 502)

### 4. Testar API pelo Frontend

**No navegador, abra o Console (F12) e tente fazer login:**
- Deve aparecer requisições para `/api/auth/login`
- Não deve aparecer erro 502

---

## 📋 Checklist de Correção

Execute na ordem:

- [ ] **1. Corrigir Health Check do Backend** (Path: `/health`, Port: `3001`)
- [ ] **2. Aguardar backend ficar VERDE** (não mais laranja)
- [ ] **3. Corrigir domínios do frontend** (apontar para `painelcrm:80` ou `painelcrm_frontend:80`)
- [ ] **4. Aguardar propagação** (pode levar alguns segundos)
- [ ] **5. Testar acesso ao frontend** (deve carregar sem erro 502)
- [ ] **6. Testar login** (deve funcionar)

---

## 🔍 Identificar Nomes dos Serviços

Se você não tiver certeza dos nomes:

1. **No Easypanel, veja a lista de serviços:**
   - Anote o nome exato do serviço **Backend** (ex: `painelcrm`, `sistemas_painelcrm`)
   - Anote o nome exato do serviço **Frontend** (ex: `painelcrm_frontend`, `painelcrm`)

2. **Use esses nomes exatos:**
   - No health check do backend: use a porta `3001`
   - Nos domínios do frontend: use `http://NOME_DO_FRONTEND:80/`

---

## 💡 Explicação Técnica

### Arquitetura Correta:

```
Internet → Domínio Público → Easypanel Ingress → Frontend (Nginx:80)
                                                      ↓
                                              Proxy /api → Backend (Node:3001)
```

### O que estava errado:

```
Internet → Domínio Público → Easypanel Ingress → Backend (Node:3001) ❌
                                                      ↑
                                              Tentando acessar porta 80
                                              (mas backend está na 3001)
```

### O que deve ser:

```
Internet → Domínio Público → Easypanel Ingress → Frontend (Nginx:80) ✅
                                                      ↓
                                              Proxy /api → Backend (Node:3001) ✅
```

---

## 🚀 Próximos Passos

Após corrigir:

1. ✅ Backend deve ficar **VERDE** (saudável)
2. ✅ Frontend deve carregar **sem erro 502**
3. ✅ Login deve funcionar
4. ✅ API deve responder corretamente

Se ainda houver problemas, me informe qual etapa falhou!

