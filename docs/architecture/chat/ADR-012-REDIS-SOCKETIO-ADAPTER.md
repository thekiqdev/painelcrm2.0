# ADR-012 — Redis Socket.IO Adapter (F7 / Phase 8)

| Campo | Valor |
|---|---|
| **ADR** | 012 |
| **Status** | Accepted |
| **Data** | 2026-07-14 |
| **Phase** | 8 |

## Context

Multi-réplica Node sem adapter perde fan-out cross-node (salas `user:` / `tenant:`). F7 exige `@socket.io/redis-adapter` (ou equivalente) com rollback para single-node.

## Decision

1. Usar `@socket.io/redis-adapter` + `ioredis` (pub + sub duplicado).
2. Ativação: `SOCKET_IO_REDIS_ADAPTER=1` **ou** flag `CHAT_REDIS_WS` ON, **e** Redis configurado.
3. Falha Redis no boot → **fallback in-memory** (single-node equivalente); nunca crashar o HTTP.
4. Prefix de canal configurável (`SOCKET_IO_REDIS_KEY_PREFIX`).
5. Métricas: `redis_adapter_ready`, health ping, reconnects, node id.

## Consequences

- Sticky sessions deixam de ser obrigatórias para chat delivery (ainda úteis para balancing).
- Ops deve provisionar Redis HA antes de canário multi-réplica.
- Default OFF — single-node inalterado.
