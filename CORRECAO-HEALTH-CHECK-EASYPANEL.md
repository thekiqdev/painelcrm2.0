# 🔧 Como Corrigir Health Check no Easypanel

## 📍 Onde Configurar Health Check no Easypanel

O health check pode estar em **diferentes lugares** dependendo da versão do Easypanel:

### Opção 1: Nas Configurações do Serviço (Settings)

1. **Easypanel → Serviço Backend** (`painelcrm` ou `sistemas_painelcrm`)
2. Clique no **ícone de engrenagem** (⚙️ Settings) ou **"Configurações"**
3. Procure por:
   - **"Health Check"**
   - **"Saúde"**
   - **"Health"**
   - **"Probe"** (Kubernetes)
   - **"Liveness Probe"**
   - **"Readiness Probe"**

4. Se encontrar, configure:
   - **Path**: `/health`
   - **Port**: `3001`
   - **Interval**: `30s`
   - **Timeout**: `10s`

### Opção 2: O Dockerfile Já Tem Health Check

O `Dockerfile` já tem um `HEALTHCHECK` configurado:

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health 2>/dev/null || \
      (curl -f http://localhost:3001/health || exit 1)
```

**O Easypanel pode estar usando isso automaticamente**, mas pode estar verificando na porta errada.

### Opção 3: Verificar Porta Exposta

O problema pode ser que o Easypanel está verificando na **porta 80** em vez de **3001**.

1. **Easypanel → Serviço Backend → Settings/Configurações**
2. Procure por **"Port"** ou **"Porta"**
3. Verifique se está configurado como **`3001`** (não 80)
4. Verifique se a porta está **exposta/publicada**

### Opção 4: Health Check Automático (Pode Não Precisar Configurar)

Se o Easypanel usa o `HEALTHCHECK` do Dockerfile automaticamente, você **não precisa configurar nada**. O problema pode ser outro:

1. **Backend não está respondendo em `/health`**
2. **Porta não está exposta corretamente**
3. **Banco de dados não está conectado**

---

## 🧪 Teste: Verificar se o Health Check Está Funcionando

### No Terminal do Backend (Easypanel):

```bash
# Teste 1: Verificar se o endpoint responde
wget -O- http://localhost:3001/health

# Resultado esperado:
# {"status":"ok","database":"connected","timestamp":"..."}
```

**Se funcionar**: O backend está OK, o problema pode ser a configuração do Easypanel.

**Se não funcionar**: O problema é no backend (banco não conectado, etc).

---

## 🔍 Verificar Status do Serviço

### No Easypanel:

1. Veja o **status do serviço backend**:
   - 🟢 **Verde**: Saudável
   - 🟠 **Laranja/Amarelo**: Não saudável (health check falhando)
   - 🔴 **Vermelho**: Parado

2. Se estiver **laranja**, clique no serviço e veja:
   - **Logs**: Procure por erros
   - **Status**: Veja a mensagem de erro

---

## ✅ Solução Alternativa: Desabilitar Health Check Temporariamente

Se não conseguir configurar o health check e o backend está funcionando:

1. **Easypanel → Serviço Backend → Settings**
2. Procure por **"Restart Policy"** ou **"Política de Reinício"**
3. Altere para **"Never"** ou **"On Failure Only"** (se disponível)

**⚠️ ATENÇÃO**: Isso é temporário. O ideal é corrigir o health check.

---

## 🎯 Foco Principal: Corrigir Domínios

**Por enquanto, foque em corrigir os domínios primeiro:**

1. **Easypanel → Serviço Frontend → Domínios**
2. Altere o destino de `http://sistemas_painelcrm:80/` para `http://painelcrm:80/` (ou nome do frontend)
3. Isso deve resolver o erro 502

O health check pode ser resolvido depois, ou pode funcionar automaticamente quando o backend estiver estável.

---

## 📝 Resumo

1. ✅ **Primeiro**: Corrigir domínios (isso resolve o 502)
2. ✅ **Depois**: Verificar se o backend responde em `/health`
3. ✅ **Por último**: Configurar health check (se necessário)

**O health check do Dockerfile já está configurado**, então pode funcionar automaticamente quando o backend estiver estável.

