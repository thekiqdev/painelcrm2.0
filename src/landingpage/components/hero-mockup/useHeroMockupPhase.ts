import { useEffect, useState } from "react";

/** 6 fases do loop + estado estático para reduced-motion */
export const HERO_MOCKUP_PHASE_COUNT = 6;
export const HERO_MOCKUP_INTERVAL_MS = 3000;

export function useHeroMockupPhase(): {
  phase: number;
  reducedMotion: boolean;
} {
  const [phase, setPhase] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const fn = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const id = window.setInterval(() => {
      setPhase((p) => (p + 1) % HERO_MOCKUP_PHASE_COUNT);
    }, HERO_MOCKUP_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [reducedMotion]);

  return {
    phase: reducedMotion ? HERO_MOCKUP_PHASE_COUNT - 1 : phase,
    reducedMotion,
  };
}
