# PHASE8_REDIS_CONFIGURATION

| Campo | Valor |
|---|---|
| **Phase** | 8 |
| **Data** | 2026-07-14 |
| **ADR** | ADR-012 |

---

## Variáveis

| Env | Obrigatório | Default | Descrição |
|---|---|---|---|
| `SOCKET_IO_REDIS_ADAPTER` | Não | off | `1` força tentativa do adapter |
| `CHAT_REDIS_WS` (painel) | Não | OFF | Alternativa ao force env |
| `REDIS_URL` | Não* | — | URL completa (`redis://` / `rediss://`) |
| `REDIS_HOST` | Não* | `127.0.0.1` | Host |
| `REDIS_PORT` | Não | `6379` | Porta |
| `REDIS_PASSWORD` | Não | — | Auth |
| `REDIS_TLS` | Não | off | TLS (`1`) |
| `SOCKET_IO_REDIS_KEY_PREFIX` | Não | `painelcrm-socket.io` | Namespace pub/sub |
| `SOCKET_IO_NODE_ID` | Não | `hostname:pid` | Id da réplica |
| `SOCKET_IO_REDIS_CONNECT_MS` | Não | `5000` | Timeout connect |

\*É necessário `REDIS_URL` **ou** `REDIS_HOST` quando o adapter está habilitado.

## Ativação

Adapter liga se:

1. (`SOCKET_IO_REDIS_ADAPTER=1` **OU** flag `CHAT_REDIS_WS` ON) **E**
2. endpoint Redis configurado.

Caso Redis falhe no boot → **fallback in-memory** (single-node). HTTP continua.

## Rollback imediato

1. `SOCKET_IO_REDIS_ADAPTER=0` + flag `CHAT_REDIS_WS` OFF  
2. Restart réplicas (ou rolling)  
3. Sticky session no proxy (opcional, recomendado durante transição)

## Exemplo produção (2 réplicas)

```bash
SOCKET_IO_REDIS_ADAPTER=1
REDIS_URL=rediss://:SECRET@redis.internal:6379/0
SOCKET_IO_REDIS_KEY_PREFIX=painelcrm-socket.io
SOCKET_IO_NODE_ID=api-a-1
```

Réplica B: `SOCKET_IO_NODE_ID=api-b-1` (mesmo Redis / prefix).
