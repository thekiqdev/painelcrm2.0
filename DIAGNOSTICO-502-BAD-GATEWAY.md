# Diagnóstico: Erro 502 Bad Gateway

## O que significa 502 Bad Gateway?

O erro **502 Bad Gateway** indica que o **Nginx (frontend)** não consegue se conectar ao **backend**. Isso pode acontecer quando:

1. O backend não está rodando
2. O backend está crashando ao iniciar
3. O backend não está acessível na rede interna do Docker
4. O nome do serviço backend está incorreto no Nginx

## Passos para Diagnosticar

### 1. Verificar se o Backend está Rodando

No Easypanel, acesse o serviço `painelcrm` (backend) e verifique:

- **Status**: Deve estar "Running" (verde)
- **Logs**: Procure por erros que fazem o container crashar

### 2. Verificar os Logs do Backend

Procure nos logs por:

```
🚀 Server running on port 3001
Environment: production
Listening on 0.0.0.0:3001
Connected to PostgreSQL database
✅ Connected to PostgreSQL database
```

**Se você ver erros como:**
- `Error: "expiresIn" should be a number...` → O JWT ainda está com problema
- `Error: Cannot find module...` → Dependências faltando
- `npm error signal SIGTERM` → Container está sendo reiniciado constantemente

### 3. Verificar se o Backend está Acessível Internamente

No terminal do container do **frontend**, execute:

```bash
# Testar se o backend está acessível
wget -O- http://painelcrm:3001/health

# Ou usando curl
curl http://painelcrm:3001/health
```

**Resultado esperado:**
```json
{"status":"ok","database":"connected","timestamp":"..."}
```

**Se der erro:**
- `Connection refused` → Backend não está rodando na porta 3001
- `Name or service not known` → Nome do serviço está incorreto

### 4. Verificar o Nome do Serviço Backend

No Easypanel:

1. Vá no serviço backend (`painelcrm`)
2. Verifique o **nome do serviço** (deve ser exatamente `painelcrm`)
3. Verifique se está na mesma **rede/projeto** que o frontend

### 5. Verificar a Configuração do Nginx

O arquivo `nginx.conf.prod` deve ter:

```nginx
location /api {
    set $backend "painelcrm:3001";
    proxy_pass http://$backend;
    ...
}
```

O nome `painelcrm` deve corresponder ao **nome do serviço** no Easypanel.

## Soluções Comuns

### Solução 1: Reiniciar o Backend

No Easypanel:
1. Vá no serviço `painelcrm` (backend)
2. Clique em **Restart**
3. Aguarde alguns segundos
4. Verifique os logs

### Solução 2: Verificar Variáveis de Ambiente

Certifique-se de que todas as variáveis estão configuradas:

- `POSTGRES_HOST` → Nome do serviço PostgreSQL
- `POSTGRES_PORT` → 5432
- `POSTGRES_DB` → Nome do banco
- `POSTGRES_USER` → postgres
- `POSTGRES_PASSWORD` → Senha do PostgreSQL
- `API_PORT` → 3001
- `NODE_ENV` → production
- `JWT_SECRET` → Chave secreta (obrigatória)
- `JWT_EXPIRES_IN` → 7d (sem texto adicional)
- `FRONTEND_URL` → URL do frontend
- `ALLOW_PASSWORD_UPDATE` → true (opcional)

### Solução 3: Verificar Dependências do Backend

No Easypanel, verifique se o backend tem a dependência do PostgreSQL configurada:

1. Vá no serviço `painelcrm` (backend)
2. Verifique **Dependencies**
3. Deve ter `painelcrmbd` (PostgreSQL) listado

### Solução 4: Verificar Logs de Erro do Backend

Procure nos logs por:

- Erros de conexão com PostgreSQL
- Erros de JWT
- Erros de módulos não encontrados
- Erros de sintaxe TypeScript

## Comandos Úteis para Debug

### No Terminal do Backend (Easypanel)

```bash
# Verificar se o servidor está escutando
netstat -tuln | grep 3001

# Verificar variáveis de ambiente
env | grep JWT
env | grep POSTGRES

# Testar conexão com PostgreSQL
psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT 1;"
```

### No Terminal do Frontend (Easypanel)

```bash
# Testar conexão com backend
wget -O- http://painelcrm:3001/health

# Ver logs do Nginx
cat /var/log/nginx/error.log
cat /var/log/nginx/api_error.log
```

## Próximos Passos

1. **Verifique os logs do backend** no Easypanel
2. **Teste o endpoint `/health`** do backend diretamente
3. **Verifique se o backend está rodando** e não está crashando
4. **Me envie os logs do backend** para análise

## Informações para Enviar

Se o problema persistir, me envie:

1. **Logs completos do backend** (últimas 50 linhas)
2. **Status do serviço backend** no Easypanel
3. **Resultado do comando** `wget -O- http://painelcrm:3001/health` (do container frontend)
4. **Configuração do Nginx** (se possível)

