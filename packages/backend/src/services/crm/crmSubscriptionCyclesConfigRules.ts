/**
 * Sprint 2 — regras de patch de ciclos (CRM).
 * new_max >= max(max_atual, consumidos); ilimitado omite max.
 */

export type CyclesConfigPatchInput = {
  cycles_unlimited: boolean;
  max_cycles: number | null;
  current_unlimited: boolean;
  current_max_cycles: number | null;
  /** Ciclos com invoice_id (emitidos). */
  consumed: number;
};

export function assertCyclesConfigPatchAllowed(input: CyclesConfigPatchInput): void {
  const unlimited = input.cycles_unlimited;
  const maxCycles = unlimited ? null : input.max_cycles;
  const consumed = Math.max(0, Math.trunc(input.consumed));

  if (unlimited) return;

  if (maxCycles == null || !Number.isFinite(maxCycles) || maxCycles < 1) {
    throw new Error('max_cycles obrigatório e maior que zero quando cycles_unlimited é false');
  }

  const max = Math.trunc(maxCycles);
  if (max < consumed) {
    throw new Error(
      `max_cycles não pode ser inferior aos ciclos já emitidos (${consumed})`
    );
  }

  if (
    !input.current_unlimited &&
    input.current_max_cycles != null &&
    Number.isFinite(Number(input.current_max_cycles))
  ) {
    const currentMax = Math.trunc(Number(input.current_max_cycles));
    if (max < currentMax) {
      throw new Error(
        'Só é permitido aumentar a quantidade de ciclos (use Adicionar ciclos)'
      );
    }
  }
}
