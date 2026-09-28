import "../landingpage/landingpage.css";
import PublicNavbar from "./PublicNavbar";
import LandingPublicFooter from "./LandingPublicFooter";

export default function LandingLayoutPublic({ children }: { children: React.ReactNode }) {
  return (
    <div className="landing-page min-h-screen bg-background font-sans antialiased">
      <PublicNavbar />
      {children}
      <LandingPublicFooter />
    </div>
  );
}
