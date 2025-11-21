# Solução para Erro "no such file or directory" no Easypanel

## Problema

O Easypanel está procurando o Dockerfile mas não encontra. Isso geralmente acontece por:

1. **Dockerfile não commitado no Git**
2. **Contexto de build incorreto**
3. **Caminho do Dockerfile errado na configuração**

## Solução Passo a Passo

### 1. Verificar se o Dockerfile está no repositório

Execute no terminal local:

```bash
git status
git add Dockerfile
git add Dockerfile.frontend
git commit -m "Add Dockerfiles for Easypanel deployment"
git push
```

### 2. Configurar no Easypanel

#### Para o Serviço Backend:

1. **Tipo de Serviço**: App
2. **Nome**: `painelcrm-backend`
3. **Dockerfile Path**: `Dockerfile` (ou deixe vazio se estiver na raiz)
4. **Build Context**: `.` (ponto = raiz do repositório)
5. **Porta**: `3001`

**IMPORTANTE**: O **Build Context** deve ser a **raiz do repositório** (`.`), não uma subpasta.

#### Para o Serviço Frontend:

1. **Tipo de Serviço**: App
2. **Nome**: `painelcrm-frontend`
3. **Dockerfile Path**: `Dockerfile.frontend`
4. **Build Context**: `.` (ponto = raiz do repositório)
5. **Porta**: `80`

### 3. Verificar Estrutura do Repositório

Certifique-se de que a estrutura está assim:

```
painelcrm/
├── Dockerfile              ← Deve estar aqui (raiz)
├── Dockerfile.frontend     ← Deve estar aqui (raiz)
├── packages/
│   └── backend/
│       ├── package.json
│       └── src/
├── package.json
└── ...
```

### 4. Se o Erro Persistir

#### Opção A: Verificar no Easypanel

1. Vá em **Settings** do serviço
2. Verifique o campo **"Dockerfile Path"**:
   - Deve estar vazio OU
   - Deve ser exatamente `Dockerfile` (sem caminho)
3. Verifique o campo **"Build Context"**:
   - Deve ser `.` (ponto) OU
   - Deve estar vazio (padrão é raiz)

#### Opção B: Usar Dockerfile Absoluto

Se o Easypanel permitir, tente:
- **Dockerfile Path**: `./Dockerfile`

#### Opção C: Verificar Branch

Certifique-se de que está fazendo deploy da branch correta (geralmente `main` ou `master`).

### 5. Testar Localmente

Antes de fazer deploy, teste localmente:

```bash
# Testar build do backend
docker build -f Dockerfile -t painelcrm-backend .

# Testar build do frontend
docker build -f Dockerfile.frontend -t painelcrm-frontend .
```

Se funcionar localmente, o problema é apenas na configuração do Easypanel.

## Checklist

- [ ] Dockerfile está commitado no Git
- [ ] Dockerfile está na raiz do repositório
- [ ] Build Context no Easypanel está como `.` (raiz)
- [ ] Dockerfile Path está correto (`Dockerfile` ou vazio)
- [ ] Branch correta está selecionada no Easypanel
- [ ] Repositório foi clonado corretamente no Easypanel

## Comandos Úteis

```bash
# Verificar se Dockerfile existe
ls -la Dockerfile

# Verificar estrutura
tree -L 2 -I 'node_modules'

# Verificar git
git ls-files | grep Dockerfile
```

## Contato

Se o problema persistir, verifique:
1. Logs do build no Easypanel
2. Se o repositório está acessível
3. Se há permissões corretas

