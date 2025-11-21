# ⚠️ Configuração Crítica no Easypanel

## Problema: "package.json: not found"

O erro indica que o **Build Context** no Easypanel não está configurado corretamente.

## ✅ Solução Passo a Passo

### 1. Acesse as Configurações do Serviço

No Easypanel, vá em:
- **Seu Projeto** → **Serviço Backend** → **Settings** → **Build**

### 2. Configure o Build Context

**Campo: "Build Context"**
- Valor: `.` (ponto)
- OU deixe **vazio** (padrão é raiz)
- ❌ NÃO use: `packages/backend` ou qualquer subpasta

### 3. Configure o Dockerfile Path

**Campo: "Dockerfile Path"**
- Valor: `Dockerfile`
- OU deixe **vazio** se o Dockerfile estiver na raiz

### 4. Verifique a Estrutura

O Easypanel deve clonar o repositório assim:

```
/code/                          ← Build Context (raiz)
├── Dockerfile                  ← Deve estar aqui
├── packages/
│   └── backend/
│       ├── package.json        ← Arquivo que o Docker procura
│       ├── package-lock.json
│       └── src/
└── ...
```

## 🔍 Como Verificar

### Opção 1: Verificar nos Logs

Após tentar fazer deploy, veja os logs. Se aparecer:
```
"/packages/backend/package.json": not found
```

Significa que o Build Context está errado.

### Opção 2: Testar Localmente

Teste o build localmente para confirmar que o Dockerfile está correto:

```bash
# Na raiz do repositório
docker build -f Dockerfile -t painelcrm-backend .
```

Se funcionar localmente, o problema é apenas a configuração do Build Context no Easypanel.

## 📋 Checklist de Configuração

- [ ] Build Context = `.` (ponto) ou vazio
- [ ] Dockerfile Path = `Dockerfile` ou vazio
- [ ] Repositório está conectado corretamente
- [ ] Branch correta está selecionada (geralmente `main`)
- [ ] Dockerfile está commitado no Git

## 🚀 Após Configurar

1. Salve as configurações
2. Tente fazer deploy novamente
3. Verifique os logs do build

## 💡 Dica

Se o Easypanel não permitir configurar o Build Context, tente:
- Deixar o campo vazio
- Usar `./` em vez de `.`
- Verificar se há uma opção "Root Directory" ou similar

