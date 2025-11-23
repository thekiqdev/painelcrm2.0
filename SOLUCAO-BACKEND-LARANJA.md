# 🟠 Solução: Backend Status Laranja

## 🚨 Problema

O backend está com status **laranja** (não saudável), indicando que o health check está falhando.

---

## 🔍 Possíveis Causas

1. **Backend não está respondendo em `/health`**
2. **Banco de dados não está conectado**
3. **Porta 3001 não está exposta corretamente**
4. **Health check do Easypanel está verificando porta errada**

---

## ✅ Soluções

### Solução 1: Verificar se o Backend Está Funcionando

**No Easypanel → Serviço Backend → Terminal:**

```bash
# Teste 1: Verificar se o servidor está rodando
wget -O- http://localhost:3001/health

# Resultado esperado:
# {"status":"ok","database":"connected","timestamp":"..."}
```

**Se funcionar**: O backend está OK, o problema é a configuração do Easypanel.

**Se não funcionar**: O problema é no backend (banco não conectado, etc).

---

### Solução 2: Verificar Porta Exposta

**No Easypanel → Serviço Backend → Settings/Configurações:**

1. Verifique se a **porta 3001 está exposta/publicada**
2. Verifique se não há conflito de portas
3. Se necessário, **exponha a porta 3001**

---

### Solução 3: Verificar Conexão com Banco

**No Easypanel → Serviço Backend → Logs:**

Procure por:
- ✅ `✅ Connected to PostgreSQL database` → Banco conectado
- ❌ `Failed to connect to PostgreSQL` → Banco não conectado

**Se o banco não estiver conectado:**
1. Verifique as variáveis de ambiente do backend:
   - `POSTGRES_HOST=sistemas_painelcrmbd`
   - `POSTGRES_PORT=5432`
   - `POSTGRES_DB=sistemas`
   - `POSTGRES_USER=postgres`
   - `POSTGRES_PASSWORD=f3e7198c7920451a4bc4`

2. Verifique se o serviço PostgreSQL está rodando

---

### Solução 4: Health Check do Dockerfile

O `Dockerfile` já tem um health check configurado:

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health
```

**O Easypanel pode estar usando isso automaticamente.**

Se o backend está respondendo em `/health`, o status deve ficar verde após alguns minutos.

---

### Solução 5: Reiniciar o Serviço

**No Easypanel → Serviço Backend:**

1. Clique no **ícone de reiniciar** (🔄)
2. Aguarde o serviço reiniciar
3. Verifique os logs para ver se conectou ao banco
4. Aguarde alguns minutos para o health check verificar

---

## 🧪 Teste Completo

Execute na ordem:

1. ✅ **Teste 1**: `wget -O- http://localhost:3001/health` (deve retornar JSON)
2. ✅ **Teste 2**: Verificar logs do backend (deve mostrar conexão com banco)
3. ✅ **Teste 3**: Verificar porta 3001 está exposta
4. ✅ **Teste 4**: Reiniciar serviço e aguardar alguns minutos

---

## 📝 Nota Importante

**O status laranja do backend NÃO impede o frontend de funcionar** se:
- O backend está respondendo em `/health`
- Os domínios estão configurados corretamente
- O Nginx do frontend consegue fazer proxy para o backend

**Foque primeiro em corrigir os domínios**, depois resolva o status laranja do backend.

---

## ✅ Resultado Esperado

Após corrigir:
- ✅ Backend fica **VERDE** (saudável)
- ✅ Logs mostram conexão com banco
- ✅ Health check retorna `{"status":"ok"}`

