import { useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Braces } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  collectKnownVariableKeys,
  getChatbotFlowVariableCategories,
  templateVariableToken,
  type TemplateVariableDefinition,
} from '../lib/variablesCatalog';
import {
  extractTemplateTokens,
  type FlowDefinedVariable,
} from '../lib/flowDefinedVariables';

type Props = {
  id?: string;
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  multiline?: boolean;
  className?: string;
  hint?: string;
  /** Classe no input/textarea (ex. font-mono). */
  inputClassName?: string;
  /** Variáveis criadas nos nós deste flow (aparecem em “Neste flow”). */
  flowVariables?: FlowDefinedVariable[];
  /**
   * Layout compacto (ex. Value em Fields): input + ícone {{ }} na mesma linha.
   * Esconde o label visual.
   */
  inline?: boolean;
};

function insertKeyForField(f: TemplateVariableDefinition): string {
  if (f.dynamic && f.aliases?.[0]) return f.aliases[0];
  return f.key;
}

function insertAtCursor(
  el: HTMLTextAreaElement | HTMLInputElement,
  token: string,
  current: string,
  onChange: (v: string) => void
) {
  const start = el.selectionStart ?? current.length;
  const end = el.selectionEnd ?? current.length;
  const next = current.slice(0, start) + token + current.slice(end);
  onChange(next);
  requestAnimationFrame(() => {
    const pos = start + token.length;
    el.focus();
    el.setSelectionRange(pos, pos);
  });
}

/** Campo de texto com botão para inserir variáveis do catálogo + do flow. */
export function VariableTextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  multiline = true,
  className,
  hint,
  inputClassName,
  flowVariables = [],
  inline = false,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const categories = useMemo(
    () => getChatbotFlowVariableCategories(flowVariables),
    [flowVariables]
  );
  const knownKeys = useMemo(
    () => collectKnownVariableKeys(flowVariables),
    [flowVariables]
  );
  const tokensInValue = useMemo(() => extractTemplateTokens(value), [value]);
  const unknownTokens = tokensInValue.filter((t) => !knownKeys.has(t));

  const activeEl = (): HTMLTextAreaElement | HTMLInputElement | null =>
    multiline && !inline ? textareaRef.current : inputRef.current;

  const picker = (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {inline ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            title="Inserir variável"
            aria-label="Inserir variável"
          >
            <Braces className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs">
            <Braces className="h-3.5 w-3.5" />
            Variáveis
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="border-b px-3 py-2">
          <p className="text-sm font-medium">Inserir variável</p>
          <p className="text-[11px] text-muted-foreground">
            Clique para colar <code>{'{{chave}}'}</code> no cursor
          </p>
        </div>
        <div className="max-h-72 space-y-3 overflow-auto p-3">
          {categories.map((cat) => (
            <section key={cat.id}>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {cat.title}
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {cat.fields.map((f) => {
                  const key = insertKeyForField(f);
                  const token = templateVariableToken(key);
                  return (
                    <button
                      key={`${cat.id}-${f.key}`}
                      type="button"
                      title={f.description}
                      className={cn(
                        'rounded-md border bg-background px-2 py-1 text-left text-[11px] hover:border-primary/40 hover:bg-muted/50',
                        cat.id === 'flow_defined' &&
                          'border-violet-200 bg-violet-50/80 dark:border-violet-800 dark:bg-violet-950/30'
                      )}
                      onClick={() => {
                        const el = activeEl();
                        if (el) insertAtCursor(el, token, value, onChange);
                        else onChange(value + token);
                        setOpen(false);
                      }}
                    >
                      <span className="font-medium">{f.label}</span>
                      <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                        {token}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );

  if (inline) {
    return (
      <div className={cn('flex min-w-0 flex-1 flex-col gap-0.5', className)}>
        <div className="flex min-w-0 gap-1">
          <Input
            id={id}
            ref={inputRef as RefObject<HTMLInputElement>}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            aria-label={typeof label === 'string' ? label : 'Valor'}
            className={cn('h-8 min-w-0 flex-1 font-mono text-[11px]', inputClassName)}
          />
          {picker}
        </div>
        {unknownTokens.length > 0 ? (
          <p className="text-[10px] text-amber-700 dark:text-amber-400">
            Desconhecida:{' '}
            {unknownTokens.map((t) => (
              <code key={t} className="mr-1 font-mono">
                {`{{${t}}}`}
              </code>
            ))}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {picker}
      </div>
      {multiline ? (
        <Textarea
          id={id}
          ref={textareaRef as RefObject<HTMLTextAreaElement>}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={inputClassName}
        />
      ) : (
        <Input
          id={id}
          ref={inputRef as RefObject<HTMLInputElement>}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={inputClassName}
        />
      )}
      {unknownTokens.length > 0 ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          Variável não encontrada neste flow:{' '}
          {unknownTokens.map((t) => (
            <code key={t} className="mr-1 font-mono text-[10px]">
              {`{{${t}}}`}
            </code>
          ))}
          — confira o nome ou crie no nó Pergunta / HTTP / Set variável.
        </p>
      ) : null}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
