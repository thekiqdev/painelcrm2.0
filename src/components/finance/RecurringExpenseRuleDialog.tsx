import React, { useEffect, useState } from "react";
import {
  financialService,
  type FinancialRecurringExpenseDto,
  type FinancialAccountDto,
  type ExpenseCategoryDto,
} from "@/services/financial";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";

const PERIOD_LABEL: Record<string, string> = {
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
};

export type RecurringExpenseRuleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: FinancialRecurringExpenseDto | null;
  accounts: FinancialAccountDto[];
  categories: ExpenseCategoryDto[];
  onSaved: () => void;
};

export function RecurringExpenseRuleDialog(props: RecurringExpenseRuleDialogProps) {
  const { open, onOpenChange, editing, accounts, categories, onSaved } = props;
  const [saving, setSaving] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [periodicity, setPeriodicity] = useState<FinancialRecurringExpenseDto["periodicity"]>("monthly");
  const [dueDay, setDueDay] = useState("10");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [scheduleType, setScheduleType] = useState<"infinite" | "finite">("infinite");
  const [maxOcc, setMaxOcc] = useState("12");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setDescription(editing.description);
      setAmount(String(editing.amount_cents / 100));
      setCategoryId(editing.category_id);
      setAccountId(editing.default_account_id);
      setPeriodicity(editing.periodicity);
      setDueDay(String(editing.due_day));
      setStartDate(editing.start_date);
      setEndDate(editing.end_date ?? "");
      setScheduleType(editing.schedule_type);
      setMaxOcc(String(editing.max_occurrences ?? 12));
      setIsActive(editing.is_active);
    } else {
      setDescription("");
      setAmount("");
      setCategoryId(categories[0]?.id ?? "");
      setAccountId(accounts[0]?.id ?? "");
      setPeriodicity("monthly");
      setDueDay("10");
      setStartDate(new Date().toISOString().slice(0, 10));
      setEndDate("");
      setScheduleType("infinite");
      setMaxOcc("12");
      setIsActive(true);
    }
  }, [open, editing, accounts, categories]);

  const submit = async () => {
    const cents = Math.round(parseFloat(amount.replace(",", ".")) * 100);
    if (!description.trim()) {
      toast.error("Indique a descrição");
      return;
    }
    if (Number.isNaN(cents) || cents < 0) {
      toast.error("Valor inválido");
      return;
    }
    const dd = parseInt(dueDay, 10);
    if (Number.isNaN(dd)) {
      toast.error("Dia de vencimento inválido");
      return;
    }
    const w = periodicity === "weekly" || periodicity === "biweekly";
    if (w && (dd < 1 || dd > 7)) {
      toast.error("Semanal/quinzenal: use dia 1–7 (1=segunda … 7=domingo)");
      return;
    }
    if (!w && (dd < 1 || dd > 31)) {
      toast.error("Use dia do mês entre 1 e 31");
      return;
    }
    const endTrim = endDate.trim();
    if (endTrim && startDate && endTrim < startDate) {
      toast.error("A data de fim não pode ser anterior à data de início");
      return;
    }
    try {
      setSaving(true);
      const body = {
        description: description.trim(),
        amount_cents: cents,
        category_id: categoryId,
        default_account_id: accountId,
        periodicity,
        due_day: dd,
        start_date: startDate,
        end_date: endDate.trim() || null,
        schedule_type: scheduleType,
        max_occurrences: scheduleType === "finite" ? parseInt(maxOcc, 10) : null,
        is_active: isActive,
      };
      if (editing) {
        await financialService.updateRecurringExpense(editing.id, body);
        toast.success("Regra actualizada");
      } else {
        await financialService.createRecurringExpense(body);
        toast.success("Regra criada");
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar despesa recorrente" : "Nova despesa recorrente"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-2">
            <Label>Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Aluguel escritório" />
          </div>
          <div className="grid gap-2">
            <Label>Valor (R$)</Label>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Categoria</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Conta padrão</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Periodicidade</Label>
            <Select value={periodicity} onValueChange={(v) => setPeriodicity(v as FinancialRecurringExpenseDto["periodicity"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PERIOD_LABEL).map(([k, lab]) => (
                  <SelectItem key={k} value={k}>
                    {lab}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Dia de vencimento</Label>
            <Input value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Semanal/quinzenal: 1=segunda … 7=domingo. Mensal ou superior: dia do mês (1–31).
            </p>
          </div>
          <div className="grid gap-2">
            <Label>Data de início</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Data de fim (opcional)</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <div>
              <Label>Tipo</Label>
              <p className="text-xs text-muted-foreground">Infinito ou número fixo de vezes</p>
            </div>
            <Select value={scheduleType} onValueChange={(v) => setScheduleType(v as "infinite" | "finite")}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="infinite">Infinito</SelectItem>
                <SelectItem value="finite">Finito</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {scheduleType === "finite" ? (
            <div className="grid gap-2">
              <Label>Quantidade de ocorrências</Label>
              <Input value={maxOcc} onChange={(e) => setMaxOcc(e.target.value)} />
            </div>
          ) : null}
          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <Label htmlFor="rec-act">Activa</Label>
            <Switch id="rec-act" checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "A guardar…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
