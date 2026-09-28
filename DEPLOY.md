# Guia de Deploy - VPS

Este guia explica como fazer o deploy do sistema em uma VPS para testes iniciais.

## Pré-requisitos

- VPS com Ubuntu 20.04+ ou similar
- Docker e Docker Compose instalados
- Domínio configurado (opcional, para HTTPS)
- Acesso SSH à VPS

## Passo 1: Preparar a VPS

### Instalar Docker e Docker Compose

```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Adicionar usuário ao grupo docker
sudo usermod -aG docker $USER

# Instalar Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Reiniciar sessão SSH ou fazer logout/login
```

### Configurar Firewall

```bash
# Permitir portas necessárias
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

## Passo 2: Clonar e Configurar o Projeto

```bash
# Clonar repositório
git clone <seu-repositorio> painelcrm
cd painelcrm

# Criar arquivo .env de produção
cp .env.example .env.production
nano .env.production
```

### Configurar .env.production

```env
# PostgreSQL
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<senha-forte-aqui>
POSTGRES_DB=painelcrm
POSTGRES_HOST=postgres
POSTGRES_PORT=5432

# JWT
JWT_SECRET=<gerar-uma-chave-secreta-forte>
JWT_EXPIRES_IN=7d

# API
API_PORT=3001
NODE_ENV=production
FRONTEND_URL=https://seudominio.com

# Frontend
VITE_API_URL=https://seudominio.com/api
```

## Passo 3: Build e Deploy

### Opção A: Docker Compose (Recomendado)

```bash
# Build e iniciar todos os serviços
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d --build

# Verificar logs
docker-compose -f docker-compose.prod.yml logs -f

# Verificar status
docker-compose -f docker-compose.prod.yml ps
```

### Billing (recorrência) — serviços obrigatórios

A API **não** processa faturas recorrentes sozinha. O compose de produção inclui:

| Serviço | Dockerfile | Container |
|---------|------------|-----------|
| `billing-scheduler` | `Dockerfile.billing.scheduler` | `painelcrm_billing_scheduler_prod` |
| `billing-worker` | `Dockerfile.billing.worker` | `painelcrm_billing_worker_prod` |

Usam o **mesmo** `.env.production` que o backend. Logs: `[BILLING_SCHEDULER]`, `[BILLING_WORKER]`, `[BILLING]`.

```bash
docker-compose -f docker-compose.prod.yml logs -f billing-worker billing-scheduler
```

**EasyPanel:** ver `docs/EASYPANEL-BILLING-WORKER-SCHEDULER.md`.

### Opção B: Deploy Manual (PM2)

```bash
# Backend
cd packages/backend
npm install --production
npm run build
pm2 start dist/index.js --name painelcrm-backend
pm2 save

# Frontend
cd ../..
npm install
npm run build
# Servir com nginx ou outro servidor web
```

## Passo 4: Configurar Nginx (Se não usar Docker)

```bash
# Instalar Nginx
sudo apt install nginx -y

# Criar configuração
sudo nano /etc/nginx/sites-available/painelcrm
```

```nginx
server {
    listen 80;
    server_name seudominio.com;

    # Frontend
    location / {
        root /caminho/para/painelcrm/dist;
        try_files $uri $uri/ /index.html;
    }

    # API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# Ativar site
sudo ln -s /etc/nginx/sites-available/painelcrm /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Passo 5: Configurar HTTPS (Let's Encrypt)

```bash
# Instalar Certbot
sudo apt install certbot python3-certbot-nginx -y

# Obter certificado
sudo certbot --nginx -d seudominio.com

# Renovação automática (já configurado)
sudo certbot renew --dry-run
```

## Passo 6: Backup do Banco de Dados

### Script de Backup

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backups/painelcrm"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/painelcrm_$DATE.sql"

mkdir -p $BACKUP_DIR

docker-compose -f docker-compose.prod.yml exec -T postgres pg_dump -U postgres painelcrm > $BACKUP_FILE

# Manter apenas últimos 7 dias
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete

echo "Backup criado: $BACKUP_FILE"
```

### Agendar Backup Diário

```bash
# Adicionar ao crontab
crontab -e

# Adicionar linha:
0 2 * * * /caminho/para/backup.sh
```

## Passo 7: Monitoramento

### Verificar Logs

```bash
# Logs do Docker
docker-compose -f docker-compose.prod.yml logs -f

# Logs específicos
docker-compose -f docker-compose.prod.yml logs -f backend
docker-compose -f docker-compose.prod.yml logs -f frontend
docker-compose -f docker-compose.prod.yml logs -f postgres
```

### Health Check

```bash
# Verificar saúde da API
curl http://localhost:3001/health

# Verificar banco de dados
docker-compose -f docker-compose.prod.yml exec postgres pg_isready -U postgres
```

## Comandos Úteis

```bash
# Parar serviços
docker-compose -f docker-compose.prod.yml down

# Reiniciar serviços
docker-compose -f docker-compose.prod.yml restart

# Atualizar código
git pull
docker-compose -f docker-compose.prod.yml up -d --build

# Acessar banco de dados
docker-compose -f docker-compose.prod.yml exec postgres psql -U postgres -d painelcrm

# Ver uso de recursos
docker stats
```

## Troubleshooting

### Backend não inicia
- Verificar logs: `docker-compose logs backend`
- Verificar variáveis de ambiente
- Verificar conexão com banco de dados

### Frontend não carrega
- Verificar build: `npm run build`
- Verificar nginx logs: `sudo tail -f /var/log/nginx/error.log`
- Verificar permissões dos arquivos

### Banco de dados não conecta
- Verificar se PostgreSQL está rodando: `docker-compose ps`
- Verificar credenciais no .env
- Verificar logs: `docker-compose logs postgres`

## Segurança

1. **Alterar senhas padrão** no .env.production
2. **Configurar firewall** (UFW)
3. **Usar HTTPS** (Let's Encrypt)
4. **Backup regular** do banco de dados
5. **Atualizar sistema** regularmente
6. **Monitorar logs** para atividades suspeitas

