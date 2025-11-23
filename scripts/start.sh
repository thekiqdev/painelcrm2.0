#!/bin/bash

# Script único para iniciar Docker, Backend e Frontend (Linux/Mac)
# Uso: ./scripts/start.sh [--skip-docker] [--skip-backend] [--skip-frontend]

SKIP_DOCKER=false
SKIP_BACKEND=false
SKIP_FRONTEND=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-docker)
            SKIP_DOCKER=true
            shift
            ;;
        --skip-backend)
            SKIP_BACKEND=true
            shift
            ;;
        --skip-frontend)
            SKIP_FRONTEND=true
            shift
            ;;
        *)
            echo "Opção desconhecida: $1"
            echo "Uso: $0 [--skip-docker] [--skip-backend] [--skip-frontend]"
            exit 1
            ;;
    esac
done

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
GRAY='\033[0;37m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Iniciando ambiente completo...${NC}"
echo ""

# Função para verificar se uma porta está em uso
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        return 0
    else
        return 1
    fi
}

# 1. Iniciar Docker (PostgreSQL)
if [ "$SKIP_DOCKER" = false ]; then
    echo -e "${YELLOW}📦 Verificando Docker...${NC}"
    
    # Verificar se Docker está rodando
    if ! docker ps &> /dev/null; then
        echo -e "${RED}❌ Docker não está rodando. Por favor, inicie o Docker.${NC}"
        exit 1
    fi
    
    echo -e "${YELLOW}🐘 Iniciando PostgreSQL...${NC}"
    docker-compose up -d postgres
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Erro ao iniciar PostgreSQL${NC}"
        exit 1
    fi
    
    # Aguardar PostgreSQL estar pronto
    echo -e "${YELLOW}⏳ Aguardando PostgreSQL estar pronto...${NC}"
    max_attempts=30
    attempt=0
    ready=false
    
    while [ $attempt -lt $max_attempts ] && [ "$ready" = false ]; do
        sleep 2
        attempt=$((attempt + 1))
        if docker-compose exec -T postgres pg_isready -U postgres &> /dev/null; then
            echo -e "${GREEN}✅ PostgreSQL está pronto!${NC}"
            ready=true
            break
        fi
        echo -e "${GRAY}   Tentativa $attempt/$max_attempts...${NC}"
    done
    
    if [ "$ready" = false ]; then
        echo -e "${YELLOW}⚠️  PostgreSQL pode não estar totalmente pronto, mas continuando...${NC}"
    fi
    
    echo ""
else
    echo -e "${YELLOW}⏭️  Pulando Docker (--skip-docker)${NC}"
    echo ""
fi

# 2. Verificar e instalar dependências do Backend
if [ "$SKIP_BACKEND" = false ]; then
    echo -e "${YELLOW}📦 Verificando dependências do Backend...${NC}"
    
    if [ ! -d "packages/backend/node_modules" ]; then
        echo -e "${GRAY}   Instalando dependências do backend...${NC}"
        cd packages/backend
        npm install
        if [ $? -ne 0 ]; then
            echo -e "${RED}❌ Erro ao instalar dependências do backend${NC}"
            cd ../..
            exit 1
        fi
        cd ../..
    fi
    
    echo -e "${GREEN}✅ Dependências do backend verificadas${NC}"
    echo ""
fi

# 3. Verificar e instalar dependências do Frontend
if [ "$SKIP_FRONTEND" = false ]; then
    echo -e "${YELLOW}📦 Verificando dependências do Frontend...${NC}"
    
    if [ ! -d "node_modules" ]; then
        echo -e "${GRAY}   Instalando dependências do frontend...${NC}"
        npm install
        if [ $? -ne 0 ]; then
            echo -e "${RED}❌ Erro ao instalar dependências do frontend${NC}"
            exit 1
        fi
    fi
    
    echo -e "${GREEN}✅ Dependências do frontend verificadas${NC}"
    echo ""
fi

# 4. Verificar arquivo .env
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  Arquivo .env não encontrado!${NC}"
    if [ -f ".env.example" ]; then
        echo -e "${GRAY}   Criando .env a partir do .env.example...${NC}"
        cp .env.example .env
        echo -e "${GREEN}✅ Arquivo .env criado. Configure as variáveis se necessário.${NC}"
    else
        echo -e "${YELLOW}⚠️  Arquivo .env.example não encontrado. Crie um arquivo .env manualmente.${NC}"
    fi
    echo ""
fi

# 5. Iniciar Backend
if [ "$SKIP_BACKEND" = false ]; then
    echo -e "${CYAN}🔧 Iniciando Backend...${NC}"
    echo -e "${GRAY}   Backend rodará em: http://localhost:3001${NC}"
    echo ""
    
    # Verificar se porta 3001 está em uso
    if check_port 3001; then
        echo -e "${YELLOW}⚠️  Porta 3001 já está em uso. Verifique se o backend já está rodando.${NC}"
    fi
    
    # Criar script temporário para backend
    cat > /tmp/start_backend.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")/../packages/backend"
npm run dev
EOF
    chmod +x /tmp/start_backend.sh
    
    # Iniciar backend em nova janela (gnome-terminal, xterm, ou terminal padrão)
    if command -v gnome-terminal &> /dev/null; then
        gnome-terminal -- bash -c "cd '$(pwd)' && /tmp/start_backend.sh; exec bash" &
    elif command -v xterm &> /dev/null; then
        xterm -e "cd '$(pwd)' && /tmp/start_backend.sh; exec bash" &
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        osascript -e "tell app \"Terminal\" to do script \"cd '$(pwd)' && /tmp/start_backend.sh\""
    else
        echo -e "${YELLOW}⚠️  Não foi possível abrir nova janela. Execute manualmente:${NC}"
        echo -e "${GRAY}   cd packages/backend && npm run dev${NC}"
    fi
    
    sleep 2
    echo -e "${GREEN}✅ Backend iniciado${NC}"
    echo ""
else
    echo -e "${YELLOW}⏭️  Pulando Backend (--skip-backend)${NC}"
    echo ""
fi

# 6. Iniciar Frontend
if [ "$SKIP_FRONTEND" = false ]; then
    echo -e "${CYAN}🎨 Iniciando Frontend...${NC}"
    echo -e "${GRAY}   Frontend rodará em: http://localhost:5173${NC}"
    echo ""
    
    # Verificar se porta 5173 está em uso
    if check_port 5173; then
        echo -e "${YELLOW}⚠️  Porta 5173 já está em uso. Verifique se o frontend já está rodando.${NC}"
    fi
    
    # Criar script temporário para frontend
    cat > /tmp/start_frontend.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")/.."
npm run dev
EOF
    chmod +x /tmp/start_frontend.sh
    
    # Iniciar frontend em nova janela
    if command -v gnome-terminal &> /dev/null; then
        gnome-terminal -- bash -c "cd '$(pwd)' && /tmp/start_frontend.sh; exec bash" &
    elif command -v xterm &> /dev/null; then
        xterm -e "cd '$(pwd)' && /tmp/start_frontend.sh; exec bash" &
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        osascript -e "tell app \"Terminal\" to do script \"cd '$(pwd)' && /tmp/start_frontend.sh\""
    else
        echo -e "${YELLOW}⚠️  Não foi possível abrir nova janela. Execute manualmente:${NC}"
        echo -e "${GRAY}   npm run dev${NC}"
    fi
    
    sleep 2
    echo -e "${GREEN}✅ Frontend iniciado${NC}"
    echo ""
else
    echo -e "${YELLOW}⏭️  Pulando Frontend (--skip-frontend)${NC}"
    echo ""
fi

# Resumo
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Ambiente iniciado com sucesso!${NC}"
echo ""
echo -e "${CYAN}📍 URLs:${NC}"
echo -e "${NC}   Frontend: ${GRAY}http://localhost:5173${NC}"
echo -e "${NC}   Backend:  ${GRAY}http://localhost:3001${NC}"
echo -e "${NC}   Health:   ${GRAY}http://localhost:3001/health${NC}"
echo ""
echo -e "${CYAN}💡 Dicas:${NC}"
echo -e "${GRAY}   - Use Ctrl+C para parar os servidores${NC}"
echo -e "${GRAY}   - Para parar o Docker: docker-compose down${NC}"
echo -e "${GRAY}   - Para ver logs: docker-compose logs -f${NC}"
echo ""
echo -e "${CYAN}📝 Para usar opções:${NC}"
echo -e "${GRAY}   ./scripts/start.sh --skip-docker    # Pular Docker${NC}"
echo -e "${GRAY}   ./scripts/start.sh --skip-backend  # Pular Backend${NC}"
echo -e "${GRAY}   ./scripts/start.sh --skip-frontend  # Pular Frontend${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"



