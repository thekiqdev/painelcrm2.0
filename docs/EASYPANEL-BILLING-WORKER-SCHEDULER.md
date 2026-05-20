# EasyPanel — Billing Worker e Scheduler

Motor de recorrência: **dois serviços App adicionais**, mesmo repositório e **mesmas variáveis de ambiente** que `painelcrm-backend`.

Não expõem porta HTTP pública.

---

## Serviços

| Nome sugerido | Dockerfile | Porta HTTP | Função |
|---------------|------------|------------|--------|
| `painelcrm-billing-scheduler` | `Dockerfile.billing-scheduler` | Nenhuma (desativar expose) | Enfileira jobs (`enqueueRenewalJobs`) a cada **10 min** |
| `painelcrm-billing-worker` | `Dockerfile.billing-worker` | Nenhuma | Processa fila a cada **15 s** |

---

## Criar no EasyPanel

### 1. `painelcrm-billing-scheduler`

1. **New Service** → **App**
2. **Source**: mesmo repo/branch do backend
3. **Build**
   - Dockerfile: `Dockerfile.billing-scheduler`
   - Context: `.` (raiz)
4. **Deploy**
   - **Não** publicar porta HTTP (sem domínio)
   - Health check: desativar HTTP ou usar health interno Docker (já definido no Dockerfile)
5. **Environment**
   - **Copiar todas** as variáveis do serviço `painelcrm-backend` (ou `painelcrm`)
   - Ajustar só se necessário:
     - `POSTGRES_HOST` = hostname interno do Postgres no painel (ex. `sistemas_painelcrmbd`)
     - `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
     - `JWT_SECRET`, gateways, e-mail, WhatsApp, storage, etc.
   - Opcional:
     - `BILLING_SCHEDULER_LOOP_SECONDS=600` (default 10 min)
     - `RECURRING_WORKER_ID=docker-scheduler` (identificador em logs; não é o worker de batch)
6. **Dependencies**: Postgres + backend (opcional; mínimo: Postgres acessível)

### 2. `painelcrm-billing-worker`

Igual ao scheduler, com:

- Dockerfile: `Dockerfile.billing-worker`
- Opcional:
  - `BILLING_WORKER_LOOP_SECONDS=15`
  - `RECURRING_WORKER_ID=docker-worker-1`

---

## Logs esperados

```
[BILLING_SCHEDULER] 2026-05-19T12:00:00Z startup pid=1 ...
[BILLING_SCHEDULER] 2026-05-19T12:00:00Z loop tick: starting run
[BILLING] {"type":"scheduler_exit",...}
[BILLING_WORKER] 2026-05-19T12:00:01Z loop tick: starting run
[BILLING] {"type":"worker_exit",...}
```

Se só aparecer log da API e **nunca** `[BILLING_SCHEDULER]` / `[BILLING_WORKER]`, os serviços não estão no ar.

---

## Heartbeat (após migração 248)

Com processos a correr, em SQL:

```sql
SELECT * FROM billing_ops_heartbeat;
```

Ou Super Admin: `GET /api/superadmin/billing/recurring-jobs` → `process_heartbeats`.

---

## Docker Compose local

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build \
  postgres backend billing-scheduler billing-worker frontend
```

Logs:

```bash
docker compose -f docker-compose.prod.yml logs -f billing-worker billing-scheduler
```

---

## Variáveis de loop (opcional)

| Variável | Default | Serviço |
|----------|---------|---------|
| `BILLING_WORKER_LOOP_SECONDS` | `15` | worker |
| `BILLING_SCHEDULER_LOOP_SECONDS` | `600` | scheduler |
| `BILLING_WORKER_HEALTH_MAX_AGE_SEC` | `180` | healthcheck worker |
| `BILLING_SCHEDULER_HEALTH_MAX_AGE_SEC` | `900` | healthcheck scheduler |

---

## SIGTERM

Os scripts `scripts/start-billing-*.sh` usam `trap` + sleep em segundos para encerrar no próximo tick após `docker stop` (via `tini` no ENTRYPOINT).

---

## Referências

- `docs/INVESTIGACAO_WORKER_FINANCEIRO_PRODUCAO.md`
- `env.example` (bloco Billing)
- `Dockerfile.billing-worker`, `Dockerfile.billing-scheduler`
