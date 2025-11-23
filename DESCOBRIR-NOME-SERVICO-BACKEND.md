# Como Descobrir o Nome Correto do Serviço Backend

## Problema

O erro `wget: bad address 'painelcrm:3001'` indica que o nome do serviço não está correto ou os serviços não estão na mesma rede.

## Passo 1: Verificar o Nome do Serviço Backend no Easypanel

1. **Acesse o Easypanel**
2. **Vá no projeto** onde está o backend
3. **Encontre o serviço backend** (geralmente chamado de "painelcrm" ou "painelcrm-backend")
4. **Clique no serviço** para abrir os detalhes
5. **Procure pelo nome do serviço** - geralmente aparece no topo da página ou nas configurações

## Passo 2: Verificar Nomes Alternativos Comuns

No Easypanel, o nome do serviço pode ser:

- `painelcrm` (sem hífen)
- `painelcrm-backend` (com hífen)
- `painelcrm_api` (com underscore)
- `backend` (nome genérico)
- `api` (nome genérico)

## Passo 3: Testar Diferentes Nomes

No terminal do container **frontend**, teste cada nome:

```bash
# Teste 1: painelcrm
wget -O- http://painelcrm:3001/health

# Teste 2: painelcrm-backend
wget -O- http://painelcrm-backend:3001/health

# Teste 3: backend
wget -O- http://backend:3001/health

# Teste 4: api
wget -O- http://api:3001/health
```

**O que funciona:** Se algum desses comandos retornar JSON com `{"status":"ok"...}`, esse é o nome correto!

## Passo 4: Verificar Variáveis de Ambiente do Backend

No Easypanel, no serviço backend, verifique se há alguma variável de ambiente que indique o nome do serviço ou host.

## Passo 5: Verificar Rede Docker

Certifique-se de que ambos os serviços (frontend e backend) estão na **mesma rede/projeto** no Easypanel.

## Passo 6: Usar IP do Container (Alternativa Temporária)

Se não conseguir descobrir o nome, você pode usar o IP do container:

1. **No terminal do backend**, execute:
   ```bash
   hostname -i
   ```
   Isso retornará o IP interno do container.

2. **No terminal do frontend**, teste:
   ```bash
   wget -O- http://<IP_DO_BACKEND>:3001/health
   ```

**Nota:** O IP pode mudar quando o container reiniciar, então isso é apenas para teste.

## Passo 7: Atualizar nginx.conf.prod

Depois de descobrir o nome correto, atualize o arquivo `nginx.conf.prod`:

```nginx
location /api {
    set $backend "NOME_CORRETO_AQUI:3001";
    proxy_pass http://$backend;
    ...
}
```

## Informações para Enviar

Me envie:

1. **Nome exato do serviço backend** no Easypanel
2. **Resultado dos testes** com diferentes nomes
3. **Se os serviços estão no mesmo projeto/rede** no Easypanel

