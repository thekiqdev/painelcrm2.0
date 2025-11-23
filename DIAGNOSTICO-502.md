# Diagnóstico: Erro 502 Bad Gateway

## 🔍 Problema
O frontend está retornando erro 502, o que significa que o Nginx não consegue se conectar ao backend.

## ✅ Verificações Necessárias

### 1. Verificar se o Backend está rodando

No Easypanel:
1. Acesse o serviço **Backend** (`painelcrm`)
2. Verifique se o status está **verde** (rodando)
3. Verifique os logs - você deve ver:
   ```
   🚀 Server running on port 3001
   Environment: production
   Listening on 0.0.0.0:3001
   ✅ Connected to PostgreSQL database
   ```

### 2. Verificar o nome do serviço Backend

**IMPORTANTE**: Confirme o nome exato do serviço Backend no Easypanel:
- Se o serviço se chama `painelcrm` → está correto no `nginx.conf.prod`
- Se o serviço se chama outro nome (ex: `painelcrm-backend`) → precisa atualizar

### 3. Verificar se os serviços estão na mesma rede

No Easypanel, ambos os serviços (frontend e backend) devem estar no mesmo **projeto/namespace**.

### 4. Verificar a porta do backend

Confirme que o backend está rodando na porta **3001** e que está **exposta/publicada**.

## 🔧 Soluções

### Solução 1: Verificar nome do serviço

1. No Easypanel, anote o **nome exato** do serviço Backend
2. Se for diferente de `painelcrm`, atualize o `nginx.conf.prod`:

```nginx
location /api {
    proxy_pass http://NOME_DO_SERVICO_BACKEND:3001;
    # ... resto da configuração
}
```

3. Faça commit e push:
```bash
git add nginx.conf.prod
git commit -m "Fix backend service name in nginx config"
git push origin main
```

### Solução 2: Testar conexão interna

No terminal do serviço Frontend no Easypanel, teste:
```bash
wget -O- http://painelcrm:3001/health
```

Ou:
```bash
curl http://painelcrm:3001/health
```

Se funcionar, o problema é na configuração do Nginx.
Se não funcionar, o problema é o nome do serviço ou rede.

### Solução 3: Verificar logs do Nginx

Nos logs do serviço Frontend, procure por erros como:
- `connect() failed (111: Connection refused)`
- `upstream timed out`
- `no resolver defined`

## 📝 Checklist

- [ ] Backend está rodando (status verde)
- [ ] Backend está na porta 3001
- [ ] Nome do serviço backend está correto no `nginx.conf.prod`
- [ ] Frontend e Backend estão no mesmo projeto/namespace
- [ ] Porta 3001 do backend está exposta/publicada
- [ ] Teste de conexão interna funciona

## 🚀 Próximos Passos

1. Confirme o nome exato do serviço Backend no Easypanel
2. Se for diferente de `painelcrm`, me informe e eu atualizo o `nginx.conf.prod`
3. Teste a conexão interna usando os comandos acima
4. Verifique os logs do backend para confirmar que está rodando

