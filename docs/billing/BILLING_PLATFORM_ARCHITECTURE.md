# Billing Platform — Architecture

**Version:** `v4_platform_foundation`  
**Date:** 2026-06-27

## Vision

The Billing Platform wraps **Billing Engine 3.0 GA** as one internal component. Operational renewal (Worker → Engine → Execution) is unchanged.

```
Billing Platform
├── Billing Engine          (GA — unchanged)
├── Billing Execution       (GA — unchanged)
├── Billing Plans           (GA — existing modules)
├── Billing Analytics       (foundation)
├── Billing Intelligence    (foundation)
├── Billing Forecast        (foundation)
├── Billing Recovery        (foundation)
├── Billing Automation      (foundation)
├── Billing Reports         (foundation)
├── Billing API             (foundation)
├── Billing Events          (foundation)
└── Billing Observability   (GA — bridge, no duplication)
```

## Package

`packages/backend/src/billingPlatform/`

## Principles

1. **Engine stability** — no changes to `billingEngine/`, `billingExecution/`, worker, gateway, scheduler.
2. **Contracts first** — analytics, intelligence, forecast, recovery, automation ship as types + stubs.
3. **Event bus** — publish/subscribe in-memory; no mandatory consumers.
4. **Observability** — `shared/observabilityBridge.ts` delegates to `billingObservability/`.

## HTTP API

Base: `/api/billing-platform` (authenticated tenant)

| Route | Purpose |
|-------|---------|
| `GET /` | Platform manifest |
| `GET /analytics` | Analytics snapshot (stub) |
| `GET /reports` | Report contracts |
| `GET /forecast` | Forecast horizons (stub) |
| `GET /recovery` | Recovery architecture |
| `GET /events` | Event types + recent bus events |
| `GET /intelligence` | Intelligence profile (stub) |
| `GET /automation` | Reference workflow contract |
| `GET /observability` | Bridge to existing observability |
