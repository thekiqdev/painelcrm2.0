# 🚀 Início da Migração - Guia Rápido

Este documento é um guia rápido para começar a migração. Para detalhes completos, consulte `PLANO-MIGRACAO-COMPLETO.md`.

---

## 📋 O Que Já Foi Feito

✅ **Autenticação completa** - Login, registro, perfil  
✅ **Leads** - CRUD completo  
✅ **Produtos** - Backend completo, frontend parcial  
✅ **Clientes** - Backend completo, frontend parcial  
✅ **Funnels** - Backend completo, frontend parcial  

---

## 🎯 Próximas Etapas (Ordem de Execução)

### **ETAPA 6: Carrinho e Pedidos** ⬅️ **PRÓXIMA**

**Por que começar aqui?**
- Funcionalidade core do sistema
- Relacionada com produtos (já migrado)
- Impacto direto no negócio

**O que fazer:**
1. Criar endpoints no backend (`packages/backend/src/controllers/cartController.ts` e `ordersController.ts`)
2. Criar rotas (`packages/backend/src/routes/cartRoutes.ts` e `ordersRoutes.ts`)
3. Migrar `src/services/cart.ts` para usar `apiClient`
4. Testar: adicionar ao carrinho, criar pedido, listar pedidos

**Arquivos a criar:**
- `packages/backend/src/controllers/cartController.ts`
- `packages/backend/src/controllers/ordersController.ts`
- `packages/backend/src/routes/cartRoutes.ts`
- `packages/backend/src/routes/ordersRoutes.ts`

**Arquivos a modificar:**
- `packages/backend/src/index.ts` (adicionar rotas)
- `src/services/cart.ts` (substituir Supabase por apiClient)

---

## 📝 Processo Padrão para Cada Etapa

### 1. Criar Backend Endpoints

```typescript
// Exemplo: packages/backend/src/controllers/cartController.ts
import { Request, Response } from 'express';
import { pool } from '../utils/db';
import { authMiddleware } from '../middleware/auth';

export async function getCart(req: Request, res: Response) {
  // Implementar lógica
}

export async function addToCart(req: Request, res: Response) {
  // Implementar lógica
}
```

### 2. Criar Rotas

```typescript
// Exemplo: packages/backend/src/routes/cartRoutes.ts
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import * as cartController from '../controllers/cartController';

const router = Router();

router.get('/:storeUserId', authMiddleware, cartController.getCart);
router.post('/:storeUserId/items', authMiddleware, cartController.addToCart);
// ... outras rotas

export default router;
```

### 3. Registrar Rotas no Backend

```typescript
// packages/backend/src/index.ts
import cartRoutes from './routes/cartRoutes';

app.use('/api/cart', cartRoutes);
```

### 4. Migrar Frontend

```typescript
// Antes (Supabase):
const { data, error } = await supabase
  .from('shopping_carts')
  .select('*')
  .eq('user_id', user.id);

// Depois (apiClient):
const response = await apiClient.get('/api/cart/:storeUserId');
if (response.error) throw new Error(response.error);
const cart = response.data;
```

### 5. Testar

- ✅ Criar registro
- ✅ Listar registros
- ✅ Atualizar registro
- ✅ Deletar registro
- ✅ Filtros funcionando

---

## 🔍 Como Encontrar Código Supabase

### Buscar por padrões:

```bash
# No terminal ou IDE, buscar:
supabase.from
supabase.auth
@supabase/supabase-js
from.*supabase
```

### Arquivos que geralmente contêm Supabase:

- `src/pages/*.tsx` - Páginas
- `src/services/*.ts` - Serviços
- `src/components/**/*.tsx` - Componentes
- `src/hooks/*.tsx` - Hooks customizados

---

## 📚 Documentação de Referência

- **Plano Completo**: `PLANO-MIGRACAO-COMPLETO.md` - Detalhes de todas as etapas
- **Checklist**: `CHECKLIST-MIGRACAO.md` - Marcar progresso
- **Backend Exemplo**: Ver `packages/backend/src/controllers/productsController.ts`
- **Frontend Exemplo**: Ver `src/services/products.ts`

---

## ⚠️ Dicas Importantes

1. **Sempre teste antes de passar para próxima etapa**
2. **Use o padrão dos controllers existentes** (productsController, clientsController)
3. **Valide dados com Zod** (ver exemplos nos controllers)
4. **Use authMiddleware** em todos os endpoints protegidos
5. **Trate erros consistentemente** (padrão já estabelecido)

---

## 🐛 Troubleshooting

### Erro: "Cannot find module '@/integrations/api/client'"
- Verificar se `apiClient` está importado corretamente
- Verificar se o arquivo existe: `src/integrations/api/client.ts`

### Erro: "401 Unauthorized"
- Verificar se o token JWT está sendo enviado
- Verificar se `apiClient.setToken()` foi chamado após login

### Erro: "CORS policy"
- Verificar se a origem do frontend está no CORS do backend
- Verificar `packages/backend/src/index.ts` (configuração CORS)

---

## 📞 Próximo Passo

**Começar pela ETAPA 6: Carrinho e Pedidos**

1. Abrir `PLANO-MIGRACAO-COMPLETO.md`
2. Ir para seção "ETAPA 6: Carrinho e Pedidos"
3. Seguir o processo padrão acima
4. Marcar no `CHECKLIST-MIGRACAO.md` quando concluir

**Boa sorte! 🚀**


