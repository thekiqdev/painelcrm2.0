# 🔧 Correção de Domínios - Passo a Passo Visual

## 🎯 Objetivo

Os domínios do **frontend** devem apontar para o **serviço frontend**, não para o backend.

---

## 📋 Passo a Passo

### 1️⃣ Identificar Qual Serviço é Frontend e Qual é Backend

**No Easypanel, veja a lista de serviços:**

- **Backend**: Geralmente se chama `painelcrm` ou `sistemas_painelcrm` (porta 3001)
- **Frontend**: Geralmente se chama `painelcrm_frontend` ou `painelcrm` (porta 80)

**Anote os nomes exatos aqui:**
- Nome do Backend: `_________________`
- Nome do Frontend: `_________________`

---

### 2️⃣ Editar Domínios do FRONTEND

**IMPORTANTE**: Os domínios (`https://sistemas-painelcrm.g8o2qm.easypanel.host/` e `https://beta.painelcrm.com/`) devem estar configurados no **SERVIÇO FRONTEND**, não no backend.

#### Se os domínios estão no serviço BACKEND:

1. **Easypanel → Serviço Backend → Domínios**
2. **Delete os domínios** do backend (eles não devem estar lá)
3. Vá para o **Serviço Frontend** e adicione os domínios lá

#### Se os domínios estão no serviço FRONTEND (correto):

1. **Easypanel → Serviço Frontend → Domínios**
2. Clique no **ícone de editar** (lápis) em cada domínio
3. No modal "Atualizar Domínio":

   **Aba "Detalhes":**
   - **HTTPS**: ✅ Ligado (deve estar ligado)
   - **Host**: `sistemas-painelcrm.g8o2qm.easypanel.host` (ou seu domínio)
   - **Caminho**: `/`

   **Seção "Destino" (DESTINATION):**
   - **Protocolo**: `HTTP`
   - **Porta**: `80`
   - **Host/Destino**: ⚠️ **AQUI ESTÁ O PROBLEMA!**
   
   **O campo "Host" ou "Destino" deve conter o NOME DO SERVIÇO FRONTEND:**
   - Se o frontend se chama `painelcrm_frontend` → use `painelcrm_frontend`
   - Se o frontend se chama `painelcrm` → use `painelcrm`
   - **NÃO use** `sistemas_painelcrm` (esse é o backend!)

4. Clique em **"Salvar"**

---

## 🔍 Como Identificar o Campo de Destino

No modal "Atualizar Domínio", a seção **"Destino"** pode ter:

### Opção 1: Campo "Host" ou "Service" na seção Destino
- Procure por um campo que permita digitar o nome do serviço
- Digite o nome do serviço **frontend** (ex: `painelcrm` ou `painelcrm_frontend`)

### Opção 2: Dropdown de Serviços
- Se houver um dropdown, selecione o serviço **frontend**

### Opção 3: URL Completa
- Se pedir uma URL completa, use: `http://NOME_DO_FRONTEND:80/`
- Exemplo: `http://painelcrm:80/` ou `http://painelcrm_frontend:80/`

---

## ⚠️ Problema Comum

**Se você não conseguir editar o destino `sistemas_painelcrm`:**

Isso pode significar que:
1. Os domínios estão configurados no **serviço errado** (backend em vez de frontend)
2. O Easypanel está bloqueando a edição porque o domínio está "preso" ao serviço backend

**Solução:**
1. **Delete os domínios do backend** (se estiverem lá)
2. **Adicione os domínios no serviço frontend**
3. Configure o destino para apontar para o próprio frontend

---

## ✅ Configuração Correta

### Domínios do Frontend:
- **Domínio**: `https://sistemas-painelcrm.g8o2qm.easypanel.host/`
- **Destino**: `http://painelcrm:80/` (ou nome do frontend)
- **Serviço**: Frontend (não backend!)

### Backend:
- **NÃO deve ter domínios públicos configurados**
- O backend só é acessado internamente pelo frontend via `/api`

---

## 🧪 Verificação

Após corrigir:

1. **Acesse o domínio público**: `https://sistemas-painelcrm.g8o2qm.easypanel.host/`
2. **Deve carregar a página de login** (não erro 502)
3. **Tente fazer login**
4. **Não deve aparecer erro 502**

---

## 📝 Resumo

1. ✅ Domínios devem estar no **SERVIÇO FRONTEND**
2. ✅ Destino deve apontar para o **NOME DO FRONTEND** (ex: `painelcrm` ou `painelcrm_frontend`)
3. ✅ Porta: `80`
4. ✅ Backend **NÃO deve ter domínios públicos**

