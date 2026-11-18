import { useEffect, useRef } from "react";
import { clientsService } from "@/services/clients";
import { isValidCnpj } from "@/utils/cpfCnpj";
import type { CnpjLookupResult } from "@/utils/cnpjLookup";

const BLUR_WAIT_MS = 400;

/**
 * Depois que o CNPJ fecha, espera um instante e consulta.
 * Trocar o número cancela a consulta anterior. Falha não altera o formulário.
 */
export function useCnpjAutofill(apply: (found: CnpjLookupResult) => void): {
  onCnpjBlur: (cnpj: string) => void;
  cancelCnpjLookup: () => void;
} {
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const ticketRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelCnpjLookup = () => {
    ticketRef.current += 1;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => cancelCnpjLookup, []);

  const onCnpjBlur = (cnpj: string) => {
    cancelCnpjLookup();
    const digits = String(cnpj ?? "").replace(/\D/g, "");
    if (!isValidCnpj(digits)) return;
    const ticket = ticketRef.current;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void clientsService.lookupCnpj(digits).then(
        (found) => {
          if (ticket !== ticketRef.current) return;
          applyRef.current(found);
        },
        () => {
          /* Consulta fora do ar: os campos ficam como estão. */
        },
      );
    }, BLUR_WAIT_MS);
  };

  return { onCnpjBlur, cancelCnpjLookup };
}
