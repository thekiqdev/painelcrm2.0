import { formatAppMoney } from "@/lib/i18n/formatApp";

export function formatFinancialAmount(cents: number, currency = "BRL"): string {
  return formatAppMoney(cents, currency);
}
