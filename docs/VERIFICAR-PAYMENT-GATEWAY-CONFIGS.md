# Verificar configuração de gateway (payment_gateway_configs)

A tabela **não possui** coluna `billing_type`. O tipo de uso (SaaS vs CRM) é inferido pelo **scope**:
- `scope = 'global'` → uso em **plan-purchase** (SaaS)
- `scope = 'tenant'` → uso em cobranças do **tenant** (CRM)

## Query para inspecionar registros

```sql
SELECT id, scope, tenant_id, gateway_key, is_active, status, display_name, created_at
FROM payment_gateway_configs
ORDER BY scope, gateway_key;
```

Para ver se há credenciais (sem expor o valor):

```sql
SELECT id, scope, tenant_id, gateway_key, is_active, status,
       (credentials IS NOT NULL AND credentials != '{}'::jsonb) AS has_credentials
FROM payment_gateway_configs
ORDER BY scope, gateway_key;
```

## Filtro usado por getActiveConfig('saas')

Para **plan-purchase** (SaaS), o backend usa:

- `scope = 'global'`
- `is_active = true`
- `status IN ('active', 'pending')`

Se não houver nenhuma linha com esses critérios, o gateway não é resolvido e o plan-purchase retorna `hasGateway: false`.

## Corrigir config já salva com status 'pending'

Se você já configurou no Super Admin e a config ficou com `status = 'pending'`, pode ativar com:

```sql
UPDATE payment_gateway_configs
SET status = 'active', updated_at = now()
WHERE scope = 'global' AND gateway_key = 'asaas';
```

A partir da alteração feita no código, **novas** configurações salvas pelo Super Admin já são gravadas com `status = 'active'`, e o resolver também aceita `status = 'pending'` para scope global.
