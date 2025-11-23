# ⚡ Correção Rápida - 2 Problemas

## 🚨 Problema 1: Backend Reiniciando (Status Laranja)

**Causa**: Health check do Easypanel está falhando

**Solução**:
1. Easypanel → Serviço Backend (`painelcrm` ou `sistemas_painelcrm`)
2. Configurações → Health Check
3. Configure:
   - **Path**: `/health`
   - **Port**: `3001` ⚠️ **IMPORTANTE: Porta 3001, não 80!**
   - **Start Period**: `40s`
4. Salve

---

## 🚨 Problema 2: Domínios Apontando para Backend

**Causa**: Domínios do frontend estão apontando para `http://sistemas_painelcrm:80/` (backend)

**Solução**:
1. Easypanel → Serviço Frontend (`painelcrm` ou `painelcrm_frontend`)
2. Domínios → Editar cada domínio
3. Altere o destino de:
   ```
   http://sistemas_painelcrm:80/
   ```
   Para:
   ```
   http://painelcrm:80/
   ```
   (ou `http://painelcrm_frontend:80/` - use o nome exato do serviço frontend)

4. Salve

---

## ✅ Resultado Esperado

Após corrigir:
- ✅ Backend fica **VERDE** (não mais laranja)
- ✅ Frontend carrega **sem erro 502**
- ✅ Login funciona

---

## 🧪 Teste Rápido

Após corrigir, teste:
1. Acesse o domínio público
2. Deve carregar a página de login
3. Tente fazer login
4. Não deve aparecer erro 502

