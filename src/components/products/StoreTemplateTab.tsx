import React, { useEffect, useState } from "react";
import { Check, LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StoreProfile, StorefrontThemeKey } from "@/types/products";
import { STOREFRONT_TEMPLATES } from "@/themes/registry";
import { productsService } from "@/services/products";
import { useToast } from "@/hooks/use-toast";

interface StoreTemplateTabProps {
  storeProfile: StoreProfile | null;
  onSuccess: (profile: StoreProfile) => void;
}

export function StoreTemplateTab({ storeProfile, onSuccess }: StoreTemplateTabProps) {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<StorefrontThemeKey>("default");
  const [saving, setSaving] = useState(false);

  const persistedKey = (() => {
    const k = storeProfile?.theme_key;
    if (k === "minimal" || k === "moderno" || k === "luzmodas") return k;
    return "default";
  })() as StorefrontThemeKey;

  useEffect(() => {
    setSelectedId(persistedKey);
  }, [persistedKey, storeProfile?.id]);

  const dirty = selectedId !== persistedKey;
  const canSave = Boolean(storeProfile) && dirty;

  const handleApply = async () => {
    if (!storeProfile) return;
    try {
      setSaving(true);
      const result = await productsService.updateStoreProfile({
        theme_key: selectedId,
        theme_options: {},
      });
      onSuccess(result);
      toast({
        title: "Template aplicado",
        description: "A vitrine pública passará a usar este layout.",
      });
    } catch (e) {
      console.error(e);
      toast({
        title: "Erro",
        description: "Não foi possível salvar o template.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!storeProfile) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        <LayoutTemplate className="mx-auto h-10 w-10 mb-3 opacity-50" />
        <p className="font-medium text-foreground">Crie a loja primeiro</p>
        <p className="text-sm mt-1">
          Use a aba <strong>Dados da loja</strong> para cadastrar nome e URL. Depois você poderá escolher o
          template aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium flex items-center gap-2">
          <LayoutTemplate className="h-4 w-4" />
          Template da vitrine
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Escolha o layout da loja pública. Todos os modelos são carregados do próprio sistema (código
          versionado) — sem conteúdo remoto arbitrário.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {STOREFRONT_TEMPLATES.map((t) => {
          const isSelected = selectedId === t.id;
          const isPersisted = persistedKey === t.id;

          return (
            <Card
              key={t.id}
              className={cn(
                "cursor-pointer transition-all hover:border-primary/50",
                isSelected && "ring-2 ring-primary border-primary/40"
              )}
              onClick={() => setSelectedId(t.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedId(t.id);
                }
              }}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{t.label}</CardTitle>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">/{t.id}</p>
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {isPersisted && (
                      <Badge variant="secondary" className="text-xs">
                        Atual na vitrine
                      </Badge>
                    )}
                    {isSelected && (
                      <Badge variant="default" className="text-xs">
                        Selecionado
                      </Badge>
                    )}
                  </div>
                </div>
                <CardDescription className="text-xs leading-relaxed pt-1">{t.shortDescription}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div
                  className={cn(
                    "h-24 rounded-md bg-gradient-to-br border flex items-end justify-start p-3 text-xs font-medium text-foreground/80",
                    t.previewClassName
                  )}
                >
                  Preview
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full mt-3"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId(t.id);
                  }}
                >
                  Usar este template
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border bg-muted/30 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {dirty ? (
            <>
              <span className="text-amber-600 dark:text-amber-500">Alterações não salvas</span>
            </>
          ) : (
            <span className="flex items-center gap-1 text-green-600 dark:text-green-500">
              <Check className="h-4 w-4" />
              Em sincronia com a vitrine
            </span>
          )}
        </div>
        <Button type="button" disabled={!canSave || saving} onClick={handleApply}>
          {saving ? "Salvando…" : "Salvar e aplicar na vitrine"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Opções avançadas por template (<code className="text-[10px]">theme_options</code>) podem ser
        evoluídas no futuro sem mudar o fluxo de escolha aqui.
      </p>
    </div>
  );
}
