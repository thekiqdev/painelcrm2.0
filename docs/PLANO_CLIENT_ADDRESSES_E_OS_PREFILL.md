# Plano — Endereços do cliente + ViaCEP + prefill na OS

**Data:** 2026-10-29  
**Contexto:** pós S0–S9 (OS); ADR OS D11 deixou endereço estruturado em `clients` fora da v1  
**Objetivo:** cadastrar 1+ endereços no cliente (ViaCEP), autopreencher na OS e polir o formulário de criação.

---

## 1. Pedido

| # | Pedido |
|---|--------|
| 1 | Clientes → após **Cadastro completo**: seção **Endereços** (cadastrar; permitir **mais de um**) + **ViaCEP** |
| 2a | Nova OS: se o cliente tiver endereço, **auto preencher** execução |
| 2b | Preenchimento manual: **CEP em 1º** + ViaCEP |
| 2c | Ajustar **espaçamento lateral** na criação da OS |

---

## 2. Estado atual (gap)

| Área | Hoje |
|------|------|
| `clients` | Sem tabela/campos de endereço estruturado (só dados cadastrais básicos) |
| OS `execution_address` | JSON livre: `line`, `city_uf`, `postal_code` — CEP **depois** da rua |
| ViaCEP | **Não existe** no repo (helper novo, compartilhado) |
| Prefill OS | Só snapshot do cliente (nome/doc etc.); endereço de execução manual |
| Layout Nova OS | `max-w-4xl` + `px-3` (mais estreito que o detalhe S8) |

---

## 3. Decisões propostas (travar no kickoff)

| ID | Decisão | Valor sugerido |
|----|---------|----------------|
| A1 | Modelo | Tabela `client_addresses` (N por cliente), **não** um único JSON em `clients` |
| A2 | Campos | `label` (ex. Principal / Obra), `postal_code`, `street`, `number`, `complement`, `neighborhood`, `city`, `state`, `is_default` |
| A3 | ViaCEP | Client-side `viacep.com.br/ws/{cep}/json/` (debounce 8 dígitos); fallback manual se falhar |
| A4 | OS com 1 endereço | Prefill automático do `is_default` (ou único) |
| A5 | OS com N endereços | Select “Endereço do cliente” + opção “Outro (manual)” |
| A6 | Snapshot | Continuar gravando cópia em `execution_address` (OS não quebra se endereço do cliente mudar) |

---

## 4. Escopo por sprint

### Recomendação oficial: **2 sprints (S10–S11)**

Escopo mistura schema/API + UX cliente + UX OS. Dois sprints curtos (~2–3 dias cada) isolam risco do CRUD de endereços vs. integração OS.

| Sprint | Nome | Dias | Entregas | Aceite |
|--------|------|------|----------|--------|
| **S10** ✅ | Endereços no cliente + ViaCEP | 2–3 | Migration `client_addresses`; API CRUD tenant-scoped; seção Endereços no perfil (após cadastro); formulário CEP-first + ViaCEP; marcar padrão | ✅ — [`clients/SPRINT_CLIENT_ADDRESSES_S10_NOTES.md`](./clients/SPRINT_CLIENT_ADDRESSES_S10_NOTES.md) |
| **S11** ✅ | Prefill OS + layout | 2–3 | Select/prefill na `ServiceOrderForm`; CEP em 1º no manual + ViaCEP; espaçamento `max-w-7xl` / padding alinhado ao detalhe | ✅ — [`clients/SPRINT_CLIENT_ADDRESSES_S11_NOTES.md`](./clients/SPRINT_CLIENT_ADDRESSES_S11_NOTES.md) |

```
S10 Client addresses + ViaCEP ✅     S11 OS prefill + spacing ✅
```

### Alternativa: **1 sprint (S10 all-in)**

Só se 1 fullstack focado ~1 semana e aceitar PR maior. Risco: ViaCEP + multi-endereço + OS atrasam juntos.

| Opção | Sprints | Quando |
|-------|---------|--------|
| **A (oficial)** | **2** | Entrega incremental, review limpo |
| **B** | **1** | Urgência e escopo fechado sem extras |

---

## 5. Ordem de execução

**S10**
1. Migration + índices (`tenant_id`, `client_id`, unique default parcial)  
2. API `GET/POST/PATCH/DELETE /api/clients/:id/addresses`  
3. Helper `lookupViaCep(cep)` (FE; opcional proxy BE se CORS/rate limit)  
4. UI seção Endereços no `ClientProfile` / Resumo  
5. Testes unitários de normalização CEP + isolamento tenant  

**S11**
1. Ao escolher cliente na OS: carregar addresses → prefill / select  
2. Reordenar campos: CEP → (ViaCEP) → rua/nº/compl/bairro → cidade/UF  
3. Espaçamento criação (`NewServiceOrder` + `ServiceOrderForm`)  
4. Smoke: cliente sem endereço; 1 endereço; N endereços; CEP inválido  

---

## 6. Fora deste plano

- Geocoding / mapa  
- Validação fiscal de endereço (Receita)  
- Migrar leads/contratos para a mesma tabela (pode reusar helper ViaCEP depois)  
- Obrigar endereço para criar OS  

---

## 7. Status

1. ✅ **`ok sprint 10`** — endereços no cliente + ViaCEP  
2. ✅ **`ok sprint 11`** — prefill OS + CEP-first + espaçamento  

Plano **S10–S11 concluído**.

---

*Notas: `docs/clients/SPRINT_CLIENT_ADDRESSES_S10_NOTES.md` / `S11`.*
