# Contratos — ajuste de tipografia e layout do PDF

## Causa raiz do texto “apertado”

1. **Corpo único em `doc.text()`** — Todo o snapshot era convertido para uma única string plana (`htmlToPlainText`) e desenhada de uma vez. O PDFKit aplica `lineGap` uniformemente, mas **não há espaço extra entre parágrafos/cláusulas** como na view HTML (margens de `<p>`, `margin-top` em headings, etc.).
2. **Perda de hierarquia** — Headings, listas e `blockquote` eram achatados para texto contínuo; o resultado parecia “texto despejado”, distante da folha A4 no browser (prose + `leading-[1.75]` + espaçamento por tag).
3. **Margens e corpo** — Margens fixas 48 pt eram aceitáveis, mas o bloco de corpo não diferenciava visualmente títulos internos do contrato do parágrafo normal.

## O que foi ajustado

- Novo módulo `contractPdfBodyLayout.ts`:
  - **`htmlToPdfBodyBlocks`**: percorre o HTML (após remover `script`/`style`) e extrai, **na ordem do documento**, blocos `h1`–`h4`, `blockquote`, `li`, `p` e `div` (tratado como parágrafo).
  - **`htmlFragmentToPlain`**: preserva quebras de `<br>` e fechos de bloco como novas linhas antes de remover tags; decodifica entidades; evita colapso excessivo de linhas em branco.
  - Listas: cada `<li>` vira um bloco com prefixo `•` (wrappers `<ul>`/`<ol>` são removidos no pré-processamento).
- **`contractPdfService.ts`**:
  - Margens **52 pt** (~18 mm), alinhado a folhas mais “respiradas”.
  - **Cabeçalho**: título maior (18 pt), mais `moveDown` após metadados; linha de secção antes do corpo com tipografia mais clara.
  - **Corpo**: loop por bloco com estilos distintos:
    - **h1–h4**: `Helvetica-Bold`, tamanhos 17 / 14.5 / 12.5 / 11.5 pt, `lineGap` próprio, `moveDown` após cada um.
    - **p**: `Helvetica` 11 pt, `lineGap` **4.6**, `align: 'justify'`, `moveDown` ~0,95 após cada parágrafo (espaço vertical entre cláusulas).
    - **li**: 11 pt, `lineGap` 4, indentação **20 pt**, `justify`.
    - **quote**: 10.5 pt, cor `#333`, indentação **16 pt**, `lineGap` 4.
  - **Fallback**: se não for possível extrair blocos úteis, mantém-se um caminho de texto plano (equivalente ao fluxo antigo) para não regressar em HTML atípico.
  - **Signatários**: título de secção 12.5 pt bold; mais `moveDown` entre signatários; imagem da assinatura com `fit: [200, 62]` e mais espaço após a miniatura.

## Line-height / espaçamento entre parágrafos

| Elemento | Fonte / tamanho | lineGap (pt) | Espaço após (moveDown) |
|----------|-----------------|--------------|-------------------------|
| h1 | Bold 17 | 3.2 | ~1.05 |
| h2 | Bold 14.5 | 3 | ~0.95 |
| h3 | Bold 12.5 | 2.8 | ~0.85 |
| h4 | Bold 11.5 | 2.6 | ~0.75 |
| p | Regular 11 | **4.6** | ~0.95 |
| li | Regular 11 | 4 | ~0.55 |
| quote | Regular 10.5 | 4 | ~0.85 |

## Headings, parágrafos e listas

- **Headings**: detetados por tags `<h1>`…`<h4>`; renderizados com tamanho decrescente e negrito.
- **Parágrafos / divs**: `<p>` e `<div>` geram blocos `p` (editores costumam usar ambos).
- **Listas**: `<li>` em sequência geram vários blocos `li` com bullet tipográfico.
- **Citações**: `<blockquote>` → bloco com indentação e cor mais suave.

## Impacto na secção de signatários / evidências

- Mais espaço antes do título da secção e entre cada signatário.
- Evidências (IP, UA, etc.) mantidas; `lineGap` ligeiramente aumentado.
- Imagem e-sign: `fit` ligeiramente maior (200×62) com mais `moveDown` após, para proporção mais próxima da pré-visualização web.

## Proximidade à view A4 pública

- A view usa **Georgia** e classes Tailwind/prose; o PDF mantém **Helvetica** (PDFKit padrão, sem fontes embutidas extra).
- A **hierarquia** (tamanhos de título, espaço entre parágrafos, listas indentadas, citação) foi alinhada ao espírito da folha A4, não a um pixel-perfect da web.

## Riscos remanescentes

- HTML muito aninhado ou inválido pode ainda ser interpretado de forma imperfeita (sem DOM completo).
- Tabelas complexas continuam a ser tratadas de forma rudimentar (texto residual entre tags).
- `div` genérico é tratado como parágrafo: layouts com muitos `div` vazios podem gerar blocos curtos extra (geralmente inócuos).

## Ficheiros alterados / novos

| Ficheiro | Função |
|----------|--------|
| `packages/backend/src/services/contractPdfBodyLayout.ts` | **Novo** — extração de blocos a partir do HTML do snapshot + fallback plano. |
| `packages/backend/src/services/contractPdfService.ts` | Margens, cabeçalho, linha separadora, renderização por bloco, secção de signatários. |
| `docs/CONTRATOS_AJUSTE_TIPOGRAFIA_PDF.md` | Este documento. |

## Checklist

- [x] Line-height do corpo do PDF mais confortável (`lineGap` 4.6 em `p`)
- [x] Parágrafos mais separados (`moveDown` após cada bloco `p`)
- [x] Cláusulas / títulos com melhor hierarquia (blocos `h1`–`h4` + bold + tamanhos)
- [x] PDF mais próximo da sensação da view A4 (hierarquia + espaçamento vertical)
- [x] Bloco de signatários / evidências com melhor espaçamento e imagem proporcional
- [x] Mesmo endpoint, mesma fonte de dados (snapshot), PDFKit preservado
