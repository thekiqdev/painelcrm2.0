# Propostas — ajuste: status no create (enviada vs rascunho) e toasts no frontend

## Causa raiz de «Criar proposta» gerar rascunho

Em `NewProposal.tsx`, o payload unificado usava sempre `status: "draft"` e `sent_date: null` nos dois botões. Não havia distinção entre o CTA principal e **Salvar como rascunho**.

## Correção: dois comportamentos no create

| Ação | `status` (API / BD) | `sent_date` |
|------|---------------------|-------------|
| **Criar proposta** (primário) | `sent` | Data de hoje (`yyyy-MM-dd` no frontend; no backend, se vier `sent` sem data, preenche com a data UTC do servidor) |
| **Salvar como rascunho** | `draft` | `null` |

- Helper `buildCreatePayload(mode: "draft" | "sent")` centraliza o payload.
- Mensagem de sucesso do fluxo principal: «Proposta enviada. Link do cliente já está disponível.»
- Texto introdutório da página atualizado para refletir a regra.

### Backend

- Em `createProposal`, após o parse Zod, `sentDateForInsert`: se `status === 'sent'` e `sent_date` ausente ou vazio, usa `new Date().toISOString().slice(0, 10)` (compatível com clientes antigos ou chamadas diretas à API).

### Frontend service

- `createProposal` em `proposals.ts` passou a usar `??` em vez de `||` para `status` e `sent_date`, evitando que valores válidos sejam descartados por engano.

## Notificações no frontend

### Problema

O componente **Sonner** (`Toaster`) **não estava montado** na árvore do `App.tsx`. Chamadas a `toast.*` em qualquer página não tinham container visível.

### Correção

- Import de `Toaster` de `@/components/ui/sonner` e renderização dentro de `BrowserRouter` (final da árvore do router), em `App.tsx`.

### Duração (~3 segundos)

- Em `components/ui/sonner.tsx`, o `Sonner` recebe **`duration={3000}`** (padrão global para toasts).
- **Decisão:** ajuste **global** no wrapper do Sonner, coerente com o padrão único do produto; toasts individuais ainda podem sobrescrever com `{ duration: n }` se necessário no futuro.

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/NewProposal.tsx` | `buildCreatePayload("sent" \| "draft")`, `format` de `date-fns`, textos. |
| `src/App.tsx` | Montagem do `<Toaster />`. |
| `src/components/ui/sonner.tsx` | `duration={3000}`. |
| `src/services/proposals.ts` | `??` para `status` / `sent_date`. |
| `packages/backend/src/controllers/proposalsController.ts` | `sentDateForInsert` quando `status === 'sent'`. |

## Riscos remanescentes

- **Fuso:** `sent_date` no backend usa UTC (`toISOString().slice(0,10)`); o frontend envia data local. Em geral alinhado ao uso atual do CRM.
- Toasts muito longos ou críticos podem precisar de `duration` maior em chamadas pontuais (ex.: erro com muito texto).

## Checklist

- [x] **Criar proposta** cria com status enviado (`sent`)
- [x] **Salvar como rascunho** cria com rascunho (`draft`)
- [x] Fluxo principal abre o detalhe; link público automático inalterado na arquitetura existente
- [x] Toasts voltam a aparecer (`Toaster` montado)
- [x] Duração padrão ~3 s (`3000` ms)
- [x] Conversão / `proposal_id` / aceite público não foram alterados neste pacote além do create
