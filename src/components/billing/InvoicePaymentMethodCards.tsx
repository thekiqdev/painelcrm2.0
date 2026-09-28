import { CheckCircle2, CreditCard, QrCode, Barcode, Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { InvoicePaymentMethodUi } from "@/lib/crmGatewayPaymentMethods";

type Method = InvoicePaymentMethodUi;

const METHOD_META: Array<{
  value: Method;
  label: string;
  Icon: typeof QrCode;
}> = [
  { value: "PIX", label: "PIX", Icon: QrCode },
  { value: "CREDIT_CARD", label: "Cartão", Icon: CreditCard },
  { value: "BOLETO", label: "Boleto", Icon: Barcode },
];

type InvoicePaymentMethodCardsProps = {
  gatewayEnabledMethods: Method[];
  selected: Method[];
  onChange: (next: Method[]) => void;
  /** Pix Automático ao lado do cartão PIX (assinatura). */
  pixAutomatic?: {
    available: boolean;
    checked: boolean;
    onCheckedChange: (v: boolean) => void;
  } | null;
  className?: string;
};

export function InvoicePaymentMethodCards({
  gatewayEnabledMethods,
  selected,
  onChange,
  pixAutomatic = null,
  className,
}: InvoicePaymentMethodCardsProps) {
  const options = METHOD_META.filter((m) => gatewayEnabledMethods.includes(m.value));

  const toggle = (value: Method) => {
    const isOn = selected.includes(value);
    if (isOn) {
      if (selected.length <= 1) return;
      onChange(selected.filter((m) => m !== value));
      return;
    }
    onChange(selected.includes(value) ? selected : [...selected, value]);
  };

  if (options.length === 0) {
    return (
      <p className="text-xs text-amber-700 dark:text-amber-300">
        Nenhum método ativo no gateway. Configure em Pagamentos antes de emitir cobrança com link.
      </p>
    );
  }

  const pixSelected = selected.includes("PIX");
  const showPixAuto = pixSelected && pixAutomatic?.available === true;

  return (
    <div className={cn("space-y-3", className)}>
      <div
        className={cn(
          "grid gap-2.5",
          options.length >= 3 ? "grid-cols-3" : options.length === 2 ? "grid-cols-2" : "grid-cols-1",
        )}
      >
        {options.map(({ value, label, Icon }) => {
          const active = selected.includes(value);
          return (
            <button
              key={value}
              type="button"
              onClick={() => toggle(value)}
              aria-pressed={active}
              className={cn(
                "relative flex min-h-[4.75rem] flex-col items-center justify-center gap-1.5 rounded-xl border-2 px-2 py-3 text-center transition-colors",
                active
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border/80 bg-background hover:border-border hover:bg-muted/30",
              )}
            >
              {active ? (
                <CheckCircle2 className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-primary" aria-hidden />
              ) : null}
              <Icon
                className={cn("h-5 w-5", active ? "text-primary" : "text-muted-foreground")}
                aria-hidden
              />
              <span className={cn("text-sm font-semibold", active && "text-foreground")}>{label}</span>
            </button>
          );
        })}
      </div>

      {showPixAuto ? (
        <div
          className={cn(
            "flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 transition-colors",
            pixAutomatic.checked
              ? "border-primary/40 bg-primary/5"
              : "border-border/80 bg-muted/20",
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <Label
              htmlFor="crm_pix_automatic"
              className="cursor-pointer text-sm font-medium leading-none"
            >
              Pix automático
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="O que é Pix automático?"
                >
                  <Info className="h-3.5 w-3.5" aria-hidden />
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="start"
                className="z-[280] w-[min(18rem,calc(100vw-2rem))] border-border bg-popover p-3 text-sm shadow-lg"
              >
                <p className="font-medium text-foreground">Pix automático</p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  Cobranças seguintes são debitadas automaticamente do cliente via PIX, após a
                  autorização no primeiro pagamento.
                </p>
              </PopoverContent>
            </Popover>
          </div>
          <Switch
            id="crm_pix_automatic"
            checked={pixAutomatic.checked}
            onCheckedChange={(v) => pixAutomatic.onCheckedChange(v === true)}
            className="shrink-0"
          />
        </div>
      ) : null}
    </div>
  );
}
