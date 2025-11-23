# 🧪 Testes Rápidos para Diagnosticar Erro 502

## ⚡ Testes Essenciais (Execute na Ordem)

### 1️⃣ Identificar Nome do Serviço Backend (30 segundos)

**No Easypanel:**
- Acesse a lista de serviços
- **Anote o nome EXATO do serviço Backend**
- Exemplos: `painelcrm`, `sistemas_painelcrm`, `painelcrm-backend`

**Resultado**: Nome do serviço: `_________________`

---

### 2️⃣ Verificar Backend está Rodando (30 segundos)

**No Easypanel → Serviço Backend → Logs:**
- Procure por: `🚀 Server running on port 3001`
- Status deve estar **verde**

**Resultado**: ✅ Rodando / ❌ Parado

---

### 3️⃣ Testar Conexão do Frontend para Backend (1 minuto)

**No Easypanel → Serviço Frontend → Terminal:**

Execute estes comandos (um de cada vez):

```bash
# Teste com o nome que você identificou no TESTE 1
wget -O- http://NOME_DO_SERVICO:3001/health
```

**Substitua `NOME_DO_SERVICO` por:**
- `painelcrm`
- `sistemas_painelcrm` (com underscore)
- `sistemas-painelcrm` (com hífen)

**Resultado esperado** (quando funcionar):
```json
{"status":"ok","database":"connected","timestamp":"..."}
```

**Qual funcionou?**: `_________________`

---

### 4️⃣ Verificar Erro no Log do Nginx (30 segundos)

**No Easypanel → Serviço Frontend → Terminal:**

```bash
cat /var/log/nginx/error.log | tail -20
```

**Procure por:**
- `host not found in upstream`
- `Connection refused`
- `Name or service not known`

**Resultado**: Erro encontrado: `_________________`

---

## 🎯 Decisão Rápida

### Se o TESTE 3 funcionou com um nome diferente:

1. ✅ O nome do serviço está incorreto no `nginx.conf.prod`
2. ✅ Atualizei o arquivo para usar `sistemas_painelcrm:3001`
3. ✅ Faça commit e push
4. ✅ Aguarde o novo build

### Se o TESTE 3 não funcionou com nenhum nome:

1. ❌ Problema de rede/conectividade
2. ❌ Verifique se os serviços estão no mesmo projeto no Easypanel
3. ❌ Verifique se o backend está realmente rodando

---

## 📝 Resumo dos Resultados

Preencha e me envie:

```
TESTE 1 - Nome do serviço backend: _______________
TESTE 2 - Backend rodando: ✅ / ❌
TESTE 3 - Nome que funcionou: _______________
TESTE 4 - Erro no log: _______________
```

---

## 🚀 Próximo Passo

Após identificar o nome correto, eu já atualizei o `nginx.conf.prod` para usar `sistemas_painelcrm:3001`. 

**Se esse não for o nome correto**, me informe qual funcionou no TESTE 3 e eu atualizo o arquivo.

