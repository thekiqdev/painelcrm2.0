import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';

type Props = {
  title: string;
  /** Usuário autenticado: link para o painel; anônimo: login. */
  isLoggedIn: boolean;
};

/**
 * Header compacto do checkout (D2) — sem âncoras de marketing.
 */
export function CheckoutShellHeader({ title, isLoggedIn }: Props) {
  return (
    <div className="mx-auto flex h-12 w-full max-w-5xl items-center justify-between gap-3 px-4 sm:h-14 sm:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <Link to="/" className="flex shrink-0 items-center gap-2" aria-label="PainelCRM — início">
          <Logo size="sm" />
          <span className="font-display hidden text-base font-bold text-foreground sm:inline">
            PainelCRM
          </span>
        </Link>
        <span className="hidden h-4 w-px shrink-0 bg-border sm:block" aria-hidden />
        <h1 className="truncate text-sm font-semibold text-foreground sm:text-base">{title}</h1>
      </div>

      {isLoggedIn ? (
        <Button asChild variant="ghost" size="sm" className="shrink-0 text-muted-foreground">
          <Link to="/dashboard">Painel</Link>
        </Button>
      ) : (
        <Button asChild variant="ghost" size="sm" className="shrink-0 text-muted-foreground">
          <Link to="/login">Já tenho conta</Link>
        </Button>
      )}
    </div>
  );
}
