# Before / After — S0 Performance

Preencher com medições reais em ambiente de staging/produção.

## Ambiente de teste

| Campo | Antes | Depois |
|-------|-------|--------|
| Data | 2026-06-22 | |
| URL | `/dashboard` autenticado | |
| Rede | Fast 3G / 4G / WiFi | |
| Build | pre-S0 | post-S0 |

## Core Web Vitals

| Métrica | Meta | Antes | Depois | Δ |
|---------|------|-------|--------|---|
| FCP (ms) | < 1000 | _medir_ | _medir_ | |
| LCP (ms) | < 1500 | _medir_ | _medir_ | |
| TTI (ms) | < 2000 | _medir_ | _medir_ | |
| TBT (ms) | baixo | _medir_ | _medir_ | |
| CLS | < 0.1 | _medir_ | _medir_ | |

## Bundle (build analyze)

| Chunk | Antes (gzip) | Depois (gzip) |
|-------|--------------|---------------|
| entry + vendors | ~338 KB | ~338 KB (sem mudança esperada) |
| AppLayout | 68 KB | 68 KB (+~0.5 KB context) |

## Network (primeiros 5s após layout)

| Request | Antes (count) | Depois (count) |
|---------|---------------|----------------|
| `attendance-counts` | 2 | **1** |
| `listInstances` (unread path) | 2 | **1** |
| Prefetch dashboard (idle) | ~1.5s fixo | idle callback |

## Percepção qualitativa

| Critério | Antes | Depois |
|----------|-------|--------|
| Tela branca no login→dashboard | Spinner full screen | Shell skeleton no layout |
| Navegação entre módulos | _anotar_ | _anotar_ |

## Long tasks (>200ms)

| Página | Antes (# tasks >200ms) | Depois |
|--------|------------------------|--------|
| Dashboard mount | _profiler_ | |
| Leads mount | _profiler_ | |
| Chat mount | _profiler_ | |

## Comandos úteis

```bash
npm run analyze
npx lighthouse https://localhost:8080/dashboard --view
```

Chrome DevTools → Performance → gravar 6s após hard reload.

## Critérios de aceite S0

| Critério | Status |
|----------|--------|
| duplicate_requests (unread) | ✅ Corrigido |
| white_screen (layout gap) | ✅ Mitigado |
| FCP < 1s | ⏳ Medir |
| TTI < 2s | ⏳ Medir |
| long_tasks < 200ms | ⏳ Medir |
| duplicate_sockets | ⏳ Pendente |
| memory_leaks | ⏳ Pendente |
