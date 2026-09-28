import React, { useEffect, useState } from "react";
import { contractsService, type ContractMergeFieldCategory } from "@/services/contracts";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type Props = {
  onInsert: (placeholderKey: string) => void;
  className?: string;
  disabled?: boolean;
};

export function ContractMergeFieldsPanel({ onInsert, className, disabled }: Props) {
  const [categories, setCategories] = useState<ContractMergeFieldCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await contractsService.getContractMergeFieldCatalog();
        if (cancelled) return;
        setCategories(res.categories);
        setError(null);
      } catch {
        if (cancelled) return;
        setCategories(null);
        setError("Não foi possível carregar o catálogo de campos.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (!categories) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        A carregar campos…
      </div>
    );
  }

  return (
    <div className={className}>
      <Accordion type="multiple" className="w-full border rounded-md divide-y bg-muted/20">
        {categories.map((cat) => (
          <AccordionItem value={cat.id} key={cat.id} className="border-0 px-3">
            <AccordionTrigger className="text-sm font-medium py-3 hover:no-underline">
              {cat.title}
            </AccordionTrigger>
            <AccordionContent className="pb-3 pt-0">
              {cat.description ? (
                <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{cat.description}</p>
              ) : null}
              <ul className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {cat.fields.map((f) => (
                  <li
                    key={f.key}
                    className="rounded-md border bg-background/80 p-2 text-xs flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="font-medium text-foreground">{f.label}</div>
                      <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded break-all">{`{{${f.key}}}`}</code>
                      <p className="text-muted-foreground leading-snug">{f.description}</p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="shrink-0 h-8 text-xs"
                      disabled={disabled}
                      onClick={() => onInsert(f.key)}
                    >
                      Inserir
                    </Button>
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
