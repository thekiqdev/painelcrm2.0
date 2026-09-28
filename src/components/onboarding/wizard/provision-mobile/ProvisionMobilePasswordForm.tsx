import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Props = {
  password: string;
  confirmPassword: string;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
};

export function ProvisionMobilePasswordForm({
  password,
  confirmPassword,
  onPasswordChange,
  onConfirmPasswordChange,
}: Props) {
  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
          Crie sua senha
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Essa senha será utilizada para acessar seu workspace.
        </p>
      </header>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="provision-password" className="text-sm text-muted-foreground">
            Senha
          </Label>
          <Input
            id="provision-password"
            type="password"
            autoComplete="new-password"
            className="h-11 border-white/10 bg-white/[0.03]"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="provision-confirm-password" className="text-sm text-muted-foreground">
            Confirmar senha
          </Label>
          <Input
            id="provision-confirm-password"
            type="password"
            autoComplete="new-password"
            className="h-11 border-white/10 bg-white/[0.03]"
            value={confirmPassword}
            onChange={(e) => onConfirmPasswordChange(e.target.value)}
          />
        </div>
      </div>
    </section>
  );
}
