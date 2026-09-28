/**
 * Deep-link legado → redireciona para /cadastro na etapa de ativação.
 */
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

export default function AcquisitionPremiumCheckoutPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    const q = new URLSearchParams();
    const lead = params.get('lead');
    const plan = params.get('plan');
    const users = params.get('users');
    if (lead) q.set('lead', lead);
    if (plan) q.set('plan', plan);
    if (users) q.set('users', users);
    q.set('step', 'conversion');
    navigate(`/cadastro?${q.toString()}`, { replace: true });
  }, [navigate, params]);

  return (
    <div className="dark flex min-h-[100dvh] items-center justify-center bg-[hsl(222,47%,5%)]">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
