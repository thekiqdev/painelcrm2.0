# 🔍 Plano de Diagnóstico e Correção - Erro 502 Bad Gateway

## 🎯 Objetivo
Identificar e corrigir o problema de conexão entre o frontend (Nginx) e o backend.

---

## 📋 TESTE 1: Identificar o Nome Exato do Serviço Backend

### No Easypanel:
1. Acesse a lista de serviços
2. **Anote o nome EXATO do serviço Backend** (pode ser):
   - `painelcrm`
   - `sistemas_painelcrm` (com underscore)
   - `painelcrm-backend`
   - Outro nome

**Resultado esperado**: Nome do serviço backend

---

## 📋 TESTE 2: Verificar se o Backend está Rodando

### No Easypanel:
1. Acesse o serviço Backend
2. Verifique o **status** (deve estar verde/rodando)
3. Abra os **logs** e procure por:
   ```
   🚀 Server running on port 3001
   ✅ Connected to PostgreSQL database
   ```

**Resultado esperado**: Backend rodando na porta 3001

---

## 📋 TESTE 3: Testar Conexão Interna do Backend

### No Terminal do Serviço Backend (Easypanel):
Execute:
```bash
wget -O- http://localhost:3001/health
```

**Resultado esperado**: 
```json
{"status":"ok","database":"connected","timestamp":"..."}
```

**Se não funcionar**: O backend não está respondendo corretamente.

---

## 📋 TESTE 4: Testar Conexão do Frontend para o Backend

### No Terminal do Serviço Frontend (Easypanel):
Execute os seguintes comandos (substitua `NOME_DO_SERVICO` pelo nome real):

```bash
# Teste 1: Tentar com o nome atual (painelcrm)
wget -O- http://painelcrm:3001/health

# Teste 2: Tentar com sistemas_painelcrm (com underscore)
wget -O- http://sistemas_painelcrm:3001/health

# Teste 3: Tentar com sistemas-painelcrm (com hífen)
wget -O- http://sistemas-painelcrm:3001/health
```

**Resultado esperado**: Um dos comandos deve retornar:
```json
{"status":"ok","database":"connected","timestamp":"..."}
```

**Qual funcionar**: Esse é o nome correto do serviço!

---

## 📋 TESTE 5: Verificar Logs do Nginx

### No Terminal do Serviço Frontend (Easypanel):
Execute:
```bash
cat /var/log/nginx/error.log
```

**Procure por erros como**:
- `host not found in upstream "painelcrm"`
- `Connection refused`
- `Name or service not known`

**Resultado esperado**: Erro específico indicando o problema de DNS/conexão.

---

## 📋 TESTE 6: Verificar Configuração Atual do Nginx

### No Terminal do Serviço Frontend (Easypanel):
Execute:
```bash
cat /etc/nginx/conf.d/default.conf | grep -A 5 "location /api"
```

**Resultado esperado**: Ver a configuração atual do proxy:
```nginx
location /api {
    set $backend "painelcrm:3001";
    proxy_pass http://$backend;
    ...
}
```

---

## 🔧 CORREÇÃO BASEADA NOS TESTES

### Se o TESTE 4 identificou o nome correto:

1. **Atualize o `nginx.conf.prod`** com o nome correto
2. **Faça commit e push**
3. **Aguarde o novo build do frontend**
4. **Teste novamente**

### Exemplo de correção:

Se o nome correto for `sistemas_painelcrm`, atualize:
```nginx
location /api {
    set $backend "sistemas_painelcrm:3001";
    proxy_pass http://$backend;
    ...
}
```

---

## 📊 Checklist de Verificação

Execute os testes na ordem e marque os resultados:

- [ ] **TESTE 1**: Nome do serviço backend identificado: `_____________`
- [ ] **TESTE 2**: Backend está rodando? ✅ / ❌
- [ ] **TESTE 3**: Backend responde em `localhost:3001/health`? ✅ / ❌
- [ ] **TESTE 4**: Qual nome funcionou? `_____________`
- [ ] **TESTE 5**: Erro no log do Nginx: `_____________`
- [ ] **TESTE 6**: Configuração atual do Nginx verificada? ✅ / ❌

---

## 🚀 Próximos Passos Após Identificar o Problema

1. ✅ Atualizar `nginx.conf.prod` com o nome correto
2. ✅ Fazer commit e push
3. ✅ Aguardar build do frontend
4. ✅ Testar login novamente

---

## 💡 Dica Importante

O nome do serviço no Easypanel **deve corresponder exatamente** ao nome usado no `nginx.conf.prod`. O Docker usa esse nome para resolver o DNS interno entre containers.

