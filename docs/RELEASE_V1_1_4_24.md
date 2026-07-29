# Atualização da Plataforma — v1.1.4.24

## Resumo

Esta versão traz duas novidades de alto impacto no dia a dia:

1. **Débito automático via PIX** nas cobranças e assinaturas dos **seus clientes** (CRM) — o cliente autoriza uma vez e as próximas cobranças podem ser debitadas automaticamente, com o PainelCRM no controlo do ciclo.
2. **Chat mais rápido e estável** — abrir o chat, atualizar a página (F5) e receber mensagens em tempo real com menos carga, menos duplicados e lista de conversas mais previsível.

---

## Débito automático via PIX (cobranças dos seus clientes)

### O que é

Funcionalidade alinhada ao Pix Automático do Asaas (BACEN), pensada para **faturas e assinaturas CRM** (`customer_invoices` / assinaturas de cliente), **independente** do Pix Automático do plano SaaS da plataforma.

Nome na interface: **«Débito automático via PIX»**.

### O que o seu time ganha

- Na **criação** da cobrança ou assinatura, pode ligar o débito automático (quando a conta Asaas do tenant estiver elegível e a flag da plataforma estiver ativa).
- No **link de pagamento** (`/pay`), o cliente vê o switch, autoriza ao pagar o primeiro PIX (QR composto) e pode desligar quando quiser (opt-out persistente).
- Em **assinaturas já existentes**, no detalhe da assinatura (Configurações), o operador pode **ligar ou desligar** o débito automático — assinaturas antigas começam **desligadas** (sem surpresa).
- Status visível na assinatura (ativo / pendente / desligado).
- Ciclos seguintes, com autorização ativa e na janela correta, podem usar cobrança vinculada à autorização (sem depender só de PIX avulso manual).

### Como o cliente final percebe

1. Recebe o link da cobrança.
2. Com débito automático ligado, autoriza no app do banco ao pagar o PIX.
3. Próximas faturas daquela assinatura podem ser debitadas automaticamente (conforme regras do Asaas e do ciclo no PainelCRM).
4. Pode desligar no próprio link de pagamento; a preferência fica guardada na assinatura.

### Pré-requisitos (conta / ops)

- Gateway **Asaas** do tenant com **Pix Automático elegível**.
- Flag de plataforma `crm.pix_automatic` **ligada** (Super Admin / ops).
- Webhook Asaas do tenant com eventos `PAYMENT_*` **e** `PIX_AUTOMATIC_*` (recriar webhook se a conta já existia antes desta release).
- PIX entre os métodos permitidos da cobrança; cliente com CPF/CNPJ.

### O que não muda

- Continua a ser o **seu** fluxo de faturas/assinaturas CRM (não é assinatura nativa Asaas).
- Flag OFF = comportamento legado (só PIX avulso / meios habituais).
- Pix Automático do **plano PainelCRM** (billing SaaS) permanece produto separado.

### Documentação técnica / ops

- `docs/architecture/commercial/crm-pix-automatic/CRM_PIX_AUTOMATIC_OPS_RUNBOOK.md`
- `docs/architecture/commercial/crm-pix-automatic/SPRINTS_CRM_PIX_AUTOMATIC.md`
- Closeouts CRM0–CRM7 na mesma pasta

---

## Chat — otimização e estabilidade

### Experiência para o utilizador

- **Abrir o chat / F5 mais leve**: a lista de conversas pode aparecer de imediato a partir do cache local e só reconciliar com o servidor quando necessário — menos “tela a carregar” e menos rajadas de pedidos.
- **Menos pressão na inbox**: páginas com tamanho adequado e “Carregar mais”, sem refetches excessivos em produção.
- **Mensagens em tempo real mais limpas**: menos bolhas duplicadas e horários inconsistentes ao receber WhatsApp ao vivo.
- **Ordem da lista estável**: a inbox deixa de “embaralhar” e depois rearranjar após eventos em tempo real.
- **Shell mais eficiente**: badges, tags e pré-carregamento de mensagens com limites e deduplicação de pedidos (melhor em contas com muitos operadores / muitas conversas).

### Em linguagem simples

| Antes (sintomas comuns) | Agora |
|-------------------------|--------|
| F5 no chat disparava muitos pedidos e demorava a pintar | Paint local primeiro; sync inteligente depois |
| Inbox pesada ao abrir | Menos carga na lista; carregar mais sob demanda |
| Mensagem duplicada ou `--:--` no horário | Dedupe e normalização do id/data da mensagem |
| Lista saltava de ordem | Ordenação consistente da fonte de verdade da inbox |

### Fundação (para referência interna)

Entregas TF5–TF8 (thread surface / Domain Store): dedupe WS, pressão da inbox, warm store + TTL, escala do shell no F5.  
Resumo técnico: `docs/architecture/sprints/SUMMARY_TF7_TF8_WARM_SHELL_SCALE.md`

---

## Impacto para o cliente (tenant)

| Área | Benefício |
|------|-----------|
| Cobranças / assinaturas | Menos cobrança manual repetida; autorização PIX uma vez; controlo no painel e no link do cliente |
| Operação financeira | Status claro na assinatura; legado não “liga sozinho” |
| Atendimento (chat) | Chat mais rápido ao abrir/atualizar; conversas e mensagens mais confiáveis em tempo real |

---

## Migrações relevantes (Pix Automático CRM)

| Script | Tema |
|--------|------|
| `303_crm_pix_automatic_platform_flag.sql` | Flag plataforma `crm.pix_automatic` (default OFF) |
| `304_crm_pix_automatic_customer_index.sql` | Índice / suporte auth em assinaturas `customer` |
| `305_crm_pix_automatic_requested_status.sql` | CHECK: status `requested` (CRM8 intenção adiada) |

Aplicar via pipeline habitual de migração do backend após deploy.

---

## Checklist rápido pós-deploy (piloto)

### Pix Automático CRM

1. Flag `crm.pix_automatic` ON (só em contas piloto, se aplicável).
2. Recriar webhook Asaas do tenant (eventos Pix Automático).
3. Smoke: criar/ligar débito automático → cliente paga QR → fatura CRM **Paga** e autorização **ativa**.
4. Assinatura antiga sem Pix Auto: switch permanece **desligado** até o operador ligar.
5. Ligar sem fatura aberta (CRM8): pedido fica **«Débito PIX pedido»**; auth Asaas na próxima fatura do ciclo.

### Chat

1. Abrir `/chat`, F5: lista aparece depressa; sem storm óbvio de rede.
2. Receber uma mensagem WhatsApp: **uma** bolha, horário coerente.
3. Ordem da inbox estável ao chegar mensagem nova.

---

## Notas de comunicação (texto sugerido para clientes)

> **Novidade — Débito automático via PIX**  
> Agora pode oferecer aos seus clientes a autorização de PIX para cobranças recorrentes: eles autorizam no primeiro pagamento e as próximas faturas da assinatura podem ser debitadas automaticamente. Controlo total no PainelCRM (criação, assinatura e link de pagamento). Disponível para contas Asaas elegíveis — fale connosco para ativar.
>
> **Melhoria — Chat mais rápido**  
> Otimizámos o carregamento e o tempo real do chat: abrir ou atualizar a página fica mais leve, com menos duplicados e lista de conversas mais estável.

---

## Branch / versão de referência

- Branch típica: `deploy-v1.1.4.24-crm-pix-automatic`
- Inclui CRM Pix Automático (CRM0–CRM7) e as otimizações de chat TF5–TF8 já promovidas na linha de produto.

---

## Documentação relacionada

| Tema | Doc |
|------|-----|
| Runbook Pix Auto CRM | `docs/architecture/commercial/crm-pix-automatic/CRM_PIX_AUTOMATIC_OPS_RUNBOOK.md` |
| Sprints Pix Auto CRM | `docs/architecture/commercial/crm-pix-automatic/SPRINTS_CRM_PIX_AUTOMATIC.md` |
| Chat warm + shell | `docs/architecture/sprints/SUMMARY_TF7_TF8_WARM_SHELL_SCALE.md` |
| Releases anteriores | `docs/RELEASE_V1_1_4_22.md` (e anteriores na pasta `docs/`) |
