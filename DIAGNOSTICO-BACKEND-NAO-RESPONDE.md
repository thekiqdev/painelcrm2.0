# 🔍 Diagnóstico: Backend Não Responde em localhost:3001

## 🚨 Problema

```bash
wget -O- http://localhost:3001/health
# wget: can't connect to remote host: Connection refused
```

O backend não está respondendo na porta 3001.

---

## 🔍 Verificações Necessárias

### 1️⃣ Verificar se o Processo Está Rodando

**No Terminal do Backend (Easypanel):**

```bash
# Verificar processos Node.js
ps aux | grep node

# Verificar se há algo escutando na porta 3001
netstat -tuln | grep 3001
# ou
ss -tuln | grep 3001
```

**Resultado esperado:**
- Deve aparecer um processo `node dist/index.js`
- Deve aparecer algo escutando na porta 3001

**Se não aparecer**: O servidor não está rodando.

---

### 2️⃣ Verificar Logs do Backend

**No Easypanel → Serviço Backend → Logs:**

Procure por:
- ✅ `🚀 Server running on port 3001` → Servidor iniciou
- ✅ `✅ Connected to PostgreSQL database` → Banco conectado
- ❌ `Error: listen EADDRINUSE` → Porta já está em uso
- ❌ `Error: Cannot find module` → Dependência faltando
- ❌ `npm error` → Erro ao iniciar

**Se houver erros, anote-os.**

---

### 3️⃣ Verificar Variáveis de Ambiente

**No Easypanel → Serviço Backend → Environment Variables:**

Verifique se estão configuradas:
- `API_PORT=3001` (ou `PORT=3001`)
- `NODE_ENV=production`
- `POSTGRES_HOST=sistemas_painelcrmbd`
- `POSTGRES_PORT=5432`
- `POSTGRES_DB=sistemas`
- `POSTGRES_USER=postgres`
- `POSTGRES_PASSWORD=f3e7198c7920451a4bc4`

**Se `API_PORT` não estiver definido**, o backend pode estar tentando usar outra porta.

---

### 4️⃣ Verificar se o Servidor Está Escutando em 0.0.0.0

O código do backend já está configurado para escutar em `0.0.0.0`:

```typescript
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
```

Isso está correto. O problema pode ser que o servidor não está iniciando.

---

### 5️⃣ Verificar Estrutura de Arquivos

**No Terminal do Backend:**

```bash
# Verificar se o dist existe
ls -la dist/

# Verificar se o index.js existe
ls -la dist/index.js

# Verificar se node_modules existe
ls -la node_modules/
```

**Se algum arquivo estiver faltando**, o build pode ter falhado.

---

## ✅ Soluções

### Solução 1: Reiniciar o Serviço

**No Easypanel → Serviço Backend:**

1. Clique no **ícone de parar** (⏹️)
2. Aguarde alguns segundos
3. Clique no **ícone de iniciar** (▶️)
4. Aguarde o serviço iniciar
5. Verifique os logs

---

### Solução 2: Verificar Build

**No Easypanel → Serviço Backend → Logs (durante o build):**

Procure por:
- ✅ `npm run build` → Build iniciou
- ✅ `tsc` → TypeScript compilou
- ✅ `dist/` criado → Build completo
- ❌ `error TS` → Erro de TypeScript
- ❌ `Error: Cannot find module` → Dependência faltando

**Se o build falhou**, corrija os erros e faça um novo deploy.

---

### Solução 3: Verificar Porta Exposta

**No Easypanel → Serviço Backend → Settings/Configurações:**

1. Verifique se a **porta 3001 está exposta/publicada**
2. Verifique se não há conflito de portas
3. Se necessário, **exponha a porta 3001**

---

### Solução 4: Testar Manualmente

**No Terminal do Backend:**

```bash
# Tentar iniciar manualmente
cd /app
node dist/index.js
```

**Se funcionar**, você verá:
```
🚀 Server running on port 3001
Environment: production
Listening on 0.0.0.0:3001
✅ Connected to PostgreSQL database
```

**Se não funcionar**, aparecerá o erro específico.

---

### Solução 5: Verificar package.json

**No Terminal do Backend:**

```bash
# Verificar se o script start está correto
cat package.json | grep -A 5 "scripts"
```

**Deve aparecer:**
```json
"scripts": {
  "start": "node dist/index.js"
}
```

---

## 🧪 Teste Completo

Execute na ordem:

1. ✅ **Teste 1**: `ps aux | grep node` (verificar processo)
2. ✅ **Teste 2**: `netstat -tuln | grep 3001` (verificar porta)
3. ✅ **Teste 3**: Verificar logs do backend
4. ✅ **Teste 4**: Verificar variáveis de ambiente
5. ✅ **Teste 5**: Reiniciar serviço
6. ✅ **Teste 6**: `wget -O- http://localhost:3001/health` (testar novamente)

---

## 📝 Informações para Me Enviar

Após executar os testes, me envie:

1. **Resultado do `ps aux | grep node`**: `_________________`
2. **Resultado do `netstat -tuln | grep 3001`**: `_________________`
3. **Últimas linhas dos logs do backend**: `_________________`
4. **Se `API_PORT` está definido nas variáveis de ambiente**: ✅ / ❌
5. **Se o build foi bem-sucedido**: ✅ / ❌

---

## 💡 Possível Causa

O backend pode não estar iniciando porque:
- ❌ Build falhou
- ❌ Dependências faltando
- ❌ Erro no código
- ❌ Variável `API_PORT` não definida
- ❌ Porta não exposta

**Verifique os logs primeiro** - eles devem mostrar o erro específico.

