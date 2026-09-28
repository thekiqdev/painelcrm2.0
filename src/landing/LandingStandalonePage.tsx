import { Suspense, lazy } from "react";
import LandingLayoutPublic from "./LandingLayoutPublic";
import Hero from "@/landingpage/components/Hero";
import { DeferWhenVisible } from "./DeferWhenVisible";
import { LandingSectionSuspenseFallback } from "./LandingSectionSuspenseFallback";

const Features = lazy(() => import("@/landingpage/components/Features"));
const HowItWorks = lazy(() => import("@/landingpage/components/HowItWorks"));
const Pricing = lazy(() => import("@/landingpage/components/Pricing"));
const CtaSection = lazy(() => import("@/landingpage/components/CtaSection"));

/** Conteúdo da home pública — sem AuthGuard nem bundle do CRM. */
export default function LandingStandalonePage() {
  return (
    <LandingLayoutPublic>
      <Hero />
      <DeferWhenVisible minHeight="28rem">
        <Suspense fallback={<LandingSectionSuspenseFallback />}>
          <Features />
        </Suspense>
      </DeferWhenVisible>
      <DeferWhenVisible minHeight="22rem">
        <Suspense fallback={<LandingSectionSuspenseFallback />}>
          <HowItWorks />
        </Suspense>
      </DeferWhenVisible>
      <DeferWhenVisible minHeight="26rem">
        <Suspense fallback={<LandingSectionSuspenseFallback />}>
          <Pricing />
        </Suspense>
      </DeferWhenVisible>
      <DeferWhenVisible minHeight="14rem">
        <Suspense fallback={<LandingSectionSuspenseFallback />}>
          <CtaSection />
        </Suspense>
      </DeferWhenVisible>
    </LandingLayoutPublic>
  );
}
