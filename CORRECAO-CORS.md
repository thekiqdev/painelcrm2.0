# 🔧 Correção: Erro de CORS

## Problema
O backend está configurado para aceitar apenas `http://localhost:5173`, mas o frontend está rodando em `http://localhost:8080`.

Erro:
```
Access-Control-Allow-Origin header has a value 'http://localhost:5173' 
that is not equal to the supplied origin 'http://localhost:8080'
```

## Solução Aplicada

A configuração do CORS foi atualizada para aceitar múltiplas origens:
- `http://localhost:5173` (porta padrão do Vite)
- `http://localhost:8080` (porta alternativa)
- `http://localhost:8081` (porta alternativa)
- `http://127.0.0.1:*` (equivalente)

## Próximo Passo

**Reinicie o backend** para aplicar as mudanças:

1. Feche a janela do backend (Ctrl+C)
2. Execute novamente: `.\start.bat`
3. Ou inicie apenas o backend: `.\iniciar-backend-simples.bat`

Após reiniciar, o CORS deve funcionar e você poderá fazer login!

