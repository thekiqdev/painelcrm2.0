# Contratos — aprimoramentos e-sign, busca global, menu de ações e links automáticos

Documento de implementação incremental (após Etapas 1–6). Não altera a arquitetura de snapshot, view pública, assinatura por signatário, PDF baseado em snapshot nem o modelo de tokens; apenas enriquece UX e captura e-sign.

## 1. Assinatura e-sign (desenho na página pública)

- **Frontend:** `src/components/contracts/SignaturePad.tsx` — canvas com eventos de ponteiro (toque e rato), limpar, limiar mínimo de “tinta” (~80 unidades internas) antes de considerar desenho válido.
- **Página pública:** `src/pages/PublicContractSign.tsx` — mantém nome confirmado e checkbox de aceite; exige desenho válido para submeter; envia `signature_image_base64` (PNG base64 **sem** prefixo `data:`) no POST.
- **Backend:** validação e gravação já definidas em `contractSignatureInviteService` / `publicContractSignatureController` (`signature_image_png_base64` em `signature_data`, método `public_invite_esign_v1`, versão de aceite, IP, user-agent).

## 2. Persistência da imagem

- A imagem é armazenada como **PNG em base64** no JSON `signature_data` do signatário (`signature_image_png_base64`), junto com `confirmed_name`, `signed_at`, evidências de rede e versão do aceite.
- Não há ficheiro separado no MVP: o payload permanece na linha do signatário (atenção ao tamanho em backups/exportações).

## 3. Preview no painel

- **Lista de signatários:** `src/pages/ContractDetails.tsx` — coluna **e-sign** com miniatura (`<img loading="lazy">`, data URL `data:image/png;base64,...`); clique ou menu **Ampliar assinatura** abre diálogo com imagem maior.
- Evidências textuais (IP, UA, método, versão) mantidas na coluna **Evid. mín.**

## 4. Busca global de clientes

- **Reutilização:** `ClientSearchCombobox` com `remoteSearch` (mesmo padrão que faturas, projetos, etc.), em `src/pages/NewContract.tsx`.
- Substitui o popover local com lista completa de clientes; pesquisa via API global de clientes (`GET /api/clients?q=...` com debounce no componente).

## 5. Ações operacionais no menu (⋮)

- Por linha de signatário: menu de overflow com **Gerar e copiar**, **Regenerar e copiar**, **Copiar link**, **Abrir link**, **Lembrete**, **Texto convite**, **Texto view**, **Revogar convite** (habilitação igual à lógica anterior).
- Signatário já assinado: **Ampliar assinatura** (se houver PNG) e **Texto view**; sem ações de convite.

## 6. Geração automática de links ao enviar

- **Backend:** `contractInviteBootstrapService` — ao passar de rascunho para `PENDING_SIGNATURE`, emite convites com `regenerate: false` por signatário; devolve `signature_invite_bootstrap` no PATCH quando aplicável (`contractsController`).
- **Frontend:** `NewContract` chama `persistSignatureInviteBootstrap` após o `updateContract` de envio e navega para detalhes com `state.signatureInviteBootstrap`; `ContractDetails` consome o estado uma vez, atualiza `sessionStorage` e tokens em memória, depois faz `replace` do state sem o bootstrap (evita reexecução e URL “suja”).
- **Tipos:** `ContractUpdateResult` / `ContractSignatureInviteBootstrapItem` em `src/services/contracts.ts`.

## 7. Evidências e PDF

- **Resumo:** `contractEvidenceSummaryService` — schema `contracts_evidence_summary_v3`; flag `signature_image_stored` e linha de resumo “Assinatura manuscrita (PNG) armazenada” **sem** incluir base64 em `summary_lines`.
- **PDF:** `contractPdfService` — inclui miniatura da assinatura na secção de signatários quando existe PNG válido.

## Riscos remanescentes

- **Tamanho do JSON** `signature_data` por signatário (PNG em base64).
- **Tokens `already_active`:** o backend não devolve o token claro por segurança; nesse caso o painel depende de **nova emissão** ou de token já guardado no browser.
- **POST público** exige imagem: integrações antigas que só enviassem aceite + nome deixam de funcionar (aceite esperado para MVP e-sign).

## Limitações

- Pré-visualização usa data URL no browser (memória proporcional ao tamanho da imagem).
- Área de desenho lógica 560×160 px (bitmap × DPR); exportação compacta.
- `sessionStorage` continua específico do browser/dispositivo.

---

## Refinamento (robustez e performance)

- **Armazenamento:** teto do PNG decodificado no backend reduzido (~520 KiB), com validação Zod alinhada (~720k caracteres base64). Comentários no serviço explicam o impacto em `signature_data`.
- **Cliente:** canvas com **DPR** (máx. 2,5), coordenadas lógicas 560×160, área responsiva (`width: 100%`, `max-width: 560px`); exportação usa **downscale** (largura máx. 440 px) antes do `toDataURL`, reduzindo payload e RAM.
- **Preview:** `decoding="async"`, `loading="lazy"` e dimensões explícitas na miniatura; o diálogo ampliado também usa `decoding="async"`.
- **PDF:** miniatura com `fit` ligeiramente menor; se o PNG decodificado exceder ~520 KiB (ex.: dados antigos), a imagem **não** é embutida e exibe-se nota para consultar o sistema — evita picos de memória no gerador.
- **`already_active`:** `summarizeSignatureInviteBootstrap` + toasts em `NewContract` e `ContractDetails` orientam «Regenerar e copiar» sem devolver token antigo.

---

## Checklist de aceite

- [ ] Assinatura desenhada funciona em celular e desktop  
- [ ] Assinatura vazia não é aceita  
- [ ] Assinatura fica salva com as evidências do signatário  
- [ ] Preview da assinatura aparece no painel  
- [ ] Busca de clientes usa o padrão global do sistema  
- [ ] Ações operacionais foram movidas para menu de 3 pontinhos  
- [ ] Links de assinatura são gerados automaticamente no fluxo de criação/envio  
- [ ] Acesso aos links ficou fácil no painel sem quebrar segurança  
