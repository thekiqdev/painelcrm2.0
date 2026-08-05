# 08 — Compliance Meta (janela 24h, categorias, opt-in)

**Pacote:** [whatsapp-official-sa-dispatch](./README.md)  
**Data:** 2026-08-03  
**Status:** a preencher (investigação)  
**Depende de:** [01](./01_ESCOPO_PRODUTO_E_CANAIS.md), [04](./04_TEMPLATES_EVENT_KEY_HSM.md), [04B](./04B_CICLO_VIDA_MODELOS.md), [05](./05_OPS_KANBAN_DISPARO.md)  
**Bloqueia:** go-live de qualquer disparo oficial

---

## 1. Objetivo

Documentar as **regras da API oficial** que o produto precisa respeitar e mapear cada caso de uso (kanban + mensagens padrão) para a mecânica correta: template HSM vs sessão, categoria, e consentimento.

Alinhado à **Fase Modelos** ([04B](./04B_CICLO_VIDA_MODELOS.md)): fora da janela 24h (e na política v1 recomendada para motors) **só HSM APPROVED vinculado**.

---

## 2. Regras Meta (baseline a validar com política atual da conta)

| Regra | Implicação no PainelCRM |
|-------|-------------------------|
| Fora da janela de 24h após mensagem do usuário, outbound livre é restrito | Transacional e marketing → **template aprovado** |
| Dentro da janela 24h | Texto livre / sessão possível (chat, follow-up) |
| Categorias (UTILITY, AUTHENTICATION, MARKETING, …) | Reset senha / cobrança ≠ recovery marketing do kanban |
| Templates precisam APPROVED | Editor de texto livre do motor **não** substitui HSM |
| Opt-out / quality rating | Broadcasts e kanban em massa afetam saúde do número |
| Rate limits | Já há knobs em campanhas (`WHATSAPP_OFFICIAL_CAMPAIGN_*`) |

Fonte técnica interna: client Graph + campaign worker; validar docs Meta vigentes na data da implantação.

---

## 3. Classificação proposta por caso (preencher)

| Caso | Tipo | Mecânica Meta | Categoria HSM | Opt-in necessário? |
|------|------|---------------|---------------|-------------------|
| Password reset código | Auth / utility | Template | AUTHENTICATION ou UTILITY | Conta existente |
| Cobrança criada / overdue / pago | Utility | Template | UTILITY | Relação comercial |
| Conta criada / boas-vindas | Utility? | Template | | Cadastro |
| Trial ending | Utility / marketing? | Template | | Avaliar copy |
| Checkout abandonado (kanban) | Marketing frequentemente | Template MARKETING | MARKETING | Consentimento lead |
| “Novo lead” nurture | Marketing | Template | MARKETING | Sim |
| Follow-up humano no chat oficial | Session | Texto se 24h aberta | — | Contexto |
| Campanha broadcast | Marketing | Template | MARKETING | Sim |

---

## 4. Lacunas atuais do sistema

1. Motores enviam **texto livre** via UazAPI — não modelam janela 24h Meta.
2. Não há store claro de “última inbound do contacto no número oficial” para decidir session vs template (existe ingest oficial → `chat_conversations` provider `whatsapp_official` — investigar se serve).
3. Kanban / acquisition leads: onde fica flag de consentimento WhatsApp marketing?
4. Anúncios e campanhas: políticas de opt-out são as mesmas?
5. PIX button UazAPI não é o mesmo contrato que botões de template Meta.

---

## 5. Perguntas a responder

1. Qual categoria Meta a WABA usa hoje para templates já aprovados?
2. Há processo interno de submissão/aprovação de novos HSM (owner)?
3. Leads de aquisição: checkbox / termos com consentimento de WhatsApp?
4. Precisamos de stop list / opt-out global por E.164?
5. Qualidade do número: quem monitora (Meta Business Suite + alertas internos)?
6. Ambientes: sandbox permite testar AUTHENTICATION/UTILITY como produção?

---

## 6. Política de produto sugerida (rascunho — validar)

1. **Tudo que for motor `platform.*` na v1 oficial** → somente HSM APPROVED **e vinculado** (nunca texto livre “à força”) — [04B](./04B_CICLO_VIDA_MODELOS.md).
2. **Kanban automations** classificadas como marketing → HSM MARKETING vinculado + opt-in; se não houver opt-in ou vínculo, não enviar.
3. **Chat 1:1** no hub oficial → session text quando houver janela; senão sugerir template.
4. **UazAPI** permanece para fluxos não migrados; não misturar o mesmo copy assumindo as mesmas regras.

---

## 7. Checklist de leitura / evidências

- [ ] Templates atuais na WABA (sync DB + Business Manager)
- [ ] `whatsappOfficialChatIngestService.ts` / conversas oficiais
- [ ] Fluxo acquisition signup — termos e campos de contacto
- [ ] Campaign audit (`whatsappOfficialCampaignAudit.ts`)
- [ ] Docs password reset
- [ ] Política legal da plataforma (privacy / termos) — links em `docs` legais se existirem

---

## 8. Decisão (preencher)

| Campo | Valor |
|-------|-------|
| Política session vs template | |
| Kanban = MARKETING? | |
| Opt-in lead: campo/fonte | |
| Owner compliance | |
| Data | |

**Próximo:** [09_OBSERVABILIDADE_ROLLBACK.md](./09_OBSERVABILIDADE_ROLLBACK.md)
