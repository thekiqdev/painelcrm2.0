# Configuração do Build Context no Easypanel

## ⚠️ Problema Atual

O Docker não está encontrando os arquivos porque o **Build Context** pode estar incorreto no Easypanel.

## ✅ Solução

### No Easypanel, configure:

1. **Build Context**: Deve ser `.` (ponto = raiz do repositório)
   - OU deixe vazio (padrão é raiz)
   - NÃO use `packages/backend` ou qualquer subpasta

2. **Dockerfile Path**: Deve ser `Dockerfile` (ou vazio se estiver na raiz)

### Estrutura Esperada

O Easypanel deve clonar o repositório e o contexto de build deve ser a **raiz**, assim:

```
/code/                          ← Build Context (raiz)
├── Dockerfile                  ← Dockerfile aqui
├── packages/
│   └── backend/
│       ├── package.json        ← Arquivo que o Docker procura
│       ├── package-lock.json
│       ├── src/
│       └── tsconfig.json
└── ...
```

## 🔍 Verificação

Se o erro persistir, verifique no Easypanel:

1. **Settings** → **Build** → **Build Context**
   - Deve estar como `.` ou vazio
   
2. **Settings** → **Build** → **Dockerfile Path**
   - Deve estar como `Dockerfile` ou vazio

3. **Settings** → **Source** → **Repository**
   - Verifique se está clonando o repositório correto
   - Verifique se está na branch correta (geralmente `main`)

## 📝 Alternativa: Dockerfile com Contexto Diferente

Se o Easypanel não permitir mudar o Build Context, podemos criar um Dockerfile que funciona com contexto em `packages/backend`, mas isso requer uma configuração diferente.

## 🚀 Próximos Passos

1. Verifique a configuração do Build Context no Easypanel
2. Certifique-se de que está como `.` (raiz)
3. Tente fazer deploy novamente

