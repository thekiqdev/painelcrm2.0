/**
 * Helpers de UX — Pix Automático default ON na 1ª fatura de checkout.
 * OFF persistido (status cleared/cancelled/…) não reaplica default ON.
 */
import { useEffect, useRef, useState } from 'react';

export type PixAutoPrefLike = {
  available: boolean;
  switch_on: boolean;
  status: string | null;
  has_active: boolean;
  user_opted_off?: boolean;
};

export function isPixAutomaticUserOptedOff(status: string | null | undefined): boolean {
  return (
    status === 'cancelled' ||
    status === 'cleared' ||
    status === 'refused' ||
    status === 'expired'
  );
}

/**
 * Estado de UI do switch:
 * - pending/active → ON
 * - cleared/cancelled/… (opt-out) → OFF (persistido)
 * - sem status (1º acesso) + defaultOn → ON
 */
export function resolvePixAutomaticSwitchOn(opts: {
  pref: PixAutoPrefLike | null | undefined;
  /** Opt-out otimista na sessão (antes do refresh). */
  userOptedOff?: boolean;
  defaultOn: boolean;
}): boolean {
  if (opts.userOptedOff) return false;
  if (!opts.pref?.available) return false;
  if (opts.pref.user_opted_off || isPixAutomaticUserOptedOff(opts.pref.status)) return false;
  if (
    opts.pref.switch_on ||
    opts.pref.has_active ||
    opts.pref.status === 'pending' ||
    opts.pref.status === 'requested'
  ) {
    return true;
  }
  // 1º acesso: ainda sem status na assinatura
  if (opts.pref.status == null || opts.pref.status === '') return opts.defaultOn;
  return false;
}

/**
 * Dispara enable uma vez quando default ON e ainda não há auth / opt-out.
 */
export function usePixAutomaticAutoEnable(opts: {
  enabled: boolean;
  pref: PixAutoPrefLike | null | undefined;
  userOptedOff?: boolean;
  canEnable: boolean;
  enableFn: () => Promise<boolean>;
}): { enabling: boolean } {
  const [enabling, setEnabling] = useState(false);
  const triedRef = useRef(false);
  const enableFnRef = useRef(opts.enableFn);
  enableFnRef.current = opts.enableFn;

  useEffect(() => {
    if (!opts.enabled || opts.userOptedOff || !opts.canEnable) return;
    if (!opts.pref?.available) return;
    if (opts.pref.user_opted_off || isPixAutomaticUserOptedOff(opts.pref.status)) return;
    if (opts.pref.switch_on || opts.pref.has_active || opts.pref.status === 'pending') return;
    if (opts.pref.status === 'requested') return;
    // Só auto-enable no 1º acesso (sem status)
    if (opts.pref.status != null && opts.pref.status !== '') return;
    if (triedRef.current) return;
    triedRef.current = true;
    setEnabling(true);
    void (async () => {
      try {
        const ok = await enableFnRef.current();
        if (!ok) triedRef.current = false;
      } finally {
        setEnabling(false);
      }
    })();
  }, [
    opts.enabled,
    opts.userOptedOff,
    opts.canEnable,
    opts.pref?.available,
    opts.pref?.switch_on,
    opts.pref?.has_active,
    opts.pref?.status,
    opts.pref?.user_opted_off,
  ]);

  return { enabling };
}
