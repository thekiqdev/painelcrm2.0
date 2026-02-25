# Portas em desenvolvimento (evitar conflito com outro projeto)

Quando você roda **dois projetos** na mesma máquina (ex.: PainelCRM e outro sistema), ambos usam por padrão a mesma API (3001) e o mesmo frontend (8080), o que gera conflito.

Use **portas diferentes** neste projeto via variáveis de ambiente.

## Neste projeto (PainelCRM)

No **`.env`** na raiz do projeto, defina por exemplo:

```env
# Backend (API) – ex.: 3002 para não conflitar com o outro em 3001
API_PORT=3002

# Frontend (Vite) – ex.: 8081 para não conflitar com o outro em 8080
VITE_DEV_PORT=8081

# URL da API que o frontend usa em dev (mesma porta do backend acima)
VITE_API_URL=http://localhost:3002

# CORS: origem do frontend (mesma porta do Vite acima)
FRONTEND_URL=http://localhost:8081
```

Assim:

- **Backend** sobe em `http://localhost:3002`
- **Frontend** sobe em `http://localhost:8081` e chama a API em `http://localhost:3002`
- O **outro projeto** pode continuar em 3001 (API) e 8080 (frontend)

## Como subir

1. Ajuste o `.env` como acima (ou com outras portas livres).
2. Backend: `cd packages/backend && npm run dev` (usa `API_PORT`).
3. Frontend: na raiz, `npm run dev` (Vite usa `VITE_DEV_PORT`).
4. Acesse o sistema em `http://localhost:8081` (ou a porta que definiu).

## Resumo

| Variável         | Uso                    | Exemplo (padrão)   |
|------------------|------------------------|--------------------|
| `API_PORT`       | Porta do backend       | 3001 → 3002        |
| `VITE_DEV_PORT`  | Porta do frontend (Vite)| 8080 → 8081       |
| `VITE_API_URL`   | URL da API em dev      | http://localhost:3002 |
| `FRONTEND_URL`   | CORS no backend        | http://localhost:8081 |
