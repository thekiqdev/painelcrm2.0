# Frontend — padronização de notificações (Sonner)

## Posição final

- **`position="top-right"`** (Sonner), substituindo o padrão anterior de canto inferior.
- **`offset`**: `calc(4rem + 0.75rem + env(safe-area-inset-top, 0px))`
  - **4rem** = altura do header principal no `AppLayout` (`className="h-16"` → 64px em escala Tailwind padrão).
  - **0.75rem** (~12px) = margem entre o fim do header e o primeiro toast.
  - **`safe-area-inset-top`**: evita que o toast fique sob notch / barra de status em mobile.

Em telas **sem** o mesmo header (ex.: login, algumas rotas públicas), o deslocamento ainda mantém os toasts na zona superior direita, com o mesmo cálculo — comportamento aceitável e consistente com o restante do produto.

## Botão de fechar (×)

- Propriedade nativa do Sonner: **`closeButton`** no `<Toaster />` (boolean `true`).
- Estilo em `toastOptions.classNames.closeButton`: botão discreto, contraste em hover, sem borda pesada.
- O fechamento manual continua compatível com o **auto close** (dismiss remove o toast imediatamente).

## Duração (auto close)

**Abordagem:** duração **por tipo**, via wrapper em `src/components/ui/sonner.tsx` que reexporta `toast` com presets:

| Tipo / método        | ms   |
|----------------------|------|
| `toast.success`      | 3000 |
| `toast.warning`      | 4000 |
| `toast.error`        | 5000 |
| `toast.info`         | 4000 |
| `toast` / `message` (genérico) | 3500 |
| `toast.loading`      | **sem** preset (preserva duração da chamada; loading costuma ser indefinido até `dismiss`) |
| `toast.promise`      | repasse direto ao Sonner (durações do `PromiseData` quando informadas) |

Se a chamada passar **`duration`** explicitamente no objeto de opções, esse valor **prevalece** sobre o preset.

**Imports:** todos os usos de `import { toast } from "sonner"` no `src/` foram migrados para `import { toast } from "@/components/ui/sonner"` (exceto o próprio wrapper, que importa o Sonner internamente). Assim, o comportamento é único em todo o app.

## Empilhamento e UX

- **`visibleToasts={3}`**: no máximo três toasts visíveis na pilha (Sonner gerencia o restante).
- **`gap={10}`**: espaçamento entre itens.
- **`expand={false}`**: pilha mais compacta, menos intrusiva sobre o conteúdo.

## Arquivos principais

| Arquivo | Papel |
|---------|--------|
| `src/components/ui/sonner.tsx` | `Toaster` configurado + `toast` com durações por tipo + constante `TOAST_OFFSET_TOP`. |
| `src/App.tsx` | Continua montando `<Toaster />` (já existente). |
| Demais `src/**/*.tsx` e `.ts` | Import de `toast` apontando para `@/components/ui/sonner`. |

## Riscos remanescentes

- Layouts futuros com header de altura diferente de `h-16` exigem revisar `TOAST_OFFSET_TOP` (ou extrair variável CSS global alinhada ao header).
- Telas muito estreitas: toasts continuam à direita; se o conteúdo crítico estiver no canto superior direito, pode haver sobreposição pontual — mitigado pelo offset e pela pilha limitada.

## Checklist

- [x] Notificações no **topo direito**
- [x] Offset **abaixo do header** (`h-16` + margem + safe area)
- [x] Botão **(×)** / fechar manual (`closeButton`)
- [x] Auto close com tempos por tipo (sucesso / aviso / erro)
- [x] Menos interferência no rodapé e ações inferiores (posição superior)
- [x] Comportamento aplicável em desktop e mobile (safe area)
