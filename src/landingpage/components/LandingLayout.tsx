import "../landingpage.css";
import Navbar from "./Navbar";
import Footer from "./Footer";

interface LandingLayoutProps {
  children: React.ReactNode;
}

/**
 * Layout padrão da home/landing: Navbar + conteúdo + Footer.
 * Usado na landing page e em páginas como checkout para manter o mesmo visual.
 */
const LandingLayout = ({ children }: LandingLayoutProps) => {
  return (
    <div className="landing-page min-h-screen bg-background font-sans antialiased">
      <Navbar />
      {children}
      <Footer />
    </div>
  );
};

export default LandingLayout;
