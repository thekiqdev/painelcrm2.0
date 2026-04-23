/**
 * Âncora de data para inclusão de item na fatura principal de renovação CRM (D5/E2).
 * Quando E2 está desligado, itens com `scheduled_due_date` fora do `periodStart` do ciclo
 * não podem ficar sem cobrança: usamos a `due_date` da fatura anterior como âncora.
 */

export function resolveMainRenewalItemDue(args: {
  childInvoicesE2Enabled: boolean;
  scheduledDueDate: string | null;
  periodStart: string;
  prevInvoiceDueDate: string;
}): { excludedForE2ChildPath: boolean; itemDue: string } {
  const { childInvoicesE2Enabled, scheduledDueDate, periodStart, prevInvoiceDueDate } = args;
  if (childInvoicesE2Enabled && scheduledDueDate != null && scheduledDueDate !== periodStart) {
    return { excludedForE2ChildPath: true, itemDue: '' };
  }
  const itemDue =
    !childInvoicesE2Enabled && scheduledDueDate != null && scheduledDueDate !== periodStart
      ? prevInvoiceDueDate
      : scheduledDueDate ?? prevInvoiceDueDate;
  return { excludedForE2ChildPath: false, itemDue };
}
