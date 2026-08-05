# 04B — Fase Modelos: sync → enviar → vincular (obrigatória)

**Pacote:** [whatsapp-official-sa-dispatch](./README.md)  
**Data:** 2026-08-03  
**Status:** requisito de produto (pré-disparo)  
**Depende de:** [02](./02_CONTA_META_E_REMETENTE.md), inventário em [04](./04_TEMPLATES_EVENT_KEY_HSM.md), escopo [01](./01_ESCOPO_PRODUTO_E_CANAIS.md) (D1)  
**Bloqueia:** qualquer envio oficial do motor, kanban e mensagens padrão  
**Companheiro:** [04C_BUILDER_ANUNCIOS_CAPACIDADES_META.md](./04C_BUILDER_ANUNCIOS_CAPACIDADES_META.md) — wizard anúncios, builder (botões/menus), edição Meta

---

## 1. Regra de ouro (cliente / produto)

> **Na API oficial do WhatsApp não enviamos texto solto.**  
> Só disparamos se existir **modelo Meta aprovado (APPROVED)** e **vinculado** ao evento/modelo interno do PainelCRM (com mapa de variáveis).

Sem este ciclo, ligar a conta Meta **não** faz o sistema mandar “pagamento criado”, “senha”, “atrasado”, etc.

**D1:** Super Admin only; **sem fallback UazAPI** nos fluxos oficiais; catálogo `platform.*` completo + Ops + campanhas/anúncios.

---

## 2. Ciclo de vida (visão prática)

```
[Mensagens / eventos do sistema]
        │
        ▼
┌───────────────────────────────┐
│ 1. Enviar modelo para a Meta  │  criar HSM a partir do copy interno
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ 2. Sincronizar da Meta        │  status PENDING → APPROVED / REJECTED
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ 3. Vincular ao modelo interno │  event_key / coluna kanban + param map
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ 4. Disparar (só se APPROVED)  │  motor / kanban / campanha / anúncio
└───────────────────────────────┘
```

Anúncios oficiais: o step “Enviar” só libera após APPROVED — detalhe do wizard em [04C §3](./04C_BUILDER_ANUNCIOS_CAPACIDADES_META.md).

Ordem operacional recomendada no dia a dia:

1. **Sincronizar** o que já existe na WABA (Facebook).  
2. **Enviar** os modelos que ainda faltam (criar do PainelCRM → Meta).  
3. **Vincular** cada mensagem automática ao modelo aprovado.  
4. Só então ativar o canal oficial no motor/kanban.

---

## 3. O que já existe vs o que falta

| Passo | Status | Onde hoje |
|-------|--------|-----------|
| Sincronizar modelos do Facebook | **Já existe** | `syncTemplatesFromMeta` + UI “Sincronizar modelos” (`WhatsappOfficialTemplatesPage` / rota modelos) · `POST /api/superadmin/whatsapp-official/templates/sync` |
| Enviar / criar modelos na Meta | **Já existe** | `createTemplateOnMeta` + UI “+ Novo modelo” · `POST .../templates` |
| Listar + ver status | **Já existe** | `listTemplatesDb` · tabela `whatsapp_official_templates` |
| Usar modelo em **campanhas** | **Já existe** | picker de template APPROVED em campanhas Meta |
| **Vincular** modelo Meta ↔ evento/modelo do sistema | **Não existe** | Gap crítico — ver [04](./04_TEMPLATES_EVENT_KEY_HSM.md) §5 |
| Recusar envio sem vínculo APPROVED | **Não existe** | Motors ainda mandam texto livre via UazAPI |
| Wizard anúncio → Meta → gate Enviar | **Não existe** | [04C](./04C_BUILDER_ANUNCIOS_CAPACIDADES_META.md) |
| Builder completo (menus, flows, etc.) | **Parcial** | QR/URL/PHONE + header/body hoje; inventário em 04C |
| Editar modelo e atualizar na Meta | **Não existe** | Só create + sync; 04C §5 |

---

## 4. Fase Modelos no plano (linguagem cliente)

Tratar como **Fase 0 / Fase Modelos** — pré-requisito de qualquer “disparo oficial”.

### 4.1 Biblioteca Meta no Super Admin (quase pronta)

- Conectar WABA / conta oficial ([02](./02_CONTA_META_E_REMETENTE.md)).
- Sincronizar modelos da Meta.
- Criar e submeter modelos novos; acompanhar PENDING → APPROVED / REJECTED.
- Superfície: `/superadmin/conexoes/whatsapp-oficial` (modelos).

### 4.2 Catálogo interno ↔ Meta (a construir)

Para cada mensagem do sistema, o operador:

1. Escolhe o **evento interno** (ex.: “Pagamento criado”, “Nova senha”, “Checkout abandonado”).
2. Escolhe o **modelo Meta APPROVED**.
3. Mapeia variáveis (`nome` → `{{1}}`, `valor` → `{{2}}`, link → botão URL).
4. Salva o **vínculo**.

**Sem vínculo = não envia pela API oficial.**

Escopos de vínculo a cobrir na v1 (**D1 fechado** — [01](./01_ESCOPO_PRODUTO_E_CANAIS.md)):

| Alvo interno | Exemplo | Ref |
|--------------|---------|-----|
| `event_key` plataforma (**todo** catálogo) | `platform.billing.charge.created`, password reset, trial, tickets… | [04](./04_TEMPLATES_EVENT_KEY_HSM.md) |
| Coluna / automação Ops Kanban | Checkout abandonado + demais | [05](./05_OPS_KANBAN_DISPARO.md) |
| Envio manual no card Ops | Template picker | [05](./05_OPS_KANBAN_DISPARO.md) |
| Anúncio oficial | HSM do anúncio / biblioteca | [04C](./04C_BUILDER_ANUNCIOS_CAPACIDADES_META.md) |
| Tenant CRM `invoice.*` | — | **Fora do D1** |

### 4.3 Depois da Fase Modelos

- Bridge do motor / kanban usa o **vínculo + params**, não o body texto livre do editor atual.
- Compliance: template-only fora da janela 24h ([08](./08_COMPLIANCE_META.md)).

---

## 5. UX mínima sugerida (produto)

| Ecrã | Ação |
|------|------|
| Hub WhatsApp Oficial → Modelos | Sync + criar + **editar** (04C) + lista com status |
| Platform Notifications (ou ecrã “Vínculos”) | Por `event_key`: escolher HSM + mapa de params + badge “Pronto para oficial” / “Sem vínculo” |
| Ops Kanban → settings da coluna | Escolher HSM vinculado |
| Ops Kanban → card | Envio **manual** com template APPROVED |
| Anúncios | Wizard oficial: submeter HSM → APPROVED → Enviar ([04C](./04C_BUILDER_ANUNCIOS_CAPACIDADES_META.md)) |
| Histórico / deliveries | Mostrar `template_name` + status Meta usado no envio |

Regra de UI: se o canal oficial estiver ON e o evento **não** tiver vínculo APPROVED → bloquear envio e mostrar CTA “Vincular modelo”.

---

## 6. Critérios de aceite da Fase Modelos

- [ ] Sync da WABA persiste modelos e status atualizados.
- [ ] Create na Meta grava linha local e permite re-sync até APPROVED.
- [ ] Existe persistência de vínculo (decisão em [04](./04_TEMPLATES_EVENT_KEY_HSM.md) §5 / D4 no ADR).
- [ ] Pelo menos **1** evento piloto vinculado e testado 1:1.
- [ ] Dispatcher/gateway **recusa** envio oficial sem vínculo APPROVED (fail explícito, não texto livre “à força”).
- [ ] Operador consegue ver, no SA, quais mensagens padrão estão prontas vs pendentes de modelo.

---

## 7. Bullets comerciais / alinhamento com o cliente

1. **Sincronizar** os modelos do Facebook.  
2. **Submeter** os modelos do PainelCRM para aprovação na Meta.  
3. **Vincular** cada mensagem automática ao modelo aprovado.  
4. Só então **ativar** o disparo oficial (motor + kanban).

---

## 8. Relação com os outros docs

| Doc | Papel |
|-----|--------|
| [04](./04_TEMPLATES_EVENT_KEY_HSM.md) | Inventário `event_key` + opções técnicas de binding + param map |
| Este 04B | Fase de produto obrigatória + ciclo operacional + gap sync/create vs vínculo |
| [04C](./04C_BUILDER_ANUNCIOS_CAPACIDADES_META.md) | Wizard anúncios, builder capacidades Meta, edição local↔Meta |
| [03](./03_BRIDGE_MOTOR_META.md) | Bridge só envia após vínculo |
| [05](./05_OPS_KANBAN_DISPARO.md) | Colunas + manual no card |
| [06](./06_SUPERFICIES_SUPER_ADMIN.md) | Onde fica a UI de vínculo / anúncios |
| [08](./08_COMPLIANCE_META.md) | Por que template-only |
| [11](./11_ADR_DECISOES.md) | D1 fechado; D4 + ordem: Modelos/04C **antes** do disparo em massa |

---

## 9. Decisão

| Campo | Valor |
|-------|-------|
| Fase Modelos é gate de go-live? | **sim** (D1) |
| UI de vínculo (onde) | hub modelos / platform-notifications / ecrã novo — *em aberto* |
| Kanban usa a mesma tabela de vínculos? | *em aberto* (recomendado: sim) |
| Sem fallback UazAPI? | **sim** (D1) |
| Owner produto desta fase | |
| Data | 2026-08-03 (alinhado D1) |

**Próximo:** [04C](./04C_BUILDER_ANUNCIOS_CAPACIDADES_META.md) → matriz [04](./04_TEMPLATES_EVENT_KEY_HSM.md) → [05](./05_OPS_KANBAN_DISPARO.md) · [11](./11_ADR_DECISOES.md)
