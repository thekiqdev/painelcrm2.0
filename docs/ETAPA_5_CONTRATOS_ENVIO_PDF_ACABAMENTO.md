# Etapa 5 — Contratos: envio operacional, PDF, evidências e acabamento

Este documento consolida o que foi entregue na **Etapa 5** (fechamento do módulo em nível de produto), em continuidade às Etapas 1–4 (modelos, snapshot, link público de visualização, assinatura pública).

## Fluxo final ponta a ponta (resumo)

1. **Rascunho e envio** — inalterado nas etapas anteriores: o documento é congelado (`content_snapshot_html`) antes da assinatura.
2. **Convite por signatário** — na ficha do contrato, aba **Assinaturas**, o operador **emite** o convite («Gerar e copiar»), **copia o link**, **abre** o link, **reenvia** o mesmo convite via texto de lembrete (sem criar novo token), **regenera** (invalida o anterior) ou **revoga**.
3. **Tokens no browser** — após gerar um convite, o token é guardado em `sessionStorage` (chave `crm_contract_sig_token:<contractId>:<signerId>`) para permitir copiar link e montar mensagens com o URL completo na mesma sessão (outro browser/dispositivo precisa de novo «Gerar e copiar» ou operação equivalente).
4. **Visualização pública** — continua separada (Etapa 3); não substitui assinatura.
5. **Conclusão** — quando todos os signatários assinaram, o painel destaca o estado **contrato assinado por todas as partes**, com ações claras: PDF, evidências JSON, link de visualização (se aplicável), texto de conclusão.
6. **PDF e evidências** — disponíveis para utilizadores com permissão de ver contratos; ver secções abaixo.

## Envio e reenvio (operacional)

**Não** foi introduzida uma nova engine de e-mail/WhatsApp. O envio é **manual** com apoio do sistema:

| Ação | Comportamento |
|------|----------------|
| **Copiar link** | Copia o URL de assinatura quando o token foi obtido nesta sessão (ou reutilizado do `sessionStorage`). |
| **Lembrete** | Abre modal com texto de lembrete; **reutiliza o convite ativo** — o link não muda até **Regenerar** ou **Revogar**. |
| **Texto convite** / **Texto view** | Modais com mensagens prontas (convite inicial ou referência ao link só de leitura). |
| **Gerar e copiar** | **Emitir** o primeiro convite quando não existe ativo; copia o URL. |
| **Regenerar** | Invalida o convite anterior e cria um novo (novo token). |
| **Revogar** | Torna o convite atual inutilizável. |

**Integrações reais de envio:** permanecem as do resto do produto (canais externos ao módulo de contratos). Evolução futura: integrar API de e-mail transacional ou WhatsApp Business a partir destes textos.

## Templates de mensagem

Ficheiro: `src/utils/contractMessagingTemplates.ts`.

- **Convite inicial** — `buildInviteMessage`
- **Lembrete** — `buildReminderMessage` (mesmo convite ativo)
- **Conclusão** — `buildCompletionMessage`
- **Só visualização** — `buildViewOnlyMessage`

Placeholders resolvidos no cliente: nome do signatário, título e número do contrato, organização (`company_name` do utilizador autenticado), estado legível, links de assinatura e de visualização quando disponíveis.

## Painel dos signatários

Em **ContractDetails** → aba **Assinaturas**:

- Coluna **Assinatura** — pendente vs assinado.
- Coluna **Convite** — estado derivado do último convite no servidor: sem convite, ativo, expirado, revogado, utilizado (consumido).
- Coluna **Evid. mín.** — após assinatura, mostra IP, user-agent resumido, método e versão de aceite quando existirem em `signature_data`.
- **Ações operacionais** — botões alinhados às regras de produto (emitir, copiar link, lembrete, textos, regenerar, revogar).

## Geração do PDF

- **Endpoint:** `GET /api/contracts/:id/pdf`
- **Implementação:** `packages/backend/src/services/contractPdfService.ts` (PDFKit).
- **Fonte de verdade:** apenas `content_snapshot_html` (documento congelado), não o template vivo.
- **Conteúdo mínimo:** título, número, texto do corpo (HTML simplificado para texto), identificação dos signatários e datas de assinatura, com dados de evidência quando presentes em `signature_data`.
- **Frontend:** `contractsService.downloadContractPdf` — download via `fetch` com Bearer; disponível no menu **Ações** e no banner pós-assinatura quando existe snapshot.

## Evidências — consulta e exportação

- **Endpoint:** `GET /api/contracts/:id/evidence-summary`
- **Implementação:** `packages/backend/src/services/contractEvidenceSummaryService.ts`
- **Por signatário assinado:** nome confirmado (quando gravado), data/hora, IP, user agent, método, versão do aceite — extraídos de `signature_data`.
- **Painel:** diálogo com JSON formatado, **Copiar JSON** e **Exportar .json** (ficheiro `evidencias-contrato-<número>.json`).

Não constitui dossiê jurídico completo; serve **auditoria operacional** e arquivo básico.

## Contrato concluído — UX

Quando **todos** os signatários têm `signed_at`:

- **Banner verde** com ações: visualização pública (se elegível), **Baixar PDF**, **Evidências (JSON)**, **Texto de conclusão**.
- **Histórico resumido** — até 5 eventos relevantes da timeline (`PUBLIC_SIGNATURE_COMPLETED`, `SIGNED`, `SIGNATURE_INVITE_ISSUED`).
- Ações que deixam de fazer sentido por linha (convites para quem já assinou) mostram mensagem neutra.

## Riscos remanescentes

- **Token só na sessão local** — sem «copiar link» noutro equipamento sem nova emissão ou sem aceder ao mesmo `sessionStorage`.
- **PDF** — layout simples (texto a partir de HTML); não replica fidelidade tipográfica de um DOCX.
- **Envio automático** — não incluído; depende de processos manuais ou futuras integrações.
- **Nome do cliente** nos templates — campo não ligado ao contrato neste ecrã; placeholder de cliente fica vazio até existir ligação a dados do cliente.

## Limitações atuais do MVP final

- Mensagens não são persistidas como modelo editável na base de dados.
- Não há fila de reenvios nem registo de «último envio» por canal.
- Evidências exportadas em JSON; pacote ZIP com PDF + JSON é evolução opcional.

---

## Checklist final

- [x] Envio/reenvio operacional funcionando (copiar link, lembrete com mesmo convite, modais de texto)
- [x] Regras de convite claras no painel (texto de ajuda + botões)
- [x] Status dos signatários visível de forma clara (assinatura + estado do convite + evidências mínimas)
- [x] PDF gerado a partir do snapshot (`GET /api/contracts/:id/pdf`)
- [x] Evidências mínimas consultáveis/exportáveis (`evidence-summary` + painel)
- [x] Contrato concluído possui UX coerente de pós-assinatura (banner + ações)
- [x] Módulo de contratos pode ser considerado **habilitável** no PainelCRM para uso operacional com as limitações acima
