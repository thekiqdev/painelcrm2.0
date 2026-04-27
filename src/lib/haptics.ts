/** Vibração curta em dispositivos que suportam (geralmente Android). */
export function lightHaptic(): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(12);
    }
  } catch {
    /* ignore */
  }
}
