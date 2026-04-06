import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import RegisterOrganizationWizard from "./RegisterOrganizationWizard";

/**
 * Rota /register — legado (wizard). Com VITE_REDIRECT_REGISTER_TO_CHECKOUT=true redireciona para /checkout.
 */
export default function Register() {
  const navigate = useNavigate();

  useEffect(() => {
    if (import.meta.env.VITE_REDIRECT_REGISTER_TO_CHECKOUT === "true") {
      navigate("/checkout", { replace: true });
    }
  }, [navigate]);

  if (import.meta.env.VITE_REDIRECT_REGISTER_TO_CHECKOUT === "true") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground text-sm">
        Redirecionando para o checkout…
      </div>
    );
  }

  return <RegisterOrganizationWizard />;
}
