import LandingLayoutPublic from "./LandingLayoutPublic";
import Hero from "@/landingpage/components/Hero";
import Features from "@/landingpage/components/Features";
import HowItWorks from "@/landingpage/components/HowItWorks";
import Pricing from "@/landingpage/components/Pricing";
import CtaSection from "@/landingpage/components/CtaSection";

/** Conteúdo da home pública — sem AuthGuard nem bundle do CRM. */
export default function LandingStandalonePage() {
  return (
    <LandingLayoutPublic>
      <Hero />
      <Features />
      <HowItWorks />
      <Pricing />
      <CtaSection />
    </LandingLayoutPublic>
  );
}
