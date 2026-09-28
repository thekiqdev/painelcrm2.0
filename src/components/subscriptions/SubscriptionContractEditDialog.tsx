import React, { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CrmSubscriptionBillingInterval } from "@/services/crmSubscriptions";

const BILLING_INTERVAL_OPTIONS: Array<{ value: CrmSubscriptionBillingInterval; label: string }> = [
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensal" },
  { value: "quarterly", label: "Trimestral" },
  { value: "semi_annual", label: "Semestral" },
  { value: "yearly", label: "Anual" },
];

export type SubscriptionContractModalPreset = "upgrade" | "downgrade" | "edit";

function parseReaisToCents(value: string): number | null {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function ContractChangeAssistant({
  currentAmountCents,
  currentInterval,
  newAmountInput,
  newInterval,
}: {
  currentAmountCents: number;
  currentInterval: string;
  newAmountInput: string;
  newInterval: CrmSubscriptionBillingInterval;
}) {
  const newCents = parseReaisToCents(newAmountInput);
  const intervalChanged = newInterval !== currentInterval;
  const currentIntervalLabel =
    BILLING_INTERVAL_OPTIONS.find((o) => o.value === currentInterval)?.label ?? currentInterval;
  const newIntervalLabel =
    BILLING_INTERVAL_OPTIONS.find((o) => o.value === newInterval)?.label ?? newInterval;

  if (newCents == null) return null;

  const isUpgrade = newCents > currentAmountCents;
  const isDowngrade = newCents < currentAmountCents;

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-3 text-sm space-y-2",
        isUpgrade && "border-emerald-500/30 bg-emerald-500/5",
        isDowngrade && "border-amber-500/30 bg-amber-500/5",
        !isUpgrade && !isDowngrade && intervalChanged && "border-sky-500/30 bg-sky-500/5"
      )}
    >
      {isUpgrade ? (
        <div className="flex items-start gap-2 text-emerald-800 dark:text-emerald-300">
          <ArrowUp className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
          <div>
            <p className="font-medium">Upgrade</p>
            <p className="text-xs opacity-90">Esta alteração aumenta a receita recorrente.</p>
          </div>
        </div>
      ) : null}
      {isDowngrade ? (
        <div className="flex items-start gap-2 text-amber-900 dark:text-amber-200">
          <ArrowDown className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
          <div>
            <p className="font-medium">Downgrade</p>
            <p className="text-xs opacity-90">Esta alteração reduzirá a receita recorrente.</p>
          </div>
        </div>
      ) : null}
      {intervalChanged ? (
        <p className="text-xs text-muted-foreground">
          Periodicidade:{" "}
          <span className="font-medium text-foreground">
            {currentIntervalLabel} → {newIntervalLabel}
          </span>
        </p>
      ) : null}
    </div>
  );
}

export function SubscriptionContractEditDialog({
  open,
  onOpenChange,
  preset,
  currentAmountCents,
  currentInterval,
  initialDescription,
  canSave,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preset: SubscriptionContractModalPreset;
  currentAmountCents: number;
  currentInterval: CrmSubscriptionBillingInterval;
  initialDescription: string;
  canSave: boolean;
  saving: boolean;
  onSave: (body: {
    amount_cents: number;
    billing_interval: CrmSubscriptionBillingInterval;
    description: string;
    effective_at: "immediate" | "next_cycle";
    reason?: string;
  }) => Promise<void>;
}) {
  const [amount, setAmount] = React.useState("");
  const [interval, setInterval] = React.useState<CrmSubscriptionBillingInterval>("monthly");
  const [description, setDescription] = React.useState("");
  const [effectiveAt, setEffectiveAt] = React.useState<"immediate" | "next_cycle">("immediate");
  const [reason, setReason] = React.useState("");

  useEffect(() => {
    if (!open) return;
    setAmount((currentAmountCents / 100).toFixed(2).replace(".", ","));
    setInterval(currentInterval);
    setDescription(initialDescription);
    setReason("");
    setEffectiveAt(preset === "downgrade" ? "next_cycle" : "immediate");
  }, [open, preset, currentAmountCents, currentInterval, initialDescription]);

  const title = useMemo(() => {
    if (preset === "upgrade") return "Upgrade de assinatura";
    if (preset === "downgrade") return "Downgrade de assinatura";
    return "Editar assinatura";
  }, [preset]);

  const handleSave = async () => {
    const amountCents = parseReaisToCents(amount);
    if (amountCents == null) return;
    const desc = description.trim();
    if (!desc) return;
    await onSave({
      amount_cents: amountCents,
      billing_interval: interval,
      description: desc,
      effective_at: effectiveAt,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Altere valor, periodicidade e descrição. Faturas pagas não são modificadas.
            {preset === "upgrade" ? " Upgrades costumam vigorar imediatamente." : null}
            {preset === "downgrade" ? " Downgrades podem ser agendados para o próximo ciclo." : null}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <ContractChangeAssistant
            currentAmountCents={currentAmountCents}
            currentInterval={currentInterval}
            newAmountInput={amount}
            newInterval={interval}
          />
          <div className="space-y-2">
            <Label htmlFor="contract_amount">Valor (R$)</Label>
            <Input
              id="contract_amount"
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contract_interval">Periodicidade</Label>
            <Select value={interval} onValueChange={(v) => setInterval(v as CrmSubscriptionBillingInterval)}>
              <SelectTrigger id="contract_interval">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BILLING_INTERVAL_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contract_description">Descrição</Label>
            <Input
              id="contract_description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: Plano Pro"
            />
          </div>
          <div className="space-y-2">
            <Label>Vigência</Label>
            <RadioGroup
              value={effectiveAt}
              onValueChange={(v) => setEffectiveAt(v as "immediate" | "next_cycle")}
              className="gap-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="immediate" id="contract_immediate" />
                <Label htmlFor="contract_immediate" className="font-normal cursor-pointer">
                  Imediata (próximas faturas)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="next_cycle" id="contract_next_cycle" />
                <Label htmlFor="contract_next_cycle" className="font-normal cursor-pointer">
                  Próximo ciclo
                </Label>
              </div>
            </RadioGroup>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contract_reason">Motivo (opcional)</Label>
            <Textarea
              id="contract_reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: upgrade comercial acordado com o cliente"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSave()} disabled={!canSave || saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
