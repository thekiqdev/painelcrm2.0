import React, { useEffect, useState } from "react";
import { financialService, type ExpenseCategoryDto } from "@/services/financial";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { FinanceMobileBottomBar, financeMobilePageBottomPad } from "@/components/finance/FinanceMobileBottomBar";
import { useFinanceBottomBarVisibility } from "@/contexts/FinanceMobileChromeContext";

const FinancialCategoriesPage = () => {
  const [rows, setRows] = useState<ExpenseCategoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  const load = () => {
    setLoading(true);
    financialService
      .listCategories()
      .then(setRows)
      .catch(() => {
        toast.error("Erro ao carregar categorias");
        setRows([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  useFinanceBottomBarVisibility(open);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Indique o nome");
      return;
    }
    try {
      setSaving(true);
      await financialService.createCategory({ name: name.trim() });
      toast.success("Categoria criada");
      setOpen(false);
      setName("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn("space-y-6", financeMobilePageBottomPad)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Categorias de despesa</h2>
          <p className="text-sm text-muted-foreground">
            Sugestões já vêm prontas; pode criar as suas para organizar melhor.
          </p>
        </div>
        <Button type="button" className="hidden md:inline-flex" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nova categoria
        </Button>
      </div>

      <FinanceMobileBottomBar
        actions={[
          {
            key: "nova-cat",
            label: "+ Nova categoria",
            variant: "primary",
            icon: Plus,
            onClick: () => setOpen(true),
            loading: saving && open,
          },
        ]}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Lista</CardTitle>
          <CardDescription>Utilizadas ao registar uma despesa</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">A carregar…</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {rows.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span className="font-medium">{c.name}</span>
                  {!c.tenant_id ? (
                    <Badge variant="secondary">Sugestão do sistema</Badge>
                  ) : (
                    <Badge variant="outline">Sua empresa</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova categoria</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="cat-name">Nome</Label>
            <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Combustível" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? "A guardar…" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FinancialCategoriesPage;
